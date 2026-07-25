import type { PageContent } from "../Types";

export const changelog: PageContent = {
  navTitle: "更新日志",
  title: "更新日志",
  description: "重要变更和预览状态。",
  lead: "0.1.2 版本新增隔离的并发生成、按会话队列、可恢复 checkpoint 和更安全的工作区执行。",
  sections: [
    {
      title: "0.1.2 生成任务协调",
      items: [
        "每个会话最多运行一个生成任务，不同会话的并发数可配置为 1 到 16，默认值为 8。",
        "新增 Queue message 和 Interrupt and guide 控件、定向取消，以及绑定到生成任务的流式和工具事件。",
        "新增原子生成 checkpoint；重启后可恢复部分输出、取消未完成工具，并将排队提示作为草稿提供。",
        "引入带生成任务归属的会话 schema v2，并在激活时对有效旧历史或部分迁移历史执行经过验证的迁移；兼容逻辑会保留到计划的清理版本发布。",
        "每个生成任务固定到其会话工作区；变更类工具按工作区串行执行，只读工作可并发进行。",
        "新增协调式 provider 关闭流程，在扩展停用时保存 checkpoint、取消活动任务并刷新写入。",
      ],
    },
    {
      title: "0.1.1 可靠性和安全性",
      items: [
        "以原生的推理、内容和工具组时间线替换文本控制标记。",
        "统一工具状态，并修复拒绝、取消、宿主确认、过期 pending 调用、重复调用和最大轮数终止。",
        "加入真正的进程树取消和结构化非交互终端结果，并提供有界输出及平台感知的危险分析。",
        "强化 SSE、响应验证、URL 拼接、超时、遵守 Retry-After 的重试，以及 React 流批处理。",
        "将设置和历史记录迁移到 ~/.yrs-dpsk-copilot/。历史记录每个会话使用一个经过验证的 JSON 文件，不再依赖单独索引。",
        "加入多根工作区会话关联、上下文裁剪、Git staged 上下文、二进制检测、分隔引用、AGENTS.md 限制和乐观文件哈希。",
        "修复历史删除：删除当前会话会清空 Chat 视图，删除其他会话则保留当前聊天。",
        "完成无障碍和 UX 改进：模态框焦点管理、可控自动滚动、流式生成期间的草稿、本地化 UI、工作区权限、可恢复设置和分页历史记录。",
      ],
    },
    {
      title: "0.1.0 预览版",
      items: [
        "引入分层源代码架构、React 聊天 webview、History、Settings、工具配置、路径自动补全和 Marketplace 打包。",
        "产品专注于 DeepSeek，并将 API key 保存到 VS Code Secret Storage。",
      ],
    },
  ],
};
