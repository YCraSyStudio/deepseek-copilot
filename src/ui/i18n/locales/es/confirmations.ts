import type { TranslationCatalog } from "../Types";

export const confirmations = {
  confirmations: {
    reviewDetails: "Revisar detalles",
    reviewTool: "Revisar {tool}",
    reviewFileDescription: "Revisa la operación completa para {path} antes de elegir una acción.",
    reviewToolDescription: "Revisa esta operación de {tool} antes de elegir una acción.",
    completeArgumentsForTool: "Argumentos completos de {tool}",
    roundRound: "Ronda {round}",
    openFileInEditor: "Abrir archivo en el editor",
    filePath: "Archivo: {path}",
    reviewBeforeExecuting: "Revisa la operación antes de ejecutarla.",
    executeOnce: "Ejecutar una vez",
    reject: "Rechazar",
    executeAllManualToolsOnce: "Ejecutar una vez todas las herramientas manuales",
    rejectAllManualTools: "Rechazar todas las herramientas manuales",
    completeCommand: "Comando completo",
    workingDirectory: "Directorio de trabajo:",
    shell: "Shell:",
    trustMatchingOperationsThisSession: "Confiar en esta operación durante la conversación",
    cancel: "Cancelar",
    yesExecuteOnce: "Sí, ejecutar una vez",
    destructiveOnceDescription: "Esta operación destructiva se aprueba una sola vez. Las acciones destructivas siempre requieren confirmación independiente.",
    sessionTrustDescription: "Ejecutar una vez solo aprueba esta operación. Confiar durante la conversación aprueba la operación exacta solo en este workspace y configuración.",
    destructiveAction: "Acción destructiva",
    potentiallyDangerousAction: "Acción potencialmente peligrosa",
    cautionRequired: "Se requiere precaución",
    toolCallLimitReached: "Se alcanzó el límite de llamadas a herramientas",
    toolCallLimitDescription: "El asistente ha completado {rounds} rondas de herramientas. ¿Continuar con hasta {batchSize} rondas más?",
    continueToolCalls: "Continuar",
    stopToolCalls: "Detener y responder"
  }
} satisfies TranslationCatalog;
