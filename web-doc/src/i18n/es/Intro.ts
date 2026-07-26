import type { PageContent } from "../Types";

export const intro: PageContent = {
  navTitle: "Introducción",
  title: "Introducción",
  description: "Introducción a Yar's DeepSeek Copilot.",
  lead: "Yar's DeepSeek Copilot solo usa DeepSeek por diseño. Ofrece un asistente enfocado dentro de VS Code sin selector de proveedores.",
  sections: [
    {
      title: "Alcance actual de la beta",
      items: [
        "Chat lateral con respuestas, razonamiento y tool calls transmitidos y renderizados en orden cronológico.",
        "Thinking mode puede activarse o desactivarse sin desactivar las herramientas.",
        "Los permisos chat, read-only, workspace, full-access y auto-approve controlan las herramientas de lectura, búsqueda, edición, patches, terminal y aprobación delegada.",
        "El autocompletado seguro aparece solo al escribir ./; contexto automático, Git, instrucciones, terminal y herramientas usan el mismo snapshot inmutable del workspace lógico.",
        "Los ajustes y el historial global se guardan bajo ~/.yrs-dpsk-copilot/ con retención configurable, confirmación nativa de borrado y Deshacer.",
      ],
    },
    {
      title: "No afiliación",
      items: [
        "Esta es una extensión independiente de terceros. No está afiliada, avalada, patrocinada ni mantenida oficialmente por DeepSeek.",
      ],
    },
  ],
};
