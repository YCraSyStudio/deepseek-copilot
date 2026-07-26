import type { TranslationCatalog } from "../Types";

export const tools = {
  tools: {
    permissionMode: "权限模式",
    toolPermissions: "工具权限",
    noToolsAreAvailable: "没有可用工具。",
    defaultDescription: "所有工具均可用，并在执行前请求确认。",
    readOnlyDescription: "读取、列出和搜索会自动执行；写入和终端工具会请求确认。",
    customDescription: "单独配置每个工具：禁用、需要确认或自动批准。",
    fullAccessDescription: "所有工具都可以在计算机上的任何位置运行，且无需确认。",
    default: "默认",
    readOnly: "只读",
    custom: "自定义",
    fullAccess: "完全访问",
    disabled: "已禁用",
    enabled: "已启用",
    autoApprove: "自动批准",
    autoApproveModeDescription: "所有工具在工作区内自动执行；访问工作区外部仍需确认。",
    fullAccessWarning: "启用全局完全访问？工具可以在无需确认的情况下读取、修改或删除此计算机上的任何文件。终端没有操作系统沙箱。",
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
