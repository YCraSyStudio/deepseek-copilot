import type { PageContent } from "../Types";

export const changelog: PageContent = {
  navTitle: "Changelog",
  title: "Changelog",
  description: "Cambios relevantes y estado preview.",
  lead: "La versión 0.1.9 aísla los chats concurrentes, hace atómica la cancelación, calibra la compactación del contexto, recupera desbordamientos de salida y publica builds Preview en el canal normal de Marketplace mientras mantiene las releases de GitHub como prereleases.",
  sections: [
    {
      title: "0.1.9 aislamiento de chats concurrentes, cancelación y contexto calibrado",
      items: [
        "Las generaciones concurrentes usan ahora eventos de protocolo asociados a conversación y generación, IDs de navegación, actividad en segundo plano y restauración por snapshots sin filtrar actualizaciones a otro chat.",
        "Stop elimina el turno cancelado completo y restaura su prompt como borrador. La cancelación se propaga por el descubrimiento de contexto, streaming, navegador, confirmaciones, herramientas, descendientes del terminal y persistencia con un único resultado terminal.",
        "La compactación automática usa presupuestos calibrados por el proveedor, texto UTF-8 acotado y rangos de archivo fusionados; solo registra reducciones efectivas y transfiere de forma segura ciclos de herramientas cerrados cerca del límite de contexto.",
        "Las respuestas con mucho razonamiento reciben recuperación preventiva ante desbordamiento de salida, manteniendo visibles los estados incompletos y la compatibilidad con historiales y checkpoints antiguos.",
        "Marketplace recibe ahora builds por el canal normal mientras package.json conserva preview: true, y las releases de GitHub siguen marcadas como prereleases. Una conversación restaurada desde otro workspace o ventana de VS Code inicia automáticamente un chat nuevo ligado al workspace actual.",
      ],
    },
    {
      title: "0.1.8 búsqueda headless humana y lecturas semánticas aisladas",
      items: [
        "La búsqueda abre la página principal de Bing, Google o Baidu, enfoca el campo, escribe con pequeñas pausas y envía con Enter. Bing es el buscador predeterminado; CAPTCHA, bloqueos y tiempos agotados son fallos terminales sin navegador visible ni reintentos automáticos.",
        "La búsqueda devuelve hasta diez URL HTTPS orgánicas y normalizadas. read_web solo acepta una URL exacta registrada en su search_id, salvo URL proporcionadas explícitamente por el usuario.",
        "Las lecturas conservan únicamente títulos y párrafos de document.body, agrupan el contenido contiguo en secciones numeradas estables, dividen secciones largas entre párrafos y paginan mediante cursores opacos sin renumerar.",
        "Cada lectura utiliza un nonce criptográfico nuevo de 128 bits alrededor de contenido no confiable serializado de forma segura en JSON, con recordatorios contra inyección antes y después de los datos y regeneración ante colisiones.",
        "Ajustes incorpora pestañas propias para API y Búsqueda web. Se eliminaron los ajustes web nativos obsoletos, el navegador visible, el CAPTCHA manual y los presupuestos configurables de aviso, manteniendo el proxy aislado y los límites de navegación.",
      ],
    },
    {
      title: "0.1.7 rediseño de la búsqueda web integrada y compactación del contexto",
      items: [
        "Rediseñada la búsqueda web del navegador integrado en una única página reutilizable de VS Code: las búsquedas se escriben en el motor activo, los resultados registrados se abren con un clic, la navegación vuelve por el historial del navegador y sigue disponible un modo de compatibilidad cuando faltan las herramientas nuevas del navegador.",
        "Añadidos fallback localizado para DuckDuckGo, Bing, Google y Yahoo, análisis semántico de resultados orgánicos, decodificación de redirecciones de Bing, validación de HTTPS público, cachés acotadas, respuestas compactas, extracción semántica de páginas y diagnósticos de navegador saneados.",
        "Sustituidos los IDs de página visibles al modelo, las referencias al DOM, la navegación arbitraria y el seguimiento genérico de enlaces por IDs opacos de búsqueda/documento y solo dos herramientas restringidas: search_web y la read_web multimodo.",
        "Compactado el contexto de las conversaciones completadas a pares usuario/respuesta final, conservando los transcripts completos solo para la recuperación activa o incompleta, y compactación diferida del contenido web duplicado al guardar de nuevo el historial.",
      ],
    },
    {
      title: "0.1.6 privacidad, fiabilidad y observabilidad de uso",
      items: [
        "Añadido el modo Incógnito para chats efímeros: prompts, referencias, checkpoints y uso permanecen en memoria hasta que el usuario guarda o descarta explícitamente la conversación.",
        "Añadido uso informado por el proveedor por fase, generación y conversación, incluidos tokens de razonamiento anidados y valores separados de acierto y fallo de caché. Los valores ausentes se muestran como no disponibles, nunca como cero.",
        "Añadidas estimaciones con los precios oficiales actuales de DeepSeek V4 Flash/Pro y versión de catálogo persistida, desglose local, diagnósticos redactados y presupuestos de aviso para llamadas auxiliares, entrada sin caché, salida y coste de generación.",
        "Reforzados la integridad de tool calls, buffers sin guardar, almacenamiento concurrente, streams parciales, cierre de procesos, protocolo de webview, validación del proveedor, diagnósticos, CI y controles del VSIX empaquetado.",
      ],
    },
    {
      title: "0.1.5 hotfix de empaquetado",
      items: [
        "Añadida una exclusión explícita para *.log en las reglas del paquete VSIX, evitando distribuir archivos locales como debug.log.",
      ],
    },
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
