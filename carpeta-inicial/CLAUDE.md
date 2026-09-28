# Mis sitios · instrucciones para Claude

Esta carpeta es el espacio de trabajo de un alumno de HighLevel Studio. Aquí crea sus
sitios con **scroll-craft**, les agrega páginas con **agregar-pagina** y los pasa a
**GoHighLevel AI Studio** con **migrar-a-ai-studio**. Para muchos alumnos es su primera vez con Claude Code.

## Cómo hablarle

- Siempre en español, en pasos cortos y concretos, sin tecnicismos.
- Tú corres los comandos. Al alumno solo pídele lo que tiene que hacer él: abrir una
  carpeta, descargar un ZIP, pegar un mensaje en AI Studio.
- Dile dónde queda cada cosa, con su ruta completa. En Mac, ofrece abrirla con `open`.

## Al empezar, o cuando diga «Prepara mi carpeta»

1. Revisa que tengas las skills `nateherk-design:scroll-craft`,
   `hls-ai-studio:agregar-pagina` y `hls-ai-studio:migrar-a-ai-studio`. Aparecen entre tus
   skills disponibles.
2. Si falta alguna, instálala para su usuario, así funciona en todas sus carpetas.
   - **Busca el programa `claude`**, en este orden:
     1. `claude`, si está en el PATH;
     2. en Mac, el que trae la app:
        `~/Library/Application Support/Claude/claude-code/<versión>/claude.app/Contents/MacOS/claude`
        (usa la versión más reciente);
     3. si no hay ninguno, `npx -y @anthropic-ai/claude-code` (necesita Node.js).
   - **Instala con ese programa:**

     ```
     <claude> plugin marketplace add nateherkai/scroll-craft
     <claude> plugin install nateherk-design@nateherk
     <claude> plugin marketplace add oswaldoaviles/hls-ai-studio
     <claude> plugin install hls-ai-studio@highlevel-studio
     ```

   - **Recarga:** pídele que escriba `/reload-plugins` o que abra una sesión nueva, y
     confirma que ya las tienes.
3. Revisa los programas que usan las skills: Node.js, Google Chrome y ffmpeg. Si falta
   alguno, dile cómo instalarlo:
   - **Node.js:** la versión LTS, de nodejs.org.
   - **Google Chrome:** de google.com/chrome.
   - **ffmpeg:**
     - en Mac, `brew install ffmpeg` (si no tiene Homebrew, primero instálalo desde brew.sh);
     - en Windows, `winget install Gyan.FFmpeg`.

## El trabajo

- **Una conversación por tarea:** una página nueva, otro sitio u otro día van en una
  conversación nueva. Si no sabes en qué sitio trabajar, lista los de
  `scrollcraft/builds/` y pregunta cuál.
- **Crear un sitio:** usa scroll-craft. Cada sitio queda en `scrollcraft/builds/<nombre>/`
  (lo fija `.scrollcraft.json`, aunque se abra una subcarpeta).
- **Agregar páginas** (contacto, nosotros, servicios): usa agregar-pagina. Sigue la marca
  del sitio, que está en su `MARCA.md`.
- **Pasarlo a AI Studio:** usa migrar-a-ai-studio. Su espacio de trabajo va junto al sitio,
  en `scrollcraft/builds/<nombre>-ai-studio/`.
- **Los ZIP de AI Studio** suelen estar en la carpeta Descargas del alumno.
- **No borres ni muevas** nada de `scrollcraft/builds/` sin preguntarle: ahí están sus
  sitios.
