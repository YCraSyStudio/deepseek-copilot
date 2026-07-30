import type { RegisteredTool } from "../Types";
import { readFileDefinition, readFileHandler, readFileMetadata } from "./fileSystem/ReadFile";
import { searchContentDefinition, searchContentHandler, searchContentMetadata } from "./fileSystem/SearchContent";
import { listDirDefinition, listDirHandler, listDirMetadata } from "./fileSystem/ListDir";
import { createFileDefinition, createFileHandler, createFileMetadata, createFileHandlerForced } from "./fileSystem/CreateFile";
import { editFileDefinition, editFileHandler, editFileMetadata, editFileHandlerForced } from "./fileSystem/EditFile";
import { applyPatchDefinition, applyPatchHandler, applyPatchMetadata, applyPatchHandlerForced } from "./fileSystem/ApplyPatch";
import { terminalCommandDefinition, terminalCommandHandler, terminalCommandMetadata, terminalCommandHandlerForced } from "./terminal/TerminalCommand";

/** Complete list of built-in tools. */
export const BUILT_IN_TOOLS: RegisteredTool[] = [
  { definition: readFileDefinition, handler: readFileHandler, metadata: readFileMetadata },
  { definition: searchContentDefinition, handler: searchContentHandler, metadata: searchContentMetadata },
  { definition: listDirDefinition, handler: listDirHandler, metadata: listDirMetadata },
  { definition: createFileDefinition, handler: createFileHandler, metadata: createFileMetadata },
  { definition: editFileDefinition, handler: editFileHandler, metadata: editFileMetadata },
  { definition: applyPatchDefinition, handler: applyPatchHandler, metadata: applyPatchMetadata },
  { definition: terminalCommandDefinition, handler: terminalCommandHandler, metadata: terminalCommandMetadata },
];

/** Forced handlers used after explicit user confirmation. */
export const FORCED_HANDLERS: Record<string, RegisteredTool["handler"]> = {
  create_file: createFileHandlerForced,
  edit_file: editFileHandlerForced,
  apply_patch: applyPatchHandlerForced,
  run_terminal_command: terminalCommandHandlerForced,
};
