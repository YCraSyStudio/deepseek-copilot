import type { TranslationCatalog } from "../Types";

export const settings = {
  settings: {
    tab: {
      tools: "工具",
      general: "常规"
    },
    section: {
      extension: "扩展"
    },
    tabs: {
      label: "设置部分"
    },
    loading: "正在加载设置…",
    retry: "重试",
    reset: {
      label: "恢复默认设置",
      success: "设置已恢复默认值，API key 已保留。"
    },
    notification: {
      dismiss: "关闭通知"
    },
    unavailable: "设置在 VS Code 外不可用。",
    save: {
      success: "设置已保存。",
      error: "无法保存设置，请重试。"
    },
    load: {
      error: "无法加载设置。"
    },
    api: {
      title: "API 配置",
      key: "API key",
      keyVisibility: {
        label: "显示或隐藏 API key",
        tooltip: "显示/隐藏 API key"
      },
      testConnection: "测试连接",
      removeCredential: "删除 API key",
      removingCredential: "正在删除 API key...",
      removeCredentialFailed: "无法删除 API key。",
      testing: "正在测试...",
      notConfigured: "未配置",
      connection: {
        ok: "连接正常",
        failed: "连接失败"
      },
      configured: "已配置",
      httpWarning: "警告：HTTP 会在没有传输加密的情况下发送 API 凭据。",
      customHostWarning: "自定义 API 主机：请确认你信任其运营方。",
      baseUrl: "基础 URL"
    },
    reasoning: {
      mode: "思考模式",
      effort: "推理强度"
    },
    advanced: {
      title: "高级"
    },
    sampling: {
      temperature: "温度",
      topP: "Top P"
    },
    history: {
      store: "保存聊天历史",
      retention: "历史保留天数（0 = 不限）"
    },
    instructions: {
      globalAgents: "使用全局 AGENTS.md 指令"
    },
    beta: {
      enable: "启用 Beta 功能"
    },
    language: {
      label: "界面语言",
      auto: "使用 VS Code 语言"
    },
    model: {
      label: "模型"
    },
    limits: {
      maxTokens: "最大输出 Token 数",
      maxTokensDescription: "每次请求的输出预留。DeepSeek V4 的总上下文为 1M Token，最大输出为 384K；保守的默认值 8,192 有助于限制 API 用量和成本。",
      maxToolRounds: "最大工具轮数",
      maxToolRoundsDescription: "安全检查间隔。Auto-approve 和 full-access 由 DeepSeek 重新评估；其他模式会询问是否继续。",
      maxConcurrentGenerations: "并发生成数"
    }
  }
} satisfies TranslationCatalog;
