import type { TranslationCatalog } from "../Types";

export const tools = {
  tools: {
    permissionMode: "权限模式",
    savedGloballyForAllWorkspaces: "为所有工作区全局保存。",
    toolPermissions: "工具权限",
    noToolsAreAvailable: "没有可用工具。",
    noToolsTheModelCanOnlyAnswerInChat: "无工具，模型只能在聊天中回答。",
    readOnlyDescription: "读取文件、列出目录并搜索工作区内容。",
    fullAccessDescription: "所有已启用的工具（包括终端命令）都会立即执行，不显示确认提示。",
    chat: "聊天",
    readOnly: "只读",
    fullAccess: "完全访问",
    disabled: "已禁用",
    enabled: "已启用",
    autoApprove: "自动批准",
    autoApproveModeDescription: "非终端工具可能立即执行。只有被证明为只读且位于工作区内的终端命令才会自动执行。",
    autoApproveWarning: "启用全局自动批准？非终端工具可能立即执行。终端没有操作系统沙箱，未被证明为只读且位于工作区内的命令仍需确认。",
    blockedByModePermissionMode: "被 {mode} 权限模式阻止",
    nameMode: "{name} 模式",
    toolCalls: "工具调用",
    toolCall: "工具调用",
    pending: "待处理",
    awaitingConfirmation: "等待确认",
    running: "运行中",
    completed: "已完成",
    error: "错误",
    rejected: "已拒绝",
    cancelled: "已取消",
    copyCall: "复制调用",
    copyToolData: "复制 {tool} 数据",
    copy: "复制",
    insert: "插入",
    copyArguments: "复制参数",
    copyResult: "复制结果",
    labelCopied: "已复制{label}。"
  }
} satisfies TranslationCatalog;
