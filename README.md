# hls-ai-studio

Plugin de Claude Code de **HighLevel Studio** para llevar a **GoHighLevel AI Studio** los
sitios que hiciste con el skill **scroll-craft**, con todas sus páginas.

Trae dos skills:

- **`agregar-pagina`**: le agrega páginas a tu sitio (contacto, nosotros, cada servicio)
  con la misma marca de tu home.
- **`migrar-a-ai-studio`**: pasa el sitio completo a tu proyecto de AI Studio.

AI Studio no importa archivos ZIP: todo entra por su chat. Si le pasas el código sin
guía, su chat lo cambia por su cuenta. Este plugin hace el trabajo difícil antes de que
pegues nada:

1. **Convierte tu sitio** a la plantilla de *tu* proyecto de AI Studio. Cada página queda
   idéntica, con su propia dirección (`/contacto`, `/servicios/…`): el HTML, el CSS y los
   scripts van tal cual.
2. **Lo prueba en tu compu**, sobre esa plantilla real. Lo compila como AI Studio y compara
   cada página con su original, elemento por elemento y píxel por píxel, en escritorio y
   en teléfono.
3. **Te da un kit:**
   - los mensajes para el chat de AI Studio, un archivo por mensaje;
   - tus imágenes y videos en grupos de 5 (el máximo que acepta el chat);
   - el mensaje para conectar tus formularios al CRM con el formulario nativo de AI Studio;
   - una guía paso a paso en español.
4. **Revisa lo que construyó AI Studio.** Le das el ZIP que exporta y te dice qué
   archivo quedó distinto, con el mensaje exacto para corregirlo. También prueba tu URL
   publicada, página por página, y hace un envío de prueba de cada formulario sin crear
   contactos.

## Qué necesitas

- **Claude Pro** o superior (Max, Team o Enterprise). El plan gratis no incluye Claude Code.
- **La app de escritorio de Claude**, con su pestaña **Code**, o Claude Code en la terminal.
- **Node.js** LTS, 20.19 o más reciente ([nodejs.org](https://nodejs.org)).
- **Google Chrome**: las pruebas usan el que ya tienes instalado.
- **ffmpeg**, para los videos de scroll-craft: `brew install ffmpeg` en Mac,
  `winget install Gyan.FFmpeg` en Windows.
- **Una cuenta de GoHighLevel con AI Studio.**

**Manual para alumnos, paso a paso:** https://claude.ai/artifact/PDu8xQVHPH7kJCgbhANxNU

## Instalar (una sola vez por computadora)

Los plugins se instalan una vez y funcionan en cualquier carpeta. Tus sitios viven todos
en una sola carpeta de trabajo, «Mis sitios». Adentro, cada sitio y su migración reciben su
propia subcarpeta automáticamente.

### La forma fácil: la carpeta «Mis sitios»

1. Descarga
   [Mis-sitios.zip](https://github.com/oswaldoaviles/hls-ai-studio/releases/latest/download/Mis-sitios.zip)
   y descomprímelo en Documentos.
2. En la app de Claude, pestaña **Code**, abre la carpeta «Mis sitios». Si te pregunta si
   confías en ella, di que sí.
3. Escribe **«Prepara mi carpeta»**. Claude revisa que estén **scroll-craft** y este plugin,
   y los instala si falta alguno.

La carpeta ya trae las instrucciones para Claude (en español) y la configuración para que
los dos plugins se actualicen solos.

### Con comandos, en una terminal con Claude Code

```bash
claude plugin marketplace add nateherkai/scroll-craft
claude plugin install nateherk-design@nateherk
claude plugin marketplace add oswaldoaviles/hls-ai-studio
claude plugin install hls-ai-studio@highlevel-studio
```

Dentro de una sesión de Claude Code en la terminal también sirven `/plugin marketplace add
…` y `/plugin install …`. En la app de escritorio `/plugin` no está disponible: usa la
carpeta «Mis sitios» o pídele a Claude que instale los plugins.

## Usar

Abre la carpeta «Mis sitios» en Claude Code y pide lo que quieras:

- **Crear un sitio:** «Hazme la página principal de …». Lo hace scroll-craft, en
  `scrollcraft/builds/<nombre>/`.
- **Agregarle una página:** «En el sitio `<nombre>`, crea la página de contacto».
- **Pasarlo a AI Studio:** «Migra mi sitio a AI Studio. El ZIP de mi proyecto en blanco
  está en Descargas.»

Usa **una conversación nueva por tarea**: una para crear el home y otra por cada página.
En esa misma conversación ajustas lo que haga falta. Todo queda guardado en los archivos
del sitio, así que no se pierde nada entre conversaciones.

### Agregar páginas a tu sitio

```
scrollcraft/builds/<sitio>/
  index.html               →  /                  el home
  nosotros.html            →  /nosotros
  contacto.html            →  /contacto
  servicios/<slug>.html    →  /servicios/<slug>
  sitio.css                   lo que comparten todas: colores, fuentes, menú, pie y botones
  MARCA.md                    la guía de marca del sitio
```

La primera vez que le agregas una página a un sitio, Claude arma su guía de marca,
`MARCA.md`, con lo que tu home ya decidió: colores, tipografías, tono, estilo de fotos y
menú. También le pone el menú al home. Cada página nueva sigue esa guía. Si cambias una
regla de tu marca, edítala ahí.

- **Una página de servicio** tiene la experiencia completa de scroll-craft, como el home.
- **Contacto, nosotros, gracias o legales** son páginas sencillas: Claude solo te pregunta
  qué quieres que digan.

Antes de entregarte la página, Claude revisa que combine con el home: colores, fuentes,
menú y pie de página.

### Migrar

Claude:

1. revisa que tengas todo;
2. te pregunta si quieres darle un form ID específico a tu formulario (si no, el del home
   se llama `registro` y el de cada página lleva su nombre, como `contacto`);
3. convierte y prueba todas las páginas;
4. te entrega la carpeta `kit/` con la guía `PASOS.md`.

Después tú pegas los mensajes en el chat de AI Studio, uno por uno. Si su chat responde
algo raro, cópiale a Claude la respuesta: él te dice qué contestar.

Cuando termines, descarga el ZIP de tu proyecto de AI Studio y pásaselo a Claude junto
con la URL de la vista previa: te dice si quedó exacto y te da las correcciones que
falten.

Con tu dominio conectado, pide **«haz el SEO final de mi sitio»**. Claude agrega la URL
canónica de cada página, los datos estructurados, el `sitemap.xml` con todas tus páginas y
el `robots.txt`, y lo revisa en tu dominio. Desde el principio, cada página lleva sus
propios títulos y descripciones para Google y redes, nunca los genéricos de AI Studio.

### Agregar páginas cuando tu sitio ya está en AI Studio

Descarga el ZIP actual de tu proyecto (**Code → Download Codebase**) y pide **«pasa las
páginas nuevas a AI Studio»**. El kit trae **solo lo nuevo o cambiado**: tus imágenes ya
subidas y tu conexión al CRM se conservan.

## Actualizaciones

Cuando este plugin (o scroll-craft) publica una versión nueva, tu Claude Code la descarga
solo, en segundo plano. A lo mucho te pide escribir `/reload-plugins`.

## Antes de publicar en tu dominio

- **Lead de prueba real:** regístrate con tu correo en la vista previa y revisa que el
  contacto llegue a **Contactos** y a **Sites › Forms › Submissions › External Forms**.
- **Workflows:** los que dependan de un formulario necesitan el formulario nuevo en su
  disparador («AI Studio Form Submitted» o «External Tracking Event»).
- **Dominio:** conecta tu dominio principal en la publicación del proyecto y
  vuelve a publicar.

## Límites

- **Un proyecto de AI Studio por sitio:** cada proyecto usa su propio dominio. Todas las
  páginas de tu sitio van en el mismo proyecto.
- **El blog todavía no:** llega en una versión próxima. Vas a escribir tus posts en el blog
  de GoHighLevel y se van a ver en `tudominio.com/blog`, con el diseño de tu sitio.
- **Dos formularios en la misma página:** el segundo recibe el mismo ID con `-2` (por
  ejemplo, `contacto-2`). Si quieres otro nombre, díselo a Claude.
- **Videos (MP4) y WebP/AVIF:** falta confirmar que el chat de AI Studio los acepte. Si
  alguno no pasa, Claude te da la alternativa.
- **Apps TanStack o React:** la conversión automática es para páginas HTML de
  scroll-craft. Claude puede migrar una app así, pero armando los archivos a mano.

## Para quien mantiene el plugin

**Publicar una versión nueva:**

1. Sube `version` en `.claude-plugin/plugin.json`. Sin ese cambio, las actualizaciones no
   les llegan a los alumnos.
2. Haz commit y push.
3. Crea un Release con `Mis-sitios.zip`, armado desde `carpeta-inicial/` con la carpeta
   raíz `Mis sitios/`.

Los archivos de `carpeta-inicial/` se quedan en la computadora de cada alumno y no se
actualizan solos: mantenlos mínimos. Todo lo que evoluciona va en el plugin.

**Probar:**

La prueba completa es `tests/e2e.mjs`. Crea un sitio de prueba de cuatro páginas (una en
la subcarpeta `servicios/`) con imágenes, videos, dos formularios, una hoja compartida y
scripts propios, y lo lleva por todo el flujo sobre una plantilla real de AI Studio.
Después:

- revisa el kit contra un ZIP simulado de AI Studio, limpio y alterado;
- simula un sitio que ya está en AI Studio con solo su home, y comprueba que el kit
  incremental (`kit.mjs --desde`) mande solo lo nuevo y conserve las URLs de las imágenes.

```bash
node tests/e2e.mjs --plantilla /ruta/al/proyecto-en-blanco.zip
```

Las reglas de AI Studio que se aprendieron migrando (y su remedio) están en
`skills/migrar-a-ai-studio/references/reglas-ai-studio.md`. Si AI Studio cambia,
actualízalas ahí.
