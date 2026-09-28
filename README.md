# hls-ai-studio

Plugin de Claude Code de **HighLevel Studio** para llevar a **GoHighLevel AI Studio** los
sitios que hiciste con el skill **scroll-craft**.

AI Studio no importa archivos ZIP: todo entra por su chat. Si le pasas el código sin
guía, su chat lo cambia por su cuenta. Este plugin hace el trabajo difícil antes de que
pegues nada:

1. **Convierte tu página** a la plantilla de *tu* proyecto de AI Studio. Queda idéntica:
   el HTML, el CSS y los scripts van tal cual.
2. **La prueba en tu compu**, sobre esa plantilla real. La compila como AI Studio y la
   compara con tu página original, elemento por elemento y píxel por píxel, en escritorio
   y en teléfono.
3. **Te da un kit:**
   - los mensajes para el chat de AI Studio, un archivo por mensaje;
   - tus imágenes y videos en grupos de 5 (el máximo que acepta el chat);
   - el mensaje para conectar tu formulario al CRM con el formulario nativo de AI Studio;
   - una guía paso a paso en español.
4. **Revisa lo que construyó AI Studio.** Le das el ZIP que exporta y te dice qué
   archivo quedó distinto, con el mensaje exacto para corregirlo. También prueba tu URL
   publicada y hace un envío de prueba del formulario sin crear contactos.

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

- **Crear un sitio:** «Hazme una landing para …». Lo hace scroll-craft, en
  `scrollcraft/builds/<nombre>/`.
- **Pasarlo a AI Studio:** «Migra mi sitio a AI Studio. El ZIP de mi proyecto en blanco
  está en Descargas.»

Al migrar, Claude:

1. revisa que tengas todo;
2. te pregunta si quieres darle un form ID específico a tu formulario (si no, se llama
   `registro`);
3. convierte y prueba tu página;
4. te entrega la carpeta `kit/` con la guía `PASOS.md`.

Después tú pegas los mensajes en el chat de AI Studio, uno por uno. Si su chat responde
algo raro, cópiale a Claude la respuesta: él te dice qué contestar.

Cuando termines, descarga el ZIP de tu proyecto de AI Studio y pásaselo a Claude junto
con la URL de la vista previa: te dice si quedó exacto y te da las correcciones que
falten.

Con tu dominio conectado, pide **«haz el SEO final de mi sitio»**. Claude agrega la URL
canónica, los datos estructurados, el `sitemap.xml` y el `robots.txt`, y lo revisa en tu
dominio. Desde el principio, tu página lleva sus propios títulos y descripciones para
Google y redes, nunca los genéricos de AI Studio.

## Actualizaciones

Cuando este plugin (o scroll-craft) publica una versión nueva, tu Claude Code la descarga
solo, en segundo plano. A lo mucho te pide escribir `/reload-plugins`.

## Antes de publicar en tu dominio

- **Lead de prueba real:** regístrate con tu correo en la vista previa y revisa que el
  contacto llegue a **Contactos** y a **Sites › Forms › Submissions › External Forms**.
- **Workflows:** los que dependan del formulario necesitan el formulario nuevo en su
  disparador («AI Studio Form Submitted» o «External Tracking Event»).
- **Dominio:** conecta tu dominio principal en la publicación del proyecto y
  vuelve a publicar.

## Límites

- **Una página por migración:** tu `index.html` va a la página principal.
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

La prueba completa es `tests/e2e.mjs`. Crea una página de prueba con imágenes, videos,
un formulario y scripts propios, y la lleva por todo el flujo sobre una plantilla real
de AI Studio. Al final revisa el kit contra un ZIP simulado de AI Studio, limpio y
alterado.

```bash
node tests/e2e.mjs --plantilla /ruta/al/proyecto-en-blanco.zip
```

Las reglas de AI Studio que se aprendieron migrando (y su remedio) están en
`skills/migrar-a-ai-studio/references/reglas-ai-studio.md`. Si AI Studio cambia,
actualízalas ahí.
