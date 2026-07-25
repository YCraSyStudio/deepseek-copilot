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
        "Abre Yar's DeepSeek Copilot desde la Activity Bar e introduce la API key en Settings. La clave se guarda en VS Code Secret Storage.",
        "Elige el modelo, thinking mode, reasoning effort, límite de respuesta, máximo de rondas de herramientas y límite de generaciones concurrentes. La concurrencia predeterminada es 8 y admite valores entre 1 y 16.",
        "Escribe ./ o ../ para autocompletar rutas del workspace, o usa los menús contextuales del explorador y del editor para adjuntar archivos y selecciones exactas.",
        "Usa Stop generation para interrumpir la petición actual y cualquier árbol de procesos de terminal activo. El prompt y la respuesta parcial disponible permanecen en el historial como un turno interrumpido.",
      ],
    },
    {
      title: "Generaciones concurrentes y colas",
      items: [
        "En cada conversación solo se ejecuta una generación a la vez. Los prompts adicionales de esa conversación se encolan por orden de envío.",
        "Distintas conversaciones pueden generar de forma concurrente hasta el límite global configurado.",
        "Mientras hay una respuesta activa, Queue message añade el borrador al final e Interrupt and guide coloca la indicación al principio de la cola antes de detener la generación actual.",
        "Cambiar de conversación o recrear la webview no mezcla eventos de streaming o herramientas entre ejecuciones; cada evento está asociado a su generación y conversación.",
        "Si VS Code se cierra, la salida parcial se restaura como interrumpida, las herramientas sin finalizar pasan a cancelled y los prompts encolados se ofrecen como borradores recuperables en la siguiente activación.",
      ],
    },
    {
      title: "Permisos y estados de herramientas",
      items: [
        "chat no expone herramientas; read-only permite read_file, list_directory y search_content; workspace añade creación y edición de archivos; full-access añade la ejecución de terminal; auto-approve expone todas las herramientas no deshabilitadas y delega su aprobación a DeepSeek.",
        "Cada herramienta puede deshabilitarse, requerir aprobación manual o usar aprobación automática solo para operaciones seguras. El modo global Aprobación automática considera las tool calls de DeepSeek como aprobación y omite las confirmaciones heurísticas; úsalo solo en workspaces de confianza.",
        "Las tool calls pasan por awaiting confirmation, running y un único estado final: completed, rejected, cancelled o error.",
        "El host de la extensión confirma las acciones de ejecutar y rechazar antes de que la webview fije el estado visible.",
        "Las tool calls de una ronda se ejecutan secuencialmente. Las llamadas idénticas repetidas se omiten y el límite configurable de rondas detiene los bucles.",
        "Las herramientas de solo lectura pueden ejecutarse entre conversaciones concurrentes, mientras que las mutaciones de archivos y terminal se serializan dentro del mismo workspace.",
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
      title: "Ejecución de terminal",
      items: [
        "Los comandos de terminal son no interactivos: no pueden responder a prompts ni disponer de una TTY.",
        "El resultado registra stdout, stderr, código de salida, señal, timeout, cancelación, directorio efectivo y shell.",
        "La salida está limitada; si se trunca, se conservan el principio y el final y se marca la parte central omitida.",
        "Fuera de la Aprobación automática global, los comandos desconocidos requieren precaución. Se revisan las cadenas de Bash, PowerShell y cmd, publicaciones, despliegues, cambios remotos, gestores de paquetes, redirecciones y operaciones destructivas.",
      ],
    },
    {
      title: "Historial y privacidad",
      items: [
        "Los ajustes se guardan en ~/.yrs-dpsk-copilot/settings.json. La API key permanece en Secret Storage de VS Code.",
        "El historial se guarda globalmente como un archivo JSON por conversación en ~/.yrs-dpsk-copilot/history/ y cada entrada muestra su workspace de origen.",
        "Puede deshabilitarse y su retención puede configurarse entre 0 días (solo borrado manual) y 3650 días. El valor predeterminado es 30 días.",
        "La lista se reconstruye directamente desde archivos de conversación validados. El almacenamiento está limitado a 100 conversaciones y 24 MiB.",
        "Borrar una conversación o todas las visibles usa una confirmación nativa de VS Code y ofrece Deshacer. El borrado cancela primero la generación activa de esa conversación, limpia su cola y checkpoint, y vacía Chat view cuando se elimina la conversación seleccionada.",
        "Los archivos de conversación usan el esquema versión 2 y asocian los mensajes con el resultado de su generación. Al activar, los archivos antiguos válidos o migrados parcialmente se actualizan atómicamente con una propiedad de generación determinista. La compatibilidad no caduca en runtime y permanece hasta que se publique su limpieza programada.",
        "El trabajo activo se guarda sin la API key en checkpoints bajo ~/.yrs-dpsk-copilot/generation-checkpoints/. Las herramientas pending o running interrumpidas se restauran como cancelled; los historiales y checkpoints corruptos se aíslan en sus respectivos directorios corrupt.",
      ],
    },
    {
      title: "Contexto y comandos slash",
      items: [
        "Auto context incluye el editor activo y los cambios staged y unstaged de Git con límites de tiempo y tamaño.",
        "Los archivos referenciados y las instrucciones AGENTS.md tienen límites de tamaño, usan etiquetas relativas al workspace y se delimitan como datos no confiables.",
        "El contexto de conversación se recorta a un presupuesto acotado; los resultados grandes, el razonamiento y los archivos se acortan por el centro.",
        "Usa /context para inspeccionar qué enviaría una petición normal. También están disponibles /status, /tools, /mode, /auto-context, /review, /goal, /summarize y /clear-context.",
      ],
    },
  ],
};
