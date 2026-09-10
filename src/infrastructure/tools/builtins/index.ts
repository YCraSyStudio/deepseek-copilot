import type { RegisteredTool, ToolEffect } from "@/application/tools/Types";
import { readFileDefinition, readFileHandler, readFileMetadata } from "./fileSystem/ReadFile";
import { readFunctionDefinition, readFunctionHandler, readFunctionMetadata } from "./fileSystem/ReadFunction";
import { searchContentDefinition, searchContentHandler, searchContentMetadata } from "./fileSystem/SearchContent";
import { listDirDefinition, listDirHandler, listDirMetadata } from "./fileSystem/ListDir";
import { listWorkspaceDefinition, listWorkspaceHandler, listWorkspaceMetadata } from "./fileSystem/ListWorkspace";
import { createFileDefinition, createFileHandler, createFileMetadata, createFileHandlerForced } from "./fileSystem/CreateFile";
import { editFileDefinition, editFileHandler, editFileMetadata, editFileHandlerForced } from "./fileSystem/EditFile";
import { applyPatchDefinition, applyPatchHandler, applyPatchMetadata, applyPatchHandlerForced } from "./fileSystem/ApplyPatch";
import { terminalCommandDefinition, terminalCommandHandler, terminalCommandMetadata, terminalCommandHandlerForced } from "./terminal/TerminalCommand";
import { compactContextDefinition, compactContextHandler, compactContextMetadata } from "./context/CompactContext";

/** Complete list of built-in tools. */
export const BUILT_IN_TOOLS: RegisteredTool[] = [
  withEffect({ definition: compactContextDefinition, handler: compactContextHandler, metadata: compactContextMetadata }, "read-only"),
  withEffect({ definition: readFileDefinition, handler: readFileHandler, metadata: readFileMetadata }, "read-only"),
  withEffect({ definition: readFunctionDefinition, handler: readFunctionHandler, metadata: readFunctionMetadata }, "read-only"),
  withEffect({ definition: searchContentDefinition, handler: searchContentHandler, metadata: searchContentMetadata }, "read-only"),
  withEffect({ definition: listDirDefinition, handler: listDirHandler, metadata: listDirMetadata }, "read-only"),
  withEffect({ definition: listWorkspaceDefinition, handler: listWorkspaceHandler, metadata: listWorkspaceMetadata }, "read-only"),
  withEffect({ definition: createFileDefinition, handler: createFileHandler, forcedHandler: createFileHandlerForced, metadata: createFileMetadata }, "workspace-mutation"),
  withEffect({ definition: editFileDefinition, handler: editFileHandler, forcedHandler: editFileHandlerForced, metadata: editFileMetadata }, "workspace-mutation"),
  withEffect({ definition: applyPatchDefinition, handler: applyPatchHandler, forcedHandler: applyPatchHandlerForced, metadata: applyPatchMetadata }, "workspace-mutation"),
  withEffect({ definition: terminalCommandDefinition, handler: terminalCommandHandler, forcedHandler: terminalCommandHandlerForced, metadata: terminalCommandMetadata }, "workspace-mutation"),
];

function withEffect(tool: RegisteredTool, effect: ToolEffect): RegisteredTool {
  return {
    ...tool,
    metadata: {
      ...tool.metadata,
      effect,
    },
  };
}
