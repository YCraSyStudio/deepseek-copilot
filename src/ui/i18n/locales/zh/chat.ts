import type { TranslationCatalog } from "../Types";

export const chat = {
  chat: {
    apiKeyMissing: "缺少 API key",
    askAnythingAboutYourCode: "询问任何代码问题...",
    configureApiKey: "请先在设置中配置 API key...",
    emptyDescription: "询问代码、生成片段或在编辑器中接收推理。",
    send: "发送",
    newLine: "换行",
    modelSelector: "模型选择器",
    reasoning: "推理",
    off: "关闭",
    high: "高",
    max: "最大",
    removeFile: "移除文件",
    large: "大文件",
    folder: "文件夹",
    readingPath: "正在读取：{path}",
    listingPath: "正在列出：{path}",
    fileChanged: "文件已更改",
    chatMessage: "聊天消息",
    stopGeneration: "停止生成",
    sendMessage: "发送消息",
    workspacePathSuggestions: "工作区路径建议",
    pathSuggestionCount: "有 {count} 个路径建议。",
    noFilesOrFoldersFound: "未找到文件或文件夹。",
    deepseekIsThinking: "DeepSeek 正在思考...",
    jumpToLatest: "跳到最新响应块",
    latest: "最新",
    streaming: "DeepSeek 响应正在传输。",
    finished: "响应生成已完成。",
    queueMessage: "消息入队",
    interruptAndGuide: "中断并引导",
    recoveredDrafts: "VS Code 关闭后恢复的草稿：",
    restoreDraft: "恢复"
  }
} satisfies TranslationCatalog;
