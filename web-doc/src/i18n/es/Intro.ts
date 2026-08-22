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
        "DeepSeek V4 Vision (Flash) lee directamente las imágenes subidas; V4 Pro puede invocar analyze_images para recibir una descripción textual generada por Vision.",
        "Una única acción permite adjuntar archivos de contexto e imágenes JPEG, PNG, GIF o WebP; también se pueden pegar con Ctrl+V o Cmd+V.",
        "Default confirma cada herramienta, auto-approve ejecuta automáticamente las operaciones rutinarias y confirma las elevadas, y full-access solo confirma acciones críticas que podrían dañar ampliamente el equipo.",
        "El autocompletado seguro aparece solo al escribir ./; contexto automático, Git, instrucciones, terminal y herramientas usan el mismo snapshot inmutable del workspace lógico.",
        "Los ajustes y el historial global se guardan bajo ~/.yrs-dpsk-copilot/ con retención configurable, confirmación nativa de borrado y Deshacer.",
        "Stop conserva el prompt enviado, el timeline parcial y los resultados de herramientas completadas como turno cancelled. Steering reinicia el transporte de forma segura, pero continúa explícitamente la tarea original bajo la última guía sin mostrar un aviso de interrupción engañoso.",
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
