import type { PageContent } from "../Types";

export const userManual: PageContent = {
  navTitle: "Manual",
  title: "Manual de usuario",
  description: "Configura y usa el chat, las herramientas, los permisos, el contexto y el historial del workspace.",
  lead: "Configura la API key, elige un modo de permisos y usa DeepSeek desde la barra lateral con control explícito sobre cada operación del workspace.",
  sections: [
    {
      title: "Primeros pasos",
      items: [
        "Abre Yar's DeepSeek Copilot desde la Activity Bar e introduce la API key en Settings. Las credenciales se guardan por origen de API normalizado en Secret Storage de VS Code; al reabrir Settings solo se muestra una preview enmascarada como placeholder.",
        "Elige V4 Vision (Flash) o V4 Pro, thinking mode, reasoning effort, reserva de salida y límite de generaciones concurrentes. Las capacidades V4 registradas usan 1M tokens de contexto total y 384K de salida máxima; la extensión reserva 8.192 tokens de salida por defecto. La concurrencia predeterminada es 8 y admite valores entre 1 y 16.",
        "Escribe ./ para autocompletar rutas seguras del workspace. El recorrido a padres con ../ nunca se acepta. En multi-root, las rutas comienzan por un alias estable como ./frontend/src/App.tsx.",
        "Usa la única acción + o los comandos del explorador/editor para aportar contexto. Los archivos externos ordinarios se convierten en snapshots acotados y de solo lectura; las imágenes se suben a DeepSeek tras verificar su firma binaria.",
        "Usa Stop generation para cancelar la petición actual y su árbol de procesos. El prompt enviado, el timeline parcial y los resultados de tools completadas permanecen como turno cancelled; los efectos ya realizados no se revierten.",
      ],
    },
    {
      title: "Imágenes y visión",
      items: [
        "El mismo selector acepta archivos de contexto y hasta ocho imágenes JPEG, PNG, GIF o WebP. También pueden pegarse con Ctrl+V o Cmd+V; el portapapeles admite 16 MiB y el selector respeta el límite de DeepSeek de 64 MiB.",
        "V4 Vision (Flash) recibe directamente los file IDs de DeepSeek. V4 Pro solo recibe analyze_images cuando el prompt actual contiene imágenes; la tool pide a Vision una descripción textual acotada que Pro puede leer.",
        "Si Vision experimental deja de estar disponible en la API oficial, el trabajo de texto se reintenta una vez con V4 Flash estable. Un chat directo con imágenes continúa sin ellas e indica la limitación; el análisis visual de V4 Pro falla explícitamente para no confundir un modelo de texto con Vision.",
        "Las subidas usan DeepSeek Files API con purpose user_data y expiración de 30 días. Base64 solo existe durante el IPC del portapapeles y nunca se guarda en historial ni se incluye en mensajes al proveedor.",
        "Quitar una imagen del borrador intenta borrarla en local y remoto. El borrado permanente de una conversación limpia imágenes solo al terminar la ventana de Deshacer.",
      ],
    },
    {
      title: "Generaciones concurrentes y colas",
      items: [
        "En cada conversación solo se ejecuta una generación a la vez. Los prompts adicionales de esa conversación se encolan por orden de envío.",
        "Distintas conversaciones pueden generar de forma concurrente hasta el límite global configurado.",
        "Mientras hay una respuesta activa, un único botón muestra Stop con el borrador vacío y Guide cuando contiene texto. Enter reinicia el transporte y continúa la misma tarea bajo la nueva guía; mantener Ctrl cambia el botón a Queue, y Ctrl+Enter añade un borrador independiente tras la respuesta activa. Shift+Enter inserta una línea nueva.",
        "Cambiar de conversación o recrear la webview no mezcla eventos de streaming o herramientas entre ejecuciones; cada evento está asociado a su generación y conversación.",
        "Si VS Code se cierra, la salida parcial se restaura como interrumpida, las herramientas sin finalizar pasan a cancelled y los prompts encolados se ofrecen como borradores recuperables en la siguiente activación.",
      ],
    },
    {
      title: "Permisos y estados de herramientas",
      items: [
        "default confirma cada herramienta; auto-approve ejecuta automáticamente operaciones rutinarias en cualquier ubicación y confirma las elevadas o críticas; full-access ejecuta operaciones rutinarias y elevadas en cualquier ubicación y solo confirma acciones críticas que podrían inutilizar el equipo o causar una pérdida amplia e irreversible.",
        "No existe una matriz de permisos por herramienta. El interruptor de búsqueda web elimina search_web y read_web de las peticiones al modelo cuando está desactivado. El binding y Workspace Trust de VS Code siguen aplicándose.",
        "Las tool calls pasan por awaiting confirmation, running y un único estado final: completed, rejected, cancelled o error.",
        "El host de la extensión confirma las acciones de ejecutar y rechazar antes de que la webview fije el estado visible.",
        "Las tool calls de una ronda se ejecutan secuencialmente. Las llamadas idénticas se omiten hasta que una mutación del workspace hace útil repetirlas. Los ciclos no tienen límites configurables de rondas ni de llamadas por bloque; un revisor independiente comprueba el progreso tras 20 rondas completadas y cada cinco rondas posteriores sin desactivar herramientas.",
        "Las herramientas de solo lectura pueden ejecutarse entre conversaciones concurrentes, mientras que las mutaciones de archivos y terminal se serializan dentro del mismo workspace.",
      ],
    },
    {
      title: "Actividad y resultados de archivos",
      items: [
        "El razonamiento y las tool calls adyacentes aparecen contraídos en un panel Activity de forma predeterminada. Despliégalo para revisar pasos de razonamiento, estados, argumentos y resultados relevantes.",
        "El uso de la conversación aparece en un popover compacto junto al selector de permisos, incluidos totales por modelo tras cambiar de modelo. Si algunas peticiones de DeepSeek omiten el uso, las peticiones informadas aún producen un coste mínimo marcado explícitamente.",
        "Un read_file correcto no duplica el contenido del archivo en Chat. Usa Open file para inspeccionarlo en el editor; las lecturas fallidas sí muestran su diagnóstico.",
        "Las llamadas completadas de create_file, edit_file y apply_patch ofrecen View change cuando existe un diff completo. Abre el contenido anterior y posterior registrado para esa ejecución concreta, independientemente de cambios posteriores en el working tree.",
      ],
    },
    {
      title: "Búsqueda de contenido del workspace",
      items: [
        "search_content busca texto literal sin distinguir mayúsculas y minúsculas mediante el sistema de archivos del workspace de VS Code; no ejecuta una shell ni interpreta la consulta como una expresión regular. La consulta debe contener texto y está limitada a 4.096 caracteres.",
        "Su filePattern opcional es un glob relativo al workspace, como *.ts o src/**/*.md. Su valor predeterminado es **/*, admite hasta 1.024 caracteres y rechaza las rutas absolutas y el recorrido a directorios padre.",
        "Se omiten las rutas sensibles, los archivos binarios y los archivos mayores de 2 MiB. Los archivos sensibles se filtran antes de leer su contenido.",
        "Cada búsqueda considera como máximo 10.000 archivos y devuelve hasta 50 coincidencias. Las líneas y la salida total están limitadas, y la respuesta indica archivos analizados, archivos omitidos y si se truncó.",
        "La búsqueda se detiene al cancelar la petición y expira después de 15 segundos.",
      ],
    },
    {
      title: "Búsqueda web",
      items: [
        "Con la búsqueda web activa, la extensión administra el endpoint predeterminado http://127.0.0.1:8888. El primer inicio descarga el runtime SearXNG fijado para la plataforma actual, verifica su tamaño y digest SHA-256 esperados y lo ejecuta solo en loopback, sin requerir Python del sistema, Docker, Podman ni Chromium.",
        "Settings carga el catálogo de motores de la instancia configurada. La selección automática usa los valores predeterminados de la instancia; al elegir motores se envían sus shortcuts validados con cada búsqueda.",
        "Se puede configurar un endpoint SearXNG compatible. Los endpoints fuera de loopback deben usar HTTPS y se rechazan las URL con credenciales.",
        "search_web devuelve hasta diez resultados HTTPS normalizados. read_web solo acepta una URL registrada por esa búsqueda o proporcionada explícitamente por el usuario y extrae secciones inertes y acotadas de la página.",
      ],
    },
    {
      title: "Ejecución de terminal",
      items: [
        "Cada comando del agente se ejecuta de forma no interactiva y visible en un terminal integrado dedicado de VS Code mediante Shell Integration. El terminal se cierra al finalizar y el resultado capturado permanece en el chat.",
        "El resultado registra stdout/stderr acotados, código de salida, señal, timeout, cancelación, directorio efectivo y shell.",
        "La salida está limitada; si se trunca, se conservan el principio y el final y se marca la parte central omitida.",
        "Se rechazan los launchers de procesos desacoplados o en segundo plano. Los terminales del agente desactivan la reutilización de servidores de compilación y nodos de .NET para no dejar workers huérfanos ni archivos del proyecto bloqueados.",
        "En los modos automáticos, una instancia DeepSeek separada clasifica los comandos de terminal y las mutaciones de archivos como rutinarios, elevados o críticos; no existe un analizador local de peligro.",
        "El revisor recibe la petición inicial, una descripción de la acción sin contenido, hechos mecánicos de alcance y contexto acotado y no sensible de archivos del workspace nombrados explícitamente.",
        "El revisor puede aprobar, devolver restricciones para replanificar o pedir confirmación manual. Auto-approve confirma acciones elevadas y críticas; full-access confirma las críticas. Las decisiones automáticas exigen confianza medium-high o superior.",
      ],
    },
    {
      title: "Historial y privacidad",
      items: [
        "Los ajustes se guardan en ~/.yrs-dpsk-copilot/settings.json. Las credenciales permanecen en Secret Storage de VS Code, aisladas por origen normalizado, y nunca forman parte de WebviewConfig, historial o checkpoints.",
        "El historial se guarda globalmente como un archivo JSON por conversación en ~/.yrs-dpsk-copilot/history/ y cada entrada muestra su workspace de origen.",
        "Puede deshabilitarse y su retención puede configurarse entre 0 días (solo borrado manual) y 3650 días. El valor predeterminado es 30 días.",
        "Desactivar el historial activa el modo incógnito. Si hay generaciones activas o mensajes en cola, se pide confirmación antes de detenerlos y vaciarlos. Los chats incógnitos solo viven en memoria, sobreviven al cambio entre Chat, Historial y Ajustes, y se descartan al recargar la extensión o VS Code. Al salir, el chat puede guardarse explícitamente como una conversación nueva o descartarse.",
        "La lista se reconstruye directamente desde archivos de conversación validados. El almacenamiento está limitado a 100 conversaciones y 24 MiB.",
        "Borrar una conversación o todas las visibles usa confirmación nativa y ofrece Deshacer. Primero cancela el trabajo activo y limpia cola/checkpoint; las imágenes no se eliminan hasta que vence Deshacer para que la restauración sea completa.",
        "Los archivos de conversación deben usar el esquema versión 2 con un binding de workspace completo y resúmenes de contexto actuales. Al activar, cada archivo de historial incompatible, mal formado, demasiado grande o con nombre discordante se elimina permanentemente junto con sus segmentos; no se intenta ninguna migración heredada.",
        "El trabajo activo se guarda sin la API key en checkpoints bajo ~/.yrs-dpsk-copilot/generation-checkpoints/. Las herramientas pending o running interrumpidas se restauran como cancelled; solo se recuperan checkpoints de esquema 3 con un binding de workspace completo y los registros incompatibles se eliminan.",
      ],
    },
    {
      title: "Contexto y comandos slash",
      items: [
        "Auto context incluye el editor activo y los cambios staged y unstaged de Git con límites de tiempo y tamaño.",
        "Los archivos referenciados y las instrucciones AGENTS.md tienen límites de tamaño, usan etiquetas relativas al workspace y se delimitan como datos no confiables.",
        "El presupuesto total incluye system prompts, esquemas de herramientas, historial, referencias, salida reservada y margen de seguridad. Las generaciones antiguas completas se resumen de forma atómica y los archivos grandes se reducen a rangos de líneas literales relevantes. Nunca se truncan argumentos, razonamiento obligatorio ni ciclos de herramientas activos.",
        "Usa /context para inspeccionar qué enviaría una petición normal. También están disponibles /status, /tools, /mode, /auto-context, /review, /goal, /summarize y /clear-context.",
      ],
    },
  ],
};
