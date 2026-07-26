import type { PageContent } from "../Types";

export const intro: PageContent = {
  navTitle: "介绍",
  title: "介绍",
  description: "Yar's DeepSeek Copilot 介绍。",
  lead: "Yar's DeepSeek Copilot 设计上仅支持 DeepSeek，在 VS Code 中提供专注的助手体验，不提供供应商切换。",
  sections: [
    {
      title: "当前 beta 范围",
      items: [
        "侧边栏聊天会以时间顺序流式呈现响应、推理和工具调用。",
        "Thinking mode 可以开启或关闭，而不会禁用工具。",
        "Default 会确认每个工具，read-only 自动批准非修改工具，auto-approve 委托工作区内操作，full-access 允许不受限制的访问，custom 支持单独控制工具。",
        "仅输入 ./ 才会显示安全路径自动补全；自动上下文、Git、指令、终端和工具都使用同一个不可变逻辑工作区快照。",
        "设置和全局历史记录保存在 ~/.yrs-dpsk-copilot/ 下，支持可配置保留期、原生删除确认和撤销。",
      ],
    },
    {
      title: "非官方关系",
      items: [
        "这是一个独立的第三方扩展，不隶属于 DeepSeek，也不由 DeepSeek 认可、赞助或官方维护。",
      ],
    },
  ],
};
