import type { TranslationCatalog } from "../Types";

export const chat = {
  chat: {
    apiKeyMissing: "Falta la API key",
    askAnythingAboutYourCode: "Pregunta cualquier cosa sobre tu código...",
    configureApiKey: "Configura primero la API key en Ajustes...",
    emptyDescription: "Pregunta sobre código, genera fragmentos o recibe razonamiento en el editor.",
    send: "enviar",
    newLine: "nueva línea",
    modelSelector: "Selector de modelo",
    reasoning: "Razonamiento",
    off: "Desactivado",
    high: "Alto",
    max: "Máximo",
    removeFile: "Quitar archivo",
    large: "Grande",
    folder: "carpeta",
    readingPath: "leyendo: {path}",
    listingPath: "listando: {path}",
    fileChanged: "Archivo modificado",
    chatMessage: "Mensaje de chat",
    stopGeneration: "Detener generación",
    sendMessage: "Enviar mensaje",
    workspacePathSuggestions: "Sugerencias de rutas del workspace",
    pathSuggestionCount: "Hay {count} sugerencias de ruta disponibles.",
    noFilesOrFoldersFound: "No se encontraron archivos ni carpetas.",
    deepseekIsThinking: "DeepSeek está pensando...",
    jumpToLatest: "Saltar al último bloque de respuesta",
    latest: "Último",
    streaming: "La respuesta de DeepSeek se está transmitiendo.",
    finished: "La generación de la respuesta ha terminado.",
    queueMessage: "Poner mensaje en cola",
    interruptAndGuide: "Interrumpir y guiar",
    recoveredDrafts: "Borradores recuperados tras cerrar VS Code:",
    restoreDraft: "Restaurar"
  }
} satisfies TranslationCatalog;
