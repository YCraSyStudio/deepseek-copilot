import type { TranslationCatalog } from "../Types";

export const tools = {
  tools: {
    permissionMode: "Modo de permisos",
    savedGloballyForAllWorkspaces: "Guardado globalmente para todos los workspaces.",
    toolPermissions: "Permisos de herramientas",
    noToolsAreAvailable: "No hay herramientas disponibles.",
    noToolsTheModelCanOnlyAnswerInChat: "Sin herramientas. El modelo solo puede responder en el chat.",
    readOnlyDescription: "Leer archivos, listar directorios y buscar contenido del workspace.",
    fullAccessDescription: "Todas las herramientas habilitadas se ejecutan inmediatamente, incluido el terminal, sin pedir confirmación.",
    chat: "Chat",
    readOnly: "Solo lectura",
    fullAccess: "Acceso completo",
    disabled: "Deshabilitada",
    enabled: "Habilitada",
    autoApprove: "Aprobación automática",
    autoApproveModeDescription: "Las herramientas ajenas al terminal pueden ejecutarse inmediatamente. El terminal solo se ejecuta automáticamente si es de solo lectura y está contenido en el workspace.",
    autoApproveWarning: "¿Activar la aprobación automática global? Las herramientas ajenas al terminal pueden ejecutarse inmediatamente. El terminal no está aislado por el sistema operativo y los comandos que no sean de solo lectura y contenidos en el workspace seguirán requiriendo confirmación.",
    blockedByModePermissionMode: "Bloqueada por el modo de permisos {mode}",
    nameMode: "Modo de {name}",
    toolCalls: "Llamadas de herramientas",
    toolCall: "Llamada de herramienta",
    pending: "Pendiente",
    awaitingConfirmation: "Esperando confirmación",
    running: "Ejecutándose",
    completed: "Completada",
    error: "Error",
    rejected: "Rechazada",
    cancelled: "Cancelada",
    copyCall: "Copiar llamada",
    copyToolData: "Copiar datos de {tool}",
    copy: "Copiar",
    insert: "Insertar",
    copyArguments: "Copiar argumentos",
    copyResult: "Copiar resultado",
    labelCopied: "{label} copiado."
  }
} satisfies TranslationCatalog;
