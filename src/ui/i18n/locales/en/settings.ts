import type { TranslationCatalog } from "../Types";

export const settings = {
  settings: {
    tab: {
      tools: "Tools",
      general: "General"
    },
    section: {
      extension: "Extension"
    },
    tabs: {
      label: "Settings sections"
    },
    loading: "Loading settings…",
    retry: "Retry",
    reset: {
      label: "Reset to Defaults",
      success: "Settings reset to defaults. API key preserved."
    },
    notification: {
      dismiss: "Dismiss notification"
    },
    unavailable: "Settings are unavailable outside VS Code.",
    save: {
      success: "Settings saved.",
      error: "Settings could not be saved. Try again."
    },
    load: {
      error: "Settings could not be loaded."
    },
    api: {
      title: "API Configuration",
      key: "API Key",
      keyVisibility: {
        label: "Show or hide API key",
        tooltip: "Show/Hide API Key"
      },
      testConnection: "Test Connection",
      testing: "Testing...",
      notConfigured: "Not configured",
      connection: {
        ok: "Connection OK",
        failed: "Connection failed"
      },
      configured: "Configured",
      httpWarning: "Warning: HTTP sends API credentials without transport encryption.",
      customHostWarning: "Custom API host: verify that you trust its operator.",
      baseUrl: "Base URL"
    },
    reasoning: {
      mode: "Thinking Mode",
      effort: "Reasoning Effort"
    },
    advanced: {
      title: "Advanced"
    },
    sampling: {
      temperature: "Temperature",
      topP: "Top P"
    },
    history: {
      store: "Store chat history",
      retention: "History retention days (0 = unlimited)"
    },
    instructions: {
      globalAgents: "Use global AGENTS.md instructions"
    },
    beta: {
      enable: "Enable Beta Features"
    },
    language: {
      label: "Interface language",
      auto: "Use VS Code language"
    },
    model: {
      label: "Model"
    },
    limits: {
      maxTokens: "Max Tokens",
      maxToolRounds: "Max tool rounds",
      maxConcurrentGenerations: "Concurrent generations"
    }
  }
} satisfies TranslationCatalog;
