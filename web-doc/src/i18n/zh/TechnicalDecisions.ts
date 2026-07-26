import type { PageContent } from "../Types";

export const technicalDecisions: PageContent = {
  navTitle: "技术决策",
  title: "技术决策",
  description: "架构、持久化、流式传输和执行方面的决策。",
  lead: "扩展将领域状态、DeepSeek 传输、VS Code 能力和 React 渲染分离，使安全规则在扩展宿主中保持权威。",
  sections: [
    {
      title: "分层边界",
      items: [
        "core 负责与供应商无关的会话、上下文和工具领域逻辑，不导入 React 或具体 HTTP 客户端。",
        "deepseekApi 负责请求、响应验证、SSE 解析、有限重试和工具调用编排。",
        "vscodeApi 负责密钥、工作区访问、存储、命令、终端进程、确认以及宿主与 webview 的通信。",
        "ui 负责 React webview，只有收到宿主消息后才会更改权威工具状态。",
      ],
    },
    {
      title: "按时间排序的事件模型",
      items: [
        "助手输出以类型化的推理、内容和工具组事件持久化，而不是将控制标记嵌入文本。",
        "实时流和恢复的历史记录使用同一 timeline 契约，保留 think -> tool -> think -> response 顺序。",
        "文本增量按动画帧分组，并在工具组、完成、取消或持久化之前刷新。",
        "消息、事件、会话和备用工具调用 ID 使用 crypto.randomUUID()。",
      ],
    },
    {
      title: "生成任务归属与恢复",
      items: [
        "协调器保证每个会话最多运行一个生成任务，同时允许不同会话进行有界并发。并发上限默认为 8，并限制在 1 到 16 之间。",
        "客户端请求 ID、生成 ID 和会话 ID 将队列、流、工具批准、取消和快照绑定到正确的任务。",
        "Interrupt and guide 会先将新指导加入队首，再中止当前任务；普通发送会追加到会话队列末尾。",
        "带修订号的原子 checkpoint 会保留部分 timeline、工具状态、不含密钥的配置和排队提示。激活时会恢复中断输出，并将排队提示作为草稿提供。",
      ],
    },
    {
      title: "工具和终端",
      items: [
        "工具状态使用单一原生生命周期，最终进入 completed、rejected、cancelled 或 error；拒绝不会被编码为执行错误。",
        "同一工具轮次中的调用按顺序执行，编排器会阻止名称和参数完全相同的重复调用。在并发生成任务之间，只读工具可以重叠运行，而工作区变更按工作区串行执行。",
        "终端使用 spawn、进程树取消、结构化结果、保留首尾的有界输出，以及非零退出码检测。",
        "每个会话保存带修订号的逻辑工作区绑定。每次运行只捕获一次文件夹、别名、能力和活动编辑器根；操作不会回退到当前编辑器或第一个文件夹。",
        "路径授权仅接受工作区 ./ 路径，拒绝父目录遍历、绝对路径和 URI，并解析真实路径与现有祖先以防止 symlink 或 junction 越界。",
        "显式外部附件是临时只读快照；不会持久化，也不会把工具授权扩展到绑定工作区之外。",
        "已确认的文件写入带有 SHA-256 守卫；如果预览后磁盘内容发生变化，编辑或覆盖会失败。",
      ],
    },
    {
      title: "API、上下文和持久化",
      items: [
        "SSE 支持注释、CRLF、带或不带空格的 data 字段、多行事件、解码器收尾、异常 JSON 诊断和 reader 取消。",
        "DeepSeek 请求使用规范化 URL，每次尝试超时 60 秒；对临时故障最多尝试三次，并遵守 Retry-After。",
        "设置、schema-v2 会话历史和生成 checkpoint 都保存在 ~/.yrs-dpsk-copilot/ 下。checkpoint 绝不包含 API key，异常的历史或 checkpoint 文件会被隔离。",
        "上下文具有总预算、二进制检测、Git staged 和 unstaged 数据、受限的 AGENTS.md 来源，以及明确的不受信任数据分隔符。",
      ],
    },
  ],
};
