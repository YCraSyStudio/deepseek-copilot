import type { TranslationCatalog } from "../Types";

export const settings = {
  settings: {
    tab: {
      tools: "Herramientas",
      general: "General"
    },
    section: {
      extension: "Extensión"
    },
    tabs: {
      label: "Secciones de ajustes"
    },
    loading: "Cargando ajustes…",
    retry: "Reintentar",
    reset: {
      label: "Restablecer valores predeterminados",
      success: "Ajustes restablecidos. La API key se ha conservado."
    },
    notification: {
      dismiss: "Cerrar notificación"
    },
    unavailable: "Los ajustes no están disponibles fuera de VS Code.",
    save: {
      success: "Ajustes guardados.",
      error: "No se pudieron guardar los ajustes. Inténtalo de nuevo."
    },
    load: {
      error: "No se pudieron cargar los ajustes."
    },
    api: {
      title: "Configuración de la API",
      key: "API key",
      keyVisibility: {
        label: "Mostrar u ocultar la API key",
        tooltip: "Mostrar/ocultar API key"
      },
      testConnection: "Probar conexión",
      testing: "Probando...",
      notConfigured: "Sin configurar",
      connection: {
        ok: "Conexión correcta",
        failed: "Conexión fallida"
      },
      configured: "Configurada",
      httpWarning: "Advertencia: HTTP envía las credenciales de la API sin cifrado de transporte.",
      customHostWarning: "Host de API personalizado: verifica que confías en su operador.",
      baseUrl: "URL base"
    },
    reasoning: {
      mode: "Modo de razonamiento",
      effort: "Nivel de razonamiento"
    },
    advanced: {
      title: "Avanzado"
    },
    sampling: {
      temperature: "Temperatura",
      topP: "Top P"
    },
    history: {
      store: "Guardar historial del chat",
      retention: "Días de retención del historial (0 = ilimitado)"
    },
    instructions: {
      globalAgents: "Usar las instrucciones globales de AGENTS.md"
    },
    beta: {
      enable: "Activar funciones beta"
    },
    language: {
      label: "Idioma de la interfaz",
      auto: "Usar el idioma de VS Code"
    },
    model: {
      label: "Modelo"
    },
    limits: {
      maxTokens: "Tokens máximos",
      maxToolRounds: "Máximo de rondas de herramientas",
      maxConcurrentGenerations: "Generaciones simultáneas"
    }
  }
} satisfies TranslationCatalog;
