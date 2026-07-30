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
        "adapters contiene modelos compartidos estables y el contrato de la webview, dividido en modelos, peticiones entrantes y eventos salientes tras un barrel compatible.",
        "core contiene conversación, contexto y dominio de herramientas independientes del proveedor, y no importa React, VS Code ni clientes HTTP concretos.",
        "deepseekApi contiene peticiones, validación de respuestas, parsing SSE, reintentos acotados, orquestación de tool calls y el módulo aislado de revisión de comandos.",
        "vscodeApi contiene secretos, workspace, almacenamiento, comandos, procesos de terminal, confirmaciones, comunicación host-webview, resolución de rutas y diffs nativos.",
        "ui contiene la webview React y solo cambia el estado autoritativo de una herramienta después de recibir mensajes del host. Chat y Settings se agrupan por feature con imports internos explícitos.",
      ],
    },
    {
      title: "Modelo cronológico de eventos",
      items: [
        "La presentación del asistente se persiste como eventos tipados de razonamiento, contenido y grupos de herramientas, no como marcadores de control dentro de texto.",
        "El mismo contrato de timeline renderiza el stream en vivo y el historial restaurado, conservando el orden think -> tool -> think -> response.",
        "Los deltas de texto se agrupan por frame de animación y se vacían antes de los grupos de herramientas, finalización, cancelación o persistencia.",
        "Los IDs de mensajes, eventos, conversaciones y tool calls de respaldo usan crypto.randomUUID().",
        "Los eventos adyacentes de razonamiento y herramientas se agrupan en bloques Activity contraídos para la presentación sin alterar su orden cronológico persistido.",
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
        "Las llamadas de una ronda se ejecutan secuencialmente y el orquestador bloquea duplicados con el mismo nombre y argumentos. En un control de rondas, los modos desatendidos inyectan una instrucción de reevaluación para DeepSeek y los modos atendidos solicitan una decisión al usuario. Entre generaciones concurrentes, las herramientas de lectura pueden solaparse y las mutaciones se serializan por workspace.",
        "El terminal usa spawn, cancelación del árbol de procesos, resultados estructurados, salida acotada por principio y final, y detección de códigos de salida distintos de cero.",
        "Cada conversación guarda un binding versionado del workspace lógico. Cada ejecución captura una sola vez carpetas, aliases, capacidades y raíz del editor activo; ninguna operación usa el editor actual ni la primera carpeta como fallback.",
        "La autorización acepta rutas ./ del workspace, rechaza padres, rutas absolutas y URI, y resuelve rutas reales y ancestros existentes para impedir escapes por symlinks o junctions.",
        "Los adjuntos externos explícitos son snapshots temporales de solo lectura. No se persisten ni amplían la autorización de herramientas fuera del workspace vinculado.",
        "Las escrituras confirmadas llevan guardas SHA-256 para que una edición falle si el contenido en disco cambia después de la previsualización.",
        "Auto-approve usa un analizador local antes de la revisión remota. El revisor recibe la petición inicial, hechos de alcance y solo previews acotadas de archivos del workspace explícitos y no sensibles; se exige confianza medium-high o superior para aprobar o replanificar automáticamente.",
        "Las vistas nativas de cambios reconstruyen los documentos anterior y posterior a partir del diff acotado registrado por esa creación, edición o patch, no desde el disco o Git actuales.",
      ],
    },
    {
      title: "API, contexto y persistencia",
      items: [
        "SSE admite comentarios, CRLF, campos data con o sin espacios, eventos multilínea, finalización del decoder, diagnósticos de JSON inválido y cancelación del reader.",
        "Las peticiones a DeepSeek normalizan URLs, usan un timeout de 60 segundos por intento y un máximo de tres intentos para fallos transitorios, respetando Retry-After.",
        "Los ajustes, el historial con esquema v2 y los checkpoints viven bajo ~/.yrs-dpsk-copilot/. Las credenciales viven separadas en Secret Storage de VS Code por origen normalizado; la webview solo recibe estado enmascarado. Los checkpoints nunca contienen una clave y los registros inválidos se aíslan.",
        "Las peticiones a DeepSeek rechazan URLs con credenciales, exigen HTTPS fuera de loopback, conservan el origen elegido durante redirecciones y eliminan valores sensibles de errores visibles.",
        "El presupuesto de los modelos DeepSeek V4 usa su contexto total documentado de 1M tokens y un máximo de salida de 384K. La reserva de salida configurada es 65.536 de forma predeterminada y reduce el presupuesto de entrada junto con un margen de seguridad.",
        "El contexto tiene presupuestos agregados, detección de binarios, datos Git staged y unstaged, fuentes AGENTS.md acotadas y delimitadores explícitos de datos no confiables.",
      ],
    },
  ],
};
