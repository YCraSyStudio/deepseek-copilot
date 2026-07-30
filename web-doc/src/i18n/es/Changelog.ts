import type { PageContent } from "../Types";

export const changelog: PageContent = {
  navTitle: "Changelog",
  title: "Changelog",
  description: "Cambios relevantes y estado preview.",
  lead: "La versión preview 0.1.4 protege las credenciales de API, añade revisión contextual de comandos para auto-approve y hace la actividad de herramientas más compacta e inspeccionable.",
  sections: [
    {
      title: "0.1.4 preview: credenciales, revisión de comandos y UI enfocada en herramientas",
      items: [
        "Las credenciales se aíslan por origen de API normalizado en Secret Storage de VS Code. La clave antigua se migra automáticamente, cambiar de origen requiere confirmación y la webview solo recibe el estado y una preview enmascarada para el placeholder.",
        "Las peticiones a DeepSeek mantienen el origen elegido durante las redirecciones y eliminan credenciales de errores, logs, historial, ajustes, checkpoints y mensajes visibles.",
        "Auto-approve ejecuta primero un analizador local conservador. Los comandos de terminal inciertos pero contenidos en el workspace pueden recibir una revisión DeepSeek separada con la petición inicial del usuario y previews acotadas y no sensibles de archivos nombrados explícitamente.",
        "El revisor puede aprobar, pedir una replanificación más segura o requerir confirmación manual. Las decisiones automáticas exigen confianza medium-high o superior y nunca anulan el límite del workspace ni delegan credenciales, elevación, publicación, despliegue, mutación remota, acceso externo, terminación amplia de procesos u operaciones destructivas.",
        "El razonamiento y las tool calls adyacentes se agrupan en paneles Activity desplegables con número de pasos y estado agregado.",
        "El contenido correcto de read_file se omite del Chat. Las herramientas de archivo ofrecen Open file y las creaciones, ediciones y patches completados pueden abrir el cambio exacto registrado como diff nativo de VS Code.",
        "Los paneles de confirmación, Settings, controles de herramientas y compositor aprovechan el ancho en paneles amplios y evitan el overflow global en paneles estrechos.",
        "Contratos, tools integradas, revisión de comandos, orquestación del chat, adaptadores del workspace, Settings, UI de Chat y tests se reorganizaron por dominio conservando mensajes públicos, nombres de tools, ajustes e historial.",
      ],
    },
    {
      title: "0.1.3 seguridad del workspace y coordinación de generaciones",
      items: [
        "Elevada la reserva de salida predeterminada de DeepSeek de 8.192 a 65.536 tokens, conservando el máximo de 384K y documentando su relación con el contexto de 1M tokens.",
        "Convertido el límite de rondas en un checkpoint: los modos desatendidos preguntan a DeepSeek si debe continuar, pedir instrucciones o parar, y los modos atendidos conservan la decisión del usuario.",
        "Mejorada la adaptación a anchos extremos en Settings, permisos de herramientas, compositor/footer del chat e Historial, incluidos los paneles laterales más estrechos de VS Code.",
        "Añadida una generación activa por conversación con concurrencia configurable entre conversaciones de 1 a 16 y valor predeterminado 8.",
        "Añadidos los controles Queue message e Interrupt and guide, cancelación dirigida y eventos de streaming y herramientas vinculados a su generación.",
        "Añadidos checkpoints atómicos que recuperan salida parcial, cancelan herramientas sin finalizar y exponen prompts encolados como borradores tras reiniciar.",
        "Introducido el esquema de conversación v2 con propiedad de generación y una migración verificada durante la activación para historiales antiguos válidos o parcialmente migrados; la compatibilidad permanece hasta que se publique su limpieza programada.",
        "Cada generación queda fijada al workspace de su conversación y las herramientas mutantes se serializan por workspace, permitiendo lecturas concurrentes.",
        "Añadidos bindings con revisión, aliases multi-root deterministas, reasignación de historiales desconectados, autocomplete solo con ./ y snapshots externos acotados que no conceden acceso a herramientas.",
        "Añadido cierre coordinado del provider para guardar checkpoints, cancelar y vaciar escrituras durante la desactivación de la extensión.",
        "Añadidos transcripts canónicos de tools solo en el host, conservando razonamiento, argumentos JSON, resultados, orden de protocolo, recuperación por checkpoint y replay seguro.",
        "Añadidos presupuesto total de petición, resúmenes atómicos de conversación y extracción literal de líneas relevantes para referencias grandes, con un máximo de cuatro llamadas auxiliares a DeepSeek y fallback local determinista.",
      ],
    },
    {
      title: "0.1.1 fiabilidad y seguridad",
      items: [
        "Sustituidos los marcadores de control en texto por un timeline cronológico nativo de razonamiento, contenido y grupos de herramientas.",
        "Unificados los estados de herramientas y corregidos rechazo, cancelación, confirmación del host, llamadas pendientes obsoletas, duplicados y finalización por máximo de rondas.",
        "Añadida cancelación real del árbol de procesos y resultados de terminal no interactivos y estructurados, con salida limitada y análisis de peligro según la plataforma.",
        "Reforzados SSE, validación de respuestas, unión de URLs, timeouts, reintentos con Retry-After y agrupación de streams en React.",
        "Movidos los ajustes y el historial a ~/.yrs-dpsk-copilot/. El historial usa un JSON validado por conversación y no depende de un índice separado.",
        "Añadidos asociación de conversaciones multi-root, recorte de contexto, Git staged, detección de binarios, referencias delimitadas, límites de AGENTS.md y hashes optimistas de archivos.",
        "Corregido el borrado del historial: eliminar la conversación activa limpia Chat view y eliminar otra conserva el chat actual.",
        "Completada la mejora de accesibilidad y UX con gestión de foco en modales, autoscroll controlado, borradores durante streaming, UI localizada, permisos para herramientas del workspace, ajustes recuperables e historial paginado.",
      ],
    },
    {
      title: "0.1.0 preview",
      items: [
        "Introducida la arquitectura de código por capas, la webview React de chat, History, Settings, configuración de herramientas, autocompletado de rutas y empaquetado para Marketplace.",
        "Producto centrado en DeepSeek y API keys almacenadas en VS Code Secret Storage.",
      ],
    },
  ],
};
