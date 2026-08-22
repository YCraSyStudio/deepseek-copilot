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
        "推理和工具会保持在紧凑的可展开 Activity 组中；文件工具可在原生编辑器中打开受影响文件或该次记录的精确变更。",
        "Thinking mode 可以开启或关闭，而不会禁用工具。",
        "DeepSeek V4 Vision (Flash) 可直接读取上传的图像；V4 Pro 可调用 analyze_images，接收 Vision 生成的文本描述。",
        "统一的附件操作同时支持上下文文件和 JPEG、PNG、GIF、WebP 图像，也可使用 Ctrl+V 或 Cmd+V 粘贴图像。",
        "Default 会确认每个工具；auto-approve 自动执行常规操作并确认提权操作；full-access 只确认可能大范围损坏计算机的关键操作。",
        "仅输入 ./ 才会显示安全路径自动补全；自动上下文、Git、指令、终端和工具都使用同一个不可变逻辑工作区快照。",
        "设置和全局历史记录保存在 ~/.yrs-dpsk-copilot/ 下，支持可配置保留期、原生删除确认和撤销。",
        "显式 Stop 会将已提交提示、部分 timeline 和已完成工具结果保留为 cancelled 轮次。Steering 会安全重启传输，但会按最新指导明确继续原始任务，并隐藏误导性的中断警告。",
        "API 凭据按来源隔离存储在 VS Code Secret Storage 中，绝不会返回给 webview；Settings 只显示遮罩占位符预览。",
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
