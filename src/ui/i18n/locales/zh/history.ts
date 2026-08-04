import type { TranslationCatalog } from "../Types";

export const history = {
  history: {
    incognitoActive: "无痕模式启用时历史记录不可用。已有会话仍会保留，并将在退出无痕模式后重新显示。",
    historyControls: "历史记录控件",
    searchLabel: "搜索历史",
    searchPlaceholder: "搜索历史…",
    sortHistory: "排序历史",
    dateNewest: "日期（最新）",
    dateOldest: "日期（最早）",
    titleAZ: "标题（A-Z）",
    titleZA: "标题（Z-A）",
    deleteFilteredHistory: "删除筛选后的历史",
    loadingHistory: "正在加载历史…",
    historyCouldNotBeLoaded: "无法加载历史记录。",
    historyIsUnavailableOutsideVSCode: "历史记录在 VS Code 外不可用。",
    noConversationsMatchYourSearch: "没有匹配搜索的会话。",
    noHistoryYet: "尚无历史记录。",
    unknownWorkspace: "未知工作区",
    historyPages: "历史记录页面",
    previous: "上一页",
    next: "下一页",
    pageSummary: "第 {page}/{pages} 页 · {count} 个会话",
    openTitle: "打开 {title}",
    deleteTitle: "删除 {title}",
    countMessages: "{count} 条消息"
  }
} satisfies TranslationCatalog;
