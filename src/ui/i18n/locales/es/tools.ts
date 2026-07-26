import type { TranslationCatalog } from "../Types";

export const tools = {
  tools: {
    permissionMode: "Modo de permisos",
    toolPermissions: "Permisos de herramientas",
    noToolsAreAvailable: "No hay herramientas disponibles.",
    defaultDescription: "Todas las herramientas están disponibles y piden confirmación antes de ejecutarse.",
    readOnlyDescription: "Lectura, listado y búsqueda se ejecutan automáticamente; escritura y terminal piden confirmación.",
    customDescription: "Configura cada herramienta como deshabilitada, con confirmación o con aprobación automática.",
    fullAccessDescription: "Todas las herramientas pueden operar en cualquier parte del ordenador sin pedir confirmación.",
    default: "Predeterminado",
    readOnly: "Solo lectura",
    custom: "Personalizado",
    fullAccess: "Acceso completo",
    disabled: "Deshabilitada",
    enabled: "Habilitado",
    autoApprove: "Aprobación automática",
    autoApproveModeDescription: "Todas las herramientas se ejecutan automáticamente dentro del workspace. El acceso externo aún requiere confirmación.",
    fullAccessWarning: "¿Activar el acceso completo global? Las herramientas podrán leer, modificar o eliminar archivos de cualquier parte del ordenador sin confirmación. El terminal no está aislado por el sistema operativo.",
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
