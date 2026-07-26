import type { PageContent } from "../Types";

export const userManual: PageContent = {
  navTitle: "用户手册",
  title: "用户手册",
  description: "配置和使用聊天、工具、权限、上下文及工作区历史记录。",
  lead: "配置 API key，选择权限模式，然后从侧边栏使用 DeepSeek，并明确控制每一项工作区操作。",
  sections: [
    {
      title: "开始使用",
      items: [
        "从 Activity Bar 打开 Yar's DeepSeek Copilot，并在 Settings 中输入 API key。密钥保存在 VS Code Secret Storage 中。",
        "选择模型、thinking mode、reasoning effort、响应上限、最大工具轮数和并发生成上限。默认并发数为 8，可设置为 1 到 16。",
        "输入 ./ 可自动补全安全的工作区路径；始终拒绝 ../ 父目录遍历。多根工作区路径以稳定别名开头，例如 ./frontend/src/App.tsx。",
        "可使用附件按钮或资源管理器/编辑器命令显式添加上下文。工作区外文件会转换为受限的只读快照，绝不会授予工具访问其所在文件夹的权限。",
        "使用 Stop generation 可中断当前请求和正在运行的终端进程树。提示和已有的部分响应会作为中断轮次保留在历史记录中。",
      ],
    },
    {
      title: "并发生成和队列",
      items: [
        "每个会话同一时间只运行一个生成任务。该会话中的其他提示会按提交顺序排队。",
        "不同会话可以并发生成，直到达到配置的全局上限。",
        "响应进行期间，Queue message 会将草稿追加到队列；Interrupt and guide 会先把指导放到队首，再停止当前生成。",
        "切换会话或重新创建 webview 不会让流式或工具事件串到其他任务；每个事件都绑定到其生成任务和会话。",
        "如果 VS Code 关闭，部分输出会恢复为 interrupted，未完成的工具会变为 cancelled，排队提示会在下次激活时作为可恢复草稿提供。",
      ],
    },
    {
      title: "权限和工具状态",
      items: [
        "chat 不提供工作区工具；read-only 提供 read_file、list_directory 和 search_content；full-access 会立即执行所有未禁用的工具且不显示确认；auto-approve 对高风险终端操作仍会要求确认。",
        "每个工具都可设为禁用、手动批准或仅安全操作自动批准。Full access 是无人值守模式，仅应在受信任的工作区中使用；工作区绑定和 VS Code Workspace Trust 仍然生效。",
        "工具调用依次经过 awaiting confirmation、running，并最终进入 completed、rejected、cancelled 或 error 中的一种状态。",
        "扩展宿主会先确认执行或拒绝操作，然后 webview 才会提交可见状态。",
        "同一轮内的工具调用按顺序执行。重复的同名同参数调用会被跳过，可配置的轮数上限会阻止执行循环。",
        "只读工具可以跨并发会话运行，而文件和终端变更在同一工作区内按顺序执行。",
      ],
    },
    {
      title: "工作区内容搜索",
      items: [
        "search_content 通过 VS Code 工作区文件系统执行不区分大小写的字面文本搜索；它不会运行 shell，也不会将查询解释为正则表达式。查询必须包含文本，且最多为 4,096 个字符。",
        "可选的 filePattern 是工作区相对 glob，例如 *.ts 或 src/**/*.md。其默认值为 **/*，最多为 1,024 个字符，并拒绝绝对路径和父目录遍历。",
        "敏感路径、二进制文件和大于 2 MiB 的文件会被跳过。敏感文件在读取内容前就会被过滤。",
        "每次搜索最多检查 10,000 个文件并返回 50 个匹配项。结果行和总输出均有上限，响应还会报告已扫描文件数、已跳过文件数以及是否发生截断。",
        "请求取消时搜索会停止，并在 15 秒后超时。",
      ],
    },
    {
      title: "终端执行",
      items: [
        "终端命令以非交互方式运行，无法回答提示，也不提供 TTY。",
        "结果会记录 stdout、stderr、退出码、信号、超时、取消状态、实际工作目录和 shell。",
        "输出有大小限制；发生截断时会保留开头和结尾，并标记被省略的中间部分。",
        "除全局“自动批准”外，未知命令需要谨慎处理。执行前会分析 Bash、PowerShell 和 cmd 命令链，以及发布、部署、远程更改、包管理器、重定向和破坏性操作。",
      ],
    },
    {
      title: "历史记录和隐私",
      items: [
        "设置保存在 ~/.yrs-dpsk-copilot/settings.json 中。API key 仍保存在 VS Code Secret Storage 中。",
        "历史记录以每个会话一个 JSON 文件的形式全局保存在 ~/.yrs-dpsk-copilot/history/ 中，每条记录都会显示其来源工作区。",
        "可以禁用历史记录，也可以将保留期设为 0 天（仅手动删除）到 3650 天；默认值为 30 天。",
        "历史列表直接从经过验证的会话文件重建。存储上限为 100 个会话和 24 MiB。",
        "删除单个会话或所有可见会话时会使用 VS Code 原生确认，并提供撤销。删除前会先取消该会话的活动生成任务、清空队列和 checkpoint；如果删除的是当前会话，还会清空 Chat 视图。",
        "会话文件使用 schema version 2，并将消息与生成结果关联。激活时，有效的旧文件或部分迁移文件会以原子方式升级，并获得确定性的生成任务归属。兼容逻辑没有运行时截止日期，会一直保留到计划的清理版本发布。",
        "活动任务的 checkpoint 保存在 ~/.yrs-dpsk-copilot/generation-checkpoints/ 下，且不包含 API key。中断时处于 pending 或 running 的工具会恢复为 cancelled；损坏的历史和 checkpoint 记录会分别隔离到对应的 corrupt 目录。",
      ],
    },
    {
      title: "上下文和斜杠命令",
      items: [
        "自动上下文会在时间和大小限制内包含当前编辑器以及 Git 的 staged 和 unstaged 更改。",
        "引用文件和 AGENTS.md 指令有大小限制，使用工作区相对标签，并作为不受信任的数据进行分隔。",
        "总请求预算包含系统提示、工具 schema、历史记录、引用内容、预留输出和安全余量。较旧的完整生成会按原子轮次摘要，大文件只保留与请求相关的原始行范围；工具参数、协议所需推理和活动工具周期绝不会被截断。",
        "使用 /context 可检查普通请求将发送的内容。其他命令包括 /status、/tools、/mode、/auto-context、/review、/goal、/summarize 和 /clear-context。",
      ],
    },
  ],
};
