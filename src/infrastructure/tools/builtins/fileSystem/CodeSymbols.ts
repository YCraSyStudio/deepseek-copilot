import * as path from "path";

export type CodeSymbolKind =
  | "function"
  | "method"
  | "arrow"
  | "class"
  | "interface"
  | "struct"
  | "enum"
  | "trait"
  | "impl"
  | "module"
  | "type";

export interface CodeSymbol {
  /** Name as written in its own declaration. */
  name: string;
  /** Name qualified by its enclosing chain, for example `ToolCallCycle.run`. */
  qualifiedName: string;
  /** Qualified name of the enclosing declaration, when there is one. */
  container?: string;
  /** Receiver type reported by a language that qualifies methods that way. */
  containerHint?: string;
  kind: CodeSymbolKind;
  /** Containers can be requested on their own and expose a member outline. */
  isContainer: boolean;
  /** 1-based inclusive line range of the declaration. */
  startLine: number;
  endLine: number;
  /** Single-line declaration text, without the body. */
  signature: string;
}

type LanguageFamily = "script" | "typed" | "go" | "rust" | "python";

interface SymbolPattern {
  kind: CodeSymbolKind;
  container: boolean;
  regex: RegExp;
  /** Capture group holding the declaration name. */
  nameGroup?: number;
  /** Capture group holding the leading indentation, used by indentation-scoped languages. */
  indentGroup?: number;
  /** Capture group holding a receiver whose type qualifies the name, as in Go methods. */
  receiverGroup?: number;
}

const LANGUAGE_FAMILIES: Record<string, LanguageFamily> = {
  ts: "script",
  tsx: "script",
  mts: "script",
  cts: "script",
  js: "script",
  jsx: "script",
  mjs: "script",
  cjs: "script",
  java: "typed",
  cs: "typed",
  c: "typed",
  h: "typed",
  cc: "typed",
  cpp: "typed",
  cxx: "typed",
  hpp: "typed",
  kt: "typed",
  kts: "typed",
  swift: "typed",
  scala: "typed",
  dart: "typed",
  php: "typed",
  go: "go",
  rs: "rust",
  py: "python",
};

/**
 * Declarations that only look like a function signature. Control-flow statements
 * are the main false positive of a brace-scanning parser, so they are rejected by
 * name instead of by a full grammar.
 */
const RESERVED_NAMES = new Set([
  "if", "else", "for", "foreach", "while", "do", "switch", "case", "default", "catch", "finally",
  "try", "return", "throw", "new", "delete", "typeof", "instanceof", "await", "yield", "with",
  "using", "lock", "fixed", "checked", "unchecked", "assert", "super", "this", "base", "loop",
  "when", "where", "then", "sizeof", "namespace", "package", "extends", "implements", "import",
  "export", "require", "include", "operator", "defer", "lambda", "select", "struct", "enum",
]);

const SCRIPT_DECLARATIONS: SymbolPattern[] = [
  {
    kind: "function",
    container: false,
    regex: /^[ \t]*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "class",
    container: true,
    regex: /^[ \t]*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "interface",
    container: true,
    regex: /^[ \t]*(?:export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "enum",
    container: true,
    regex: /^[ \t]*(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "type",
    container: false,
    regex: /^[ \t]*(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>\n]*>)?=/gm,
  },
  {
    kind: "arrow",
    container: false,
    regex: /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]{1,120})?=(?!=)[ \t]*(?:async\s*)?[^;\n]{0,80}?\([^()\n]{0,120}\)\s*(?::[^=\n]{0,120})?=>/gm,
  },
  {
    kind: "function",
    container: false,
    regex: /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]{1,120})?=(?!=)[ \t]*(?:async\s+)?function\s*\*?/gm,
  },
  {
    kind: "class",
    container: true,
    regex: /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*class\b/gm,
  },
];

const TYPED_METHOD_PREFIX =
  "(?:(?:public|private|protected|internal|static|async|abstract|virtual|override|sealed|readonly|partial|extern|unsafe|new|final|synchronized|native|constexpr|const|inline|mut|pub|open|suspend|operator)\\s+)*";

const TYPED_METHOD_CORE =
  "(?:[A-Za-z_][\\w.<>\\[\\]?*&:]*\\s+)?([A-Za-z_]\\w*)\\s*(?:<[^<>\\n]{1,80}>)?\\s*\\([^()]{0,600}\\)\\s*(?:const\\s*)?(?::[^{\\n;=]{0,120})?\\s*(?:\\{|=>)";

const TYPED_MEMBERS: SymbolPattern[] = [
  { kind: "method", container: false, regex: new RegExp(`^[ \\t]*${TYPED_METHOD_PREFIX}${TYPED_METHOD_CORE}`, "gm") },
];

/** Class fields that hold an arrow function, which has no declaration keyword. */
const FIELD_ARROW_MEMBERS: SymbolPattern[] = [
  {
    kind: "arrow",
    container: false,
    regex: /^[ \t]*(?:(?:public|private|protected|readonly|static|declare|override|abstract)\s+)*([A-Za-z_$][\w$]*)\s*(?::[^=\n]{1,120})?=(?!=)\s*(?:async\s*)?(?:\([^()\n]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=\n]{0,120})?=>/gm,
  },
];

const SCRIPT_MEMBERS: SymbolPattern[] = [
  {
    kind: "method",
    container: false,
    regex: /^[ \t]*(?:(?:public|private|protected|static|readonly|abstract|override|declare|async|get|set|accessor)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^<>\n]{1,80}>)?\s*\([^()\n]{0,400}\)\s*(?::[^{\n;=]{0,120})?\s*(?:\{|=>|;)/gm,
  },
  ...FIELD_ARROW_MEMBERS,
];

const TYPED_DECLARATIONS: SymbolPattern[] = [
  {
    kind: "function",
    container: false,
    regex: /^[ \t]*(?:[A-Za-z_]\w*\s+)*(?:function|fun|func|fn|def|sub|proc)\s+([A-Za-z_]\w*)/gm,
  },
  {
    kind: "class",
    container: true,
    regex: /^[ \t]*(?:@[\w.]+\s*)*(?:(?:public|private|protected|internal|static|abstract|sealed|final|partial|export|declare|open|data|value|inner|readonly|unsafe)\s+)*(?:class|record)\s+([A-Za-z_]\w*)/gm,
  },
  {
    kind: "interface",
    container: true,
    regex: /^[ \t]*(?:(?:public|private|protected|internal|sealed|partial|export|declare)\s+)*(?:interface|trait|protocol)\s+([A-Za-z_]\w*)/gm,
  },
  {
    kind: "struct",
    container: true,
    regex: /^[ \t]*(?:(?:public|private|protected|internal|partial|export|declare|unsafe)\s+)*(?:struct|union)\s+([A-Za-z_]\w*)/gm,
  },
  {
    kind: "enum",
    container: true,
    regex: /^[ \t]*(?:(?:public|private|protected|internal|partial|export|declare|sealed)\s+)*(?:enum|namespace|object|module)\s+([A-Za-z_]\w*)/gm,
  },
  { kind: "method", container: false, regex: new RegExp(`^${TYPED_METHOD_PREFIX}${TYPED_METHOD_CORE}`, "gm") },
];

const GO_DECLARATIONS: SymbolPattern[] = [
  { kind: "method", container: false, nameGroup: 2, receiverGroup: 1, regex: /^[ \t]*func\s*\(([^)\n]*)\)\s*([A-Za-z_]\w*)\s*\(/gm },
  { kind: "function", container: false, regex: /^[ \t]*func\s+([A-Za-z_]\w*)\s*\(/gm },
  { kind: "struct", container: true, regex: /^[ \t]*type\s+([A-Za-z_]\w*)\s+struct\b/gm },
  { kind: "interface", container: true, regex: /^[ \t]*type\s+([A-Za-z_]\w*)\s+interface\b/gm },
  { kind: "type", container: false, regex: /^[ \t]*type\s+([A-Za-z_]\w*)\s+/gm },
];

const RUST_DECLARATIONS: SymbolPattern[] = [
  { kind: "function", container: false, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/gm },
  { kind: "impl", container: true, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?impl(?:<[^>]*>)?\s+(?:[^;{\n]*?\sfor\s+)?([A-Za-z_][\w:]*)/gm },
  { kind: "struct", container: true, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/gm },
  { kind: "enum", container: true, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)/gm },
  { kind: "trait", container: true, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)/gm },
  { kind: "module", container: true, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)/gm },
  { kind: "type", container: false, regex: /^[ \t]*(?:pub(?:\s*\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)/gm },
];

const PYTHON_DECLARATIONS: SymbolPattern[] = [
  { kind: "function", container: false, indentGroup: 1, nameGroup: 2, regex: /^([ \t]*)(?:async\s+)?def\s+([A-Za-z_]\w*)/gm },
  { kind: "class", container: true, indentGroup: 1, nameGroup: 2, regex: /^([ \t]*)class\s+([A-Za-z_]\w*)/gm },
];

interface Candidate {
  name: string;
  kind: CodeSymbolKind;
  isContainer: boolean;
  /** 0-based declaration line. */
  line: number;
  /** Content index of the opening brace, or -1 when the declaration has no brace. */
  bodyStart: number;
  /** Content index of the terminating ';' when the declaration has no brace. */
  statementEnd: number;
  containerHint?: string;
}

export function detectLanguageId(filePath: string): string | undefined {
  const extension = path.extname(filePath).replace(".", "").toLowerCase();
  return extension in LANGUAGE_FAMILIES ? extension : undefined;
}

/** Line endings are normalized so every line index and content index agree. */
export function normalizeSource(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function splitSourceLines(content: string): string[] {
  return normalizeSource(content).replace(/\r\n?/g, "\n").split("\n");
}

/** Extracts declarations with their line ranges, ordered by position and nesting. */
export function extractSymbols(content: string, languageId: string): CodeSymbol[] {
  const family = LANGUAGE_FAMILIES[languageId];
  if (!family) {
    return [];
  }
  const source = normalizeSource(content).replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const offsets = new LineOffsets(source);
  const candidates =
    family === "python"
      ? collectCandidates(source, offsets, PYTHON_DECLARATIONS)
      : collectCandidates(source, offsets, declarationsFor(family));

  const symbols = dedupe(candidates.map((candidate) => toSymbol(source, lines, offsets, candidate, family)));
  if (family === "python") {
    return qualify(symbols);
  }

  const memberCandidates = collectCandidates(source, offsets, memberPatternsFor(family));
  const members: CodeSymbol[] = [];
  for (const container of symbols.filter((symbol) => symbol.isContainer)) {
    const memberIndent = minimumIndent(lineRange(lines, container.startLine, container.endLine));
    if (memberIndent === undefined) {
      continue;
    }
    for (const candidate of memberCandidates) {
      if (candidate.line < container.startLine || candidate.line >= container.endLine) {
        continue;
      }
      const indentation = indentOf(lines[candidate.line] ?? "");
      if (indentation < memberIndent || indentation > memberIndent + 2) {
        continue;
      }
      members.push(toSymbol(source, lines, offsets, candidate, family));
    }
  }
  return qualify(dedupe([...symbols, ...members]));
}

/** Resolves a name, a dotted chain, or a `::` chain against the extracted symbols. */
export function matchSymbols(symbols: readonly CodeSymbol[], requested: string): CodeSymbol[] {
  const query = requested.replace(/\s+/g, "");
  if (!query) {
    return [];
  }
  const segments = query.split(/[.:#>/\\]+/).filter(Boolean);
  if (segments.length === 0) {
    return [];
  }
  const tail = segments[segments.length - 1]!;
  const chain = segments.join(".");

  const exact = symbols.filter((symbol) => symbol.qualifiedName === query || symbol.qualifiedName === chain);
  if (exact.length > 0) {
    return exact;
  }
  if (segments.length > 1) {
    const suffix = symbols.filter((symbol) => symbol.qualifiedName.endsWith(`.${chain}`));
    if (suffix.length > 0) {
      return suffix;
    }
  }
  const byName = symbols.filter((symbol) => symbol.name === tail);
  if (byName.length > 0) {
    return byName;
  }
  const caseInsensitive = symbols.filter((symbol) => symbol.name.toLowerCase() === tail.toLowerCase());
  return caseInsensitive;
}

/** Returns the direct members of a container, which is what an outline reports. */
export function containerMembers(symbols: readonly CodeSymbol[], container: string): CodeSymbol[] {
  return symbols.filter((symbol) => symbol.container === container);
}

function declarationsFor(family: LanguageFamily): SymbolPattern[] {
  switch (family) {
    case "go":
      return GO_DECLARATIONS;
    case "rust":
      return RUST_DECLARATIONS;
    case "typed":
      return TYPED_DECLARATIONS;
    default:
      return SCRIPT_DECLARATIONS;
  }
}

function memberPatternsFor(family: LanguageFamily): SymbolPattern[] {
  return family === "script" ? SCRIPT_MEMBERS : TYPED_MEMBERS;
}

function collectCandidates(source: string, offsets: LineOffsets, patterns: SymbolPattern[]): Candidate[] {
  const candidates: Candidate[] = [];
  const claimedLines = new Set<number>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern.regex)) {
      const index = match.index ?? 0;
      const name = match[pattern.nameGroup ?? 1] ?? "";
      const line = offsets.lineAt(index);
      if (!name || RESERVED_NAMES.has(name) || claimedLines.has(line)) {
        continue;
      }
      const boundary = findBodyBoundary(source, index + match[0].length);
      candidates.push({
        name,
        kind: pattern.kind,
        isContainer: pattern.container,
        line,
        bodyStart: boundary.bodyStart,
        statementEnd: boundary.statementEnd,
        ...(pattern.receiverGroup ? { containerHint: receiverTypeName(match[pattern.receiverGroup] ?? "") } : {}),
      });
      claimedLines.add(line);
    }
  }
  return candidates;
}

function toSymbol(source: string, lines: string[], offsets: LineOffsets, candidate: Candidate, family: LanguageFamily): CodeSymbol {
  const startLine = candidate.line + 1;
  let endLine = startLine;
  let signatureLine = candidate.line;

  if (family === "python") {
    endLine = pythonBlockEnd(lines, candidate.line);
  } else if (candidate.bodyStart >= 0) {
    const closeIndex = findBraceBlockEnd(source, candidate.bodyStart);
    endLine = closeIndex < 0 ? lines.length : offsets.lineAt(closeIndex) + 1;
    signatureLine = offsets.lineAt(candidate.bodyStart);
  } else if (candidate.statementEnd >= 0) {
    endLine = offsets.lineAt(candidate.statementEnd) + 1;
  }

  return {
    name: candidate.name,
    qualifiedName: candidate.name,
    kind: candidate.kind,
    isContainer: candidate.isContainer,
    startLine,
    endLine,
    signature: buildSignature(lines, candidate.line, signatureLine),
  };
}

function buildSignature(lines: string[], startLine: number, lastLine: number): string {
  const text = lines
    .slice(startLine, Math.min(lastLine, startLine + 3) + 1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

function pythonBlockEnd(lines: string[], declarationLine: number): number {
  const declarationIndent = indentOf(lines[declarationLine] ?? "");
  let end = declarationLine;
  for (let line = declarationLine + 1; line < lines.length; line += 1) {
    const text = lines[line] ?? "";
    if (!text.trim() || text.trim().startsWith("#")) {
      continue;
    }
    if (indentOf(text) <= declarationIndent) {
      break;
    }
    end = line;
  }
  return end + 1;
}

function qualify(symbols: CodeSymbol[]): CodeSymbol[] {
  const sorted = [...symbols].sort(
    (left, right) => left.startLine - right.startLine || right.endLine - left.endLine || left.name.localeCompare(right.name),
  );
  const stack: CodeSymbol[] = [];
  const byName = new Map<string, CodeSymbol>();
  return sorted.map((symbol) => {
    while (stack.length > 0 && stack[stack.length - 1]!.endLine < symbol.startLine) {
      stack.pop();
    }
    const enclosing = stack[stack.length - 1];
    const hinted = symbol.containerHint ? byName.get(symbol.containerHint) : undefined;
    const parent = enclosing ?? (hinted && hinted.endLine < symbol.startLine ? hinted : undefined);
    const resolved: CodeSymbol = parent
      ? { ...symbol, container: parent.qualifiedName, qualifiedName: `${parent.qualifiedName}.${symbol.name}` }
      : symbol;
    stack.push(resolved);
    byName.set(resolved.qualifiedName, resolved);
    if (!byName.has(resolved.name)) {
      byName.set(resolved.name, resolved);
    }
    return resolved;
  });
}

function dedupe(symbols: CodeSymbol[]): CodeSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.startLine}:${symbol.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function receiverTypeName(receiver: string): string | undefined {
  const match = receiver.replace(/\[[^\]]*\]/g, "").match(/([A-Za-z_]\w*)\s*$/);
  return match?.[1];
}

function lineRange(lines: string[], startLine: number, endLine: number): string[] {
  return lines.slice(startLine, Math.max(endLine - 1, startLine));
}

function minimumIndent(lines: string[]): number | undefined {
  let minimum: number | undefined;
  for (const line of lines) {
    const text = line.trim();
    if (!text || text.startsWith("//") || text.startsWith("*") || text.startsWith("/*")) {
      continue;
    }
    const indentation = indentOf(line);
    minimum = minimum === undefined ? indentation : Math.min(minimum, indentation);
  }
  return minimum;
}

function indentOf(line: string): number {
  const match = line.match(/^[ \t]*/);
  return match ? match[0].length : 0;
}

class LineOffsets {
  private readonly starts: number[] = [0];

  constructor(source: string) {
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") {
        this.starts.push(index + 1);
      }
    }
  }

  lineAt(index: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.starts[middle]! <= index) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }
}

interface BodyBoundary {
  bodyStart: number;
  statementEnd: number;
}

const BOUNDARY_LINE_LIMIT = 20;
const BOUNDARY_CHARACTER_LIMIT = 4000;

function findBodyBoundary(source: string, from: number): BodyBoundary {
  let lineBreaks = 0;
  for (let index = from; index < source.length && index - from < BOUNDARY_CHARACTER_LIMIT; index += 1) {
    const char = source[index];
    if (char === "\n") {
      lineBreaks += 1;
      if (lineBreaks > BOUNDARY_LINE_LIMIT) {
        break;
      }
      continue;
    }
    if (char === "{") {
      return { bodyStart: index, statementEnd: -1 };
    }
    if (char === ";") {
      return { bodyStart: -1, statementEnd: index };
    }
    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      index = skipQuoted(source, index, char);
    }
  }
  return { bodyStart: -1, statementEnd: -1 };
}

/** Returns the index of the matching closing brace, or -1 when the body never closes. */
export function findBraceBlockEnd(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === "/" && char !== source[index - 1] && startsRegexLiteral(source, index)) {
      index = skipRegexLiteral(source, index);
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      index = skipQuoted(source, index, char);
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth <= 0) {
        return index;
      }
    }
  }
  return -1;
}

function skipLineComment(source: string, index: number): number {
  const end = source.indexOf("\n", index);
  return end === -1 ? source.length - 1 : end - 1;
}

function skipBlockComment(source: string, index: number): number {
  const end = source.indexOf("*/", index + 2);
  return end === -1 ? source.length - 1 : end + 1;
}

function skipQuoted(source: string, index: number, quote: string): number {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (char === quote) {
      return cursor;
    }
    if (char === "\n" && quote !== "`") {
      return cursor - 1;
    }
  }
  return source.length - 1;
}

function startsRegexLiteral(source: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = source[cursor]!;
    if (char === " " || char === "\t" || char === "\n") {
      continue;
    }
    return !/[\w$)\]}"'`]/.test(char);
  }
  return true;
}

function skipRegexLiteral(source: string, index: number): number {
  let inCharacterClass = false;
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (char === "\n") {
      // Not a regex literal: a division is scanned character by character instead.
      return index;
    }
    if (char === "[") {
      inCharacterClass = true;
      continue;
    }
    if (char === "]") {
      inCharacterClass = false;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      return cursor;
    }
  }
  return source.length - 1;
}
