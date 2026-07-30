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
        "El razonamiento y las tools permanecen compactos en grupos Activity desplegables; las tools de archivo abren el archivo afectado o el cambio exacto registrado en el editor nativo.",
        "Thinking mode puede activarse o desactivarse sin desactivar las herramientas.",
        "Default confirma cada herramienta, read-only autoaprueba herramientas no mutadoras, auto-approve delega el workspace, full-access permite acceso sin límites y custom controla cada herramienta.",
        "El autocompletado seguro aparece solo al escribir ./; contexto automático, Git, instrucciones, terminal y herramientas usan el mismo snapshot inmutable del workspace lógico.",
        "Los ajustes y el historial global se guardan bajo ~/.yrs-dpsk-copilot/ con retención configurable, confirmación nativa de borrado y Deshacer.",
        "Las credenciales se aíslan por origen en Secret Storage de VS Code y nunca vuelven a la webview; Settings solo muestra una preview enmascarada como placeholder.",
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
