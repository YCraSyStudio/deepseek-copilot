import { validatePublicWebUrl } from "./NetworkPolicy";

export const MAX_DOCUMENT_CHARS = 64 * 1024;
export const MAX_WEB_RESPONSE_CHARS = 8 * 1024;
const MAX_OUTLINE_ITEMS = 24;
const MAX_LINKS = 12;

export interface NormalizedWebDocument {
  title: string;
  url: string;
  content: string;
  outline: string[];
  links: Array<{ title: string; url: string }>;
  sourceCharacters: number;
}

export function extractSemanticDocument(
  snapshot: string,
  fallbackUrl: string,
): NormalizedWebDocument {
  const title = cleanText(/(?:^|\n)Page Title:\s*([^\n]+)/i.exec(snapshot)?.[1] ?? "Web page").slice(0, 300);
  const reportedUrl = /(?:^|\n)(?:Page )?URL:\s*(https:\/\/[^\s\n]+)/i.exec(snapshot)?.[1];
  const url = validatePublicWebUrl(reportedUrl ?? fallbackUrl).toString();
  const sourceLines = snapshot.split(/\r?\n/);
  const lines = selectMainContent(sourceLines);
  const output: string[] = [];
  const outline: string[] = [];
  const links: Array<{ title: string; url: string }> = [];
  const seenLines = new Set<string>();
  const seenLinks = new Set<string>();
  let skippedIndent: number | undefined;

  const push = (value: string): void => {
    const cleaned = cleanText(value);
    if (!cleaned) {return;}
    const key = cleaned.toLowerCase();
    if (seenLines.has(key)) {return;}
    seenLines.add(key);
    output.push(cleaned);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {continue;}
    const indent = leadingWhitespace(line);
    if (skippedIndent !== undefined) {
      if (indent > skippedIndent) {continue;}
      skippedIndent = undefined;
    }

    const role = parseRole(line);
    if (!role) {continue;}
    if (isSuppressedRole(role.name)) {
      skippedIndent = indent;
      continue;
    }

    if (role.name === "heading") {
      const heading = role.label ?? role.trailing;
      if (heading) {
        const level = Number(/\[level=(\d+)\]/i.exec(line)?.[1] ?? 2);
        const formatted = `${"#".repeat(Math.min(6, Math.max(1, level)))} ${heading}`;
        push(formatted);
        if (outline.length < MAX_OUTLINE_ITEMS) {outline.push(cleanText(heading));}
      }
      continue;
    }

    if (role.name === "row") {
      const cells = collectDescendantValues(lines, index, indent, new Set(["cell", "columnheader", "rowheader"]));
      if (cells.length > 0) {push(`| ${cells.join(" | ")} |`);}
      skippedIndent = indent;
      continue;
    }

    if (role.name === "code" || role.name === "pre") {
      const code = [role.label ?? role.trailing, ...collectDescendantValues(lines, index, indent, new Set(["text", "generic"]))]
        .filter((value): value is string => Boolean(value));
      if (code.length > 0) {push(`\`\`\`\n${code.join("\n")}\n\`\`\``);}
      continue;
    }

    if (role.name === "link") {
      const label = role.label ?? role.trailing;
      const linkUrl = collectDescendantUrl(lines, index, indent, url);
      if (label && linkUrl && links.length < MAX_LINKS && !seenLinks.has(linkUrl) && !isNoiseLink(label, linkUrl)) {
        seenLinks.add(linkUrl);
        links.push({ title: cleanText(label).slice(0, 160), url: linkUrl });
      }
      continue;
    }

    if (role.name === "button") {
      const label = role.label ?? role.trailing;
      if (label && /(?:^|\b)v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?(?:\b|$)/i.test(label)) {push(label);}
      skippedIndent = indent;
      continue;
    }

    if (role.name === "text" || role.name === "paragraph") {
      push(role.label ?? role.trailing ?? "");
      continue;
    }

    if (role.name === "listitem") {
      const value = role.label ?? role.trailing;
      if (value) {push(`- ${value}`);}
      continue;
    }

    if (role.name === "generic" || role.name === "cell" || role.name === "term" || role.name === "definition") {
      const value = role.label ?? role.trailing;
      if (value && isUsefulInlineText(value)) {push(value);}
    }
  }

  const content = output.join("\n\n").slice(0, MAX_DOCUMENT_CHARS);
  return { title, url, content, outline, links, sourceCharacters: snapshot.length };
}

export function selectDocumentContent(
  document: NormalizedWebDocument,
  cursor = 0,
  query?: string,
  maxChars = 6_500,
): { content: string; cursor: number; nextCursor?: number } {
  if (query) {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter((term) => term.length >= 2);
    const blocks = document.content.split(/\n\n+/);
    const ranked = blocks.map((block, index) => ({
      block,
      index,
      score: terms.reduce((score, term) => score + countOccurrences(block.toLocaleLowerCase(), term), 0),
    })).filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const selected: string[] = [];
    let length = 0;
    for (const entry of ranked) {
      if (length + entry.block.length + 2 > maxChars) {continue;}
      selected.push(entry.block);
      length += entry.block.length + 2;
    }
    return { content: selected.join("\n\n") || "No matching passages found.", cursor: 0 };
  }

  const safeCursor = Math.min(Math.max(0, cursor), document.content.length);
  const end = Math.min(document.content.length, safeCursor + maxChars);
  return {
    content: document.content.slice(safeCursor, end),
    cursor: safeCursor,
    nextCursor: end < document.content.length ? end : undefined,
  };
}

function selectMainContent(lines: string[]): string[] {
  const mainIndex = lines.findIndex((line) => /^\s*-\s*main(?:\s|:|\[|$)/i.test(line));
  if (mainIndex < 0) {
    const snapshotIndex = lines.findIndex((line) => /^Snapshot:\s*$/i.test(line.trim()));
    return lines.slice(snapshotIndex >= 0 ? snapshotIndex + 1 : 0);
  }
  const indent = leadingWhitespace(lines[mainIndex] ?? "");
  let end = lines.length;
  for (let index = mainIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() && leadingWhitespace(line) <= indent) {end = index; break;}
  }
  return lines.slice(mainIndex + 1, end);
}

function parseRole(line: string): { name: string; label?: string; trailing?: string } | undefined {
  const match = /^\s*-\s*([a-z]+)(?:\s+"((?:\\"|[^"])*)")?[^:]*?(?::\s*(.*))?$/i.exec(line);
  if (!match) {return undefined;}
  const trailing = match[3]?.trim();
  return {
    name: (match[1] ?? "").toLowerCase(),
    label: match[2] ? cleanText(match[2].replace(/\\"/g, "\"")) : undefined,
    trailing: trailing && !/^(?:\[ref=|$)/.test(trailing) ? cleanText(trailing) : undefined,
  };
}

function collectDescendantValues(lines: string[], index: number, indent: number, roles: Set<string>): string[] {
  const values: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] ?? "";
    if (line.trim() && leadingWhitespace(line) <= indent) {break;}
    const role = parseRole(line);
    if (role && roles.has(role.name)) {
      const value = role.label ?? role.trailing;
      if (value) {values.push(value);}
    }
  }
  return [...new Set(values)];
}

function collectDescendantUrl(lines: string[], index: number, indent: number, baseUrl: string): string | undefined {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] ?? "";
    if (line.trim() && leadingWhitespace(line) <= indent) {break;}
    const raw = /(?:\/url|url|href):\s*["']?([^"'\s]+)["']?/i.exec(line)?.[1];
    if (!raw) {continue;}
    try {return validatePublicWebUrl(new URL(raw, baseUrl).toString()).toString();} catch {return undefined;}
  }
  return undefined;
}

function isSuppressedRole(role: string): boolean {
  return new Set([
    "banner", "navigation", "complementary", "contentinfo", "footer", "dialog", "tooltip",
    "form", "search", "searchbox", "combobox", "option", "img", "separator", "status",
  ]).has(role);
}

function isUsefulInlineText(value: string): boolean {
  return value.length >= 2 && value.length <= 2_000 &&
    !/^(?:generic|main|list|table|rowgroup|none)$/i.test(value) &&
    !/^(?:dark mode|light mode|change language|menu|feedback)$/i.test(value);
}

function isNoiseLink(title: string, url: string): boolean {
  return /^(?:skip to|menu|home|privacy|terms|contact|support|sign in|log in|github|youtube|x|linkedin|tiktok|threads|bluesky)/i.test(title) ||
    /(?:privacy|login|signin|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com|threads\.net|bsky\.app)/i.test(url);
}

function cleanText(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function leadingWhitespace(value: string): number {
  return /^\s*/.exec(value)?.[0].length ?? 0;
}

function countOccurrences(value: string, term: string): number {
  let count = 0;
  let cursor = 0;
  while ((cursor = value.indexOf(term, cursor)) >= 0) {count += 1; cursor += term.length;}
  return count;
}
