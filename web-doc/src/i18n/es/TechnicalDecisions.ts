import type { PageContent } from "../Types";

export const technicalDecisions: PageContent = {
  navTitle: "Decisiones técnicas",
  title: "Decisiones técnicas",
  description: "Decisiones de arquitectura, persistencia, streaming y ejecución.",
  lead: "La extensión separa el estado de dominio, el transporte de DeepSeek, las capacidades de VS Code y el renderizado React para que las reglas de seguridad sean autoritativas en el host.",
  sections: [
    {
      title: "Límites entre capas",
      items: [
        "core contiene la conversación, el contexto y el dominio de herramientas independientes del proveedor, y no importa React ni clientes HTTP concretos.",
        "deepseekApi contiene las peticiones, validación de respuestas, parsing SSE, reintentos acotados y orquestación de tool calls.",
        "vscodeApi contiene secretos, workspace, almacenamiento, comandos, procesos de terminal, confirmaciones y comunicación host-webview.",
        "ui contiene la webview React y solo cambia el estado autoritativo de una herramienta después de recibir mensajes del host.",
      ],
    },
    {
      title: "Modelo cronológico de eventos",
      items: [
        "La presentación del asistente se persiste como eventos tipados de razonamiento, contenido y grupos de herramientas, no como marcadores de control dentro de texto.",
        "El mismo contrato de timeline renderiza el stream en vivo y el historial restaurado, conservando el orden think -> tool -> think -> response.",
        "Los deltas de texto se agrupan por frame de animación y se vacían antes de los grupos de herramientas, finalización, cancelación o persistencia.",
        "Los IDs de mensajes, eventos, conversaciones y tool calls de respaldo usan crypto.randomUUID().",
      ],
    },
    {
      title: "Propiedad y recuperación de generaciones",
      items: [
        "Un coordinador permite una generación activa por conversación y concurrencia acotada entre conversaciones. El límite configurable es 8 de forma predeterminada y se restringe al intervalo de 1 a 16.",
        "Los IDs de petición cliente, generación y conversación vinculan colas, streams, aprobaciones de herramientas, cancelación y snapshots con la ejecución correcta.",
        "Interrupt and guide encola primero la nueva indicación y después aborta la ejecución actual; los envíos normales se añaden al final de la cola de la conversación.",
        "Los checkpoints atómicos con revisión conservan timelines parciales, estado de herramientas, configuración sin secretos y prompts encolados. La activación restaura la salida interrumpida y ofrece los prompts encolados como borradores.",
      ],
    },
    {
      title: "Herramientas y terminal",
      items: [
        "El estado de herramientas tiene un único ciclo nativo que termina en completed, rejected, cancelled o error; un rechazo no se codifica como error de ejecución.",
        "Las llamadas de una ronda se ejecutan secuencialmente y el orquestador bloquea duplicados con el mismo nombre y argumentos. Entre generaciones concurrentes, las herramientas de lectura pueden solaparse y las mutaciones se serializan por workspace.",
        "El terminal usa spawn, cancelación del árbol de procesos, resultados estructurados, salida acotada por principio y final, y detección de códigos de salida distintos de cero.",
        "La autorización de rutas resuelve rutas reales y ancestros existentes para impedir escapes por symlinks o junctions. La conversación conserva el URI del workspace elegido en entornos multi-root.",
        "Las escrituras confirmadas llevan guardas SHA-256 para que una edición falle si el contenido en disco cambia después de la previsualización.",
      ],
    },
    {
      title: "API, contexto y persistencia",
      items: [
        "SSE admite comentarios, CRLF, campos data con o sin espacios, eventos multilínea, finalización del decoder, diagnósticos de JSON inválido y cancelación del reader.",
        "Las peticiones a DeepSeek normalizan URLs, usan un timeout de 60 segundos por intento y un máximo de tres intentos para fallos transitorios, respetando Retry-After.",
        "Los ajustes, el historial de conversaciones con esquema v2 y los checkpoints viven bajo ~/.yrs-dpsk-copilot/. Los checkpoints nunca contienen la API key y los historiales o checkpoints inválidos se aíslan.",
        "El contexto tiene presupuestos agregados, detección de binarios, datos Git staged y unstaged, fuentes AGENTS.md acotadas y delimitadores explícitos de datos no confiables.",
      ],
    },
  ],
};
