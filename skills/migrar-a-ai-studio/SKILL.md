---
name: migrar-a-ai-studio
description: >
  Migra a GoHighLevel AI Studio (GHL AI Studio, HighLevel AI Studio) un sitio
  hecho con scroll-craft: lo convierte a la plantilla TanStack del proyecto del
  alumno, lo prueba sobre esa plantilla real junto al original, y entrega un kit
  con los mensajes para el chat de AI Studio (uno por archivo), las imágenes en
  grupos de 5, la conexión del formulario nativo al CRM y una guía en español.
  Después compara el ZIP que exporta AI Studio y prueba la URL publicada sin
  crear contactos. Úsalo cuando el alumno diga "migra mi sitio a AI Studio",
  "pasa mi página a GoHighLevel", "súbelo a AI Studio", "transferir la web a
  AI Studio", "quiero mi landing en HighLevel", o comparta un ZIP de AI Studio
  o una URL vibepreview.app de una migración en curso.
---

# Migrar un sitio a GoHighLevel AI Studio

AI Studio no importa ZIP: el código solo entra por su chat (o por su editor **Code**).
Su chat cambia archivos por su cuenta si no se le guía. Este skill convierte el sitio,
lo prueba antes de que el alumno pegue nada, y le entrega mensajes que el chat procesa
bien. Todo lo que se sabe de AI Studio está en
[references/reglas-ai-studio.md](references/reglas-ai-studio.md): léelo antes de
empezar la primera migración de la sesión.

`<skill>` es la carpeta de este archivo (Claude Code la muestra como «Base directory for
this skill»). Los scripts están en `<skill>/scripts/`.

## Cómo trabajar con el alumno

- Habla en español, en pasos cortos y concretos. El alumno sabe GoHighLevel, no
  necesariamente código ni terminal.
- Tú corres los scripts. El alumno solo pega mensajes en AI Studio, adjunta archivos,
  descarga el ZIP y te pasa la URL.
- Dile siempre dónde está cada cosa, con su ruta completa. En macOS ofrece abrir la
  carpeta con `open <carpeta>`.
- Si el alumno no sabe abrir o copiar un `.md`, dale el mensaje directo en el chat, en
  un bloque de código que pueda copiar. Uno a la vez: el siguiente cuando te diga qué
  respondió AI Studio.
- Nunca le digas que algo quedó si no lo verificaste con los scripts o con el ZIP.

## Flujo

### 1. Lo que hace falta

1. **El sitio.** Un build de scroll-craft: una carpeta con `index.html`, `scrollcraft.js`,
   `scrollcraft.css` y `assets/`. Si no sabes cuál, busca en el workspace de scroll-craft
   (`<workspace>/builds/<nombre>/`) y confírmalo con el alumno. Si es una app
   TanStack/React y no HTML, sigue [Si el sitio no es HTML](#si-el-sitio-no-es-html).
2. **El ZIP de su proyecto nuevo, en blanco.** Pídele que en AI Studio cree un proyecto
   nuevo, no le pida nada al chat y lo descargue: **Code → Download Codebase**, o
   **Project Settings → Download Codebase**. El kit se prueba sobre esa plantilla, así
   que ninguna otra sirve: la plantilla cambia entre versiones.
3. **El form ID**, si la página tiene formulario. Hazle al alumno una sola pregunta y
   no propongas nombres:

   > ¿Quieres darle un form ID específico a tu formulario? Si no, se llamará `registro`.

   - Si da uno, úsalo tal cual con `--form-id`. Si no, no pases nada: el ID genérico es
     `registro`.
   - El mismo ID se usa como nombre en el CRM, fuente del contacto y medio.
   - Nada de «landing», «nueva», versiones ni fechas: el ID debe servir aunque rehaga la
     página.

### 2. El espacio de trabajo

Una carpeta junto al build, no dentro, porque lleva `node_modules` y una copia de la
plantilla. En la carpeta «Mis sitios» de HighLevel Studio, el build está en
`scrollcraft/builds/<nombre>/` y el espacio de trabajo queda al lado, en
`scrollcraft/builds/<nombre>-ai-studio/`:

```bash
node <skill>/scripts/doctor.mjs --preparar "<build>-ai-studio"
cd "<build>-ai-studio" && node <skill>/scripts/doctor.mjs
```

`doctor.mjs` revisa Node ≥ 20.19, npm, las dependencias y Google Chrome (las pruebas usan
el Chrome instalado). Si algo falta, dile al alumno qué instalar y dónde.

Todos los comandos que siguen corren **dentro** del espacio de trabajo.

### 3. Convertir

```bash
node <skill>/scripts/convertir-html.mjs "<build>" --plantilla "<zip en blanco>" [--form-id <id>]
```

Qué hace:

- **HTML:** el `<body>` va tal cual, como texto, partido en `src/components/pagina/html-NN.ts`.
  No se traduce a JSX, así que la página queda idéntica y los textos se editan ahí.
- **CSS:** la hoja de la página va en `css-NN.ts` y se inyecta en el `<head>`. El
  preflight de Tailwind de la plantilla se deshace en esa ruta (ver las reglas).
- **Motor:** `scrollcraft.js` y `scrollcraft.css` van a `src/lib/`, sin comentarios. El
  código no se toca.
- **Scripts:** los de la página corren después de montar el motor, en su orden.
  `DOMContentLoaded` y `load` se atienden aunque ya hayan pasado.
- **Assets:** cada referencia a `assets/` se vuelve un token que se resuelve con
  `image-urls.ts`, que el chat llena al subir los archivos.
- **Formularios:** se marcan `data-ai-studio-form`. Al enviar, `formulario.ts` valida,
  llama a `sendLeadToCrm` (en `lead.ts`, que conecta AI Studio), manda el evento `lead` a
  GTM y sigue a su destino en la misma pestaña.
- **Root:** es el de la plantilla del alumno; solo cambian `lang` y `viewport-fit`.

Lee los **avisos** que imprime (también quedan en `manifiesto.json`) y resuélvelos o
explícaselos al alumno: enlaces a otras páginas, videos, hojas que faltan…

### 4. Validar sobre la plantilla real

```bash
node <skill>/scripts/validar.mjs
```

Arma el proyecto en blanco del alumno con los archivos, instala sus dependencias (la
primera vez tarda 1–3 minutos) y prueba:

- **La plantilla:** `vite build` con la configuración de AI Studio, TypeScript estricto
  de la plantilla y su Prettier.
- **La página en Chrome, en escritorio y teléfono:** el motor arranca, sin errores ni
  peticiones fallidas, cargan imágenes y videos, y el HTML llega armado desde el servidor.
- **El formulario:** entrega sus campos a `sendLeadToCrm` (grabados, nada sale de la
  máquina), manda el evento de GTM y va a su destino.
- **Contra la página original, lado a lado:**
  - el mismo alto;
  - cada elemento con la misma caja y los mismos estilos;
  - los mismos atributos en `<html>` y `<body>` (los scripts corrieron);
  - el mismo texto;
  - los mismos píxeles en 9 puntos del scroll.

**Mira las imágenes** `.validar/comparacion-escritorio.jpg` y
`.validar/comparacion-telefono.jpg` (con Read): la prueba de píxeles no sabe si algo se
ve mal en las dos versiones.

Si algo sale ✗, el detalle dice qué elemento y qué propiedad cambiaron. Corrige en el
**build original** (nunca en `scrollcraft.js`), vuelve a correr `convertir-html.mjs` y
`validar.mjs`, y no generes el kit hasta que todo salga ✓. Opcional:
`validar.mjs --shoot` corre también el `shoot.mjs` de scroll-craft sobre la versión de
AI Studio.

### 5. El kit

```bash
node <skill>/scripts/kit.mjs
```

Escribe `kit/`, con esto dentro:

- **`kit/PASOS.md`:** la guía del alumno, con el mapa de mensajes y qué responder si el
  chat se sale del guion.
- **`prompts/`:**
  - un mensaje por archivo o parte, de 12 KB como máximo;
  - primero las dependencias, y las rutas y el root al final;
  - `sueltos/`, para reenviar un archivo aparte;
  - `verificar-lineas.md`;
  - los mensajes de assets y el de conectar el formulario.
- **`imagenes/grupo-N/`:** 5 archivos como máximo por carpeta.
- **`archivos/`:** lo mismo ya armado, por si el alumno tiene el editor **Code** o Git.

Entrégaselo así:

1. Dile dónde está `kit/` y ábrelo.
2. Explícale el paso 1 de `PASOS.md` (el respaldo) y el mensaje 00.
3. Ofrécele acompañarlo mensaje por mensaje. Si el chat de AI Studio responde algo
   distinto de «Listo: …», que te pegue su respuesta: la tabla de `PASOS.md` y las reglas
   dicen qué contestar.

Si el alumno tiene conexión con Git o GitHub en su proyecto (el `AGENTS.md` de la
plantilla la menciona), esa vía es más exacta que el chat: los archivos de `kit/archivos/`
se suben tal cual. Úsala si la tiene.

### 6. Revisar el ZIP de AI Studio

Cuando el alumno termine los mensajes (o cuando algo no cuadre), pídele el ZIP (**Code →
Download Codebase**) y:

```bash
node <skill>/scripts/kit.mjs --comparar "<zip de AI Studio>"
```

- **Archivos:** compara cada uno con el kit. Un reformateo no cuenta y un cambio real
  sí.
- **Assets:** descarga cada URL y la compara byte por byte con el archivo local.
- **Formulario:** revisa que `lead.ts` use el `postTrackingEvent` de AI Studio.

Para lo que difiera, escribe en `kit/correcciones/` los mensajes exactos para reenviar.
Repite hasta que no quede nada.

### 7. Probar la URL publicada

Recuérdale que **vuelva a publicar** (Publish / Update) después de conectar el
formulario: la URL `…vibepreview.app` puede quedarse con la versión anterior. Luego:

```bash
node <skill>/scripts/probar-preview.mjs "https://<proyecto>.vibepreview.app/"
```

Revisa estilos, fuentes, imágenes y videos, errores y scroll horizontal. Luego hace un
envío de prueba:

- intercepta y aborta la petición al CRM, así que no se crea ningún contacto;
- muestra el `formId`, el medio y los campos que llevaba;
- revisa el evento de GTM y la redirección.

También revisa el SEO tal como lo recibe Google, con el HTML del servidor, el
`robots.txt` y el `sitemap.xml`, y mide cuánto tarda en aparecer el contenido
principal en teléfono. Si la vista previa ya redirige a un dominio, lo dice: ese es el
dominio del sitio.

Para un formulario dentro de un diálogo usa `--abrir "<selector del botón>"` y
`--form "<selector>"`.

### 8. Dominio y SEO final

1. **Dominio:** el dominio principal del alumno (`sunegocio.com`), no un subdominio: es su
   sitio web. Se conecta en la publicación del proyecto, con el
   registro DNS que indique AI Studio; luego se marca como URL principal y se vuelve a
   publicar. Desde ese momento, la URL `…vibepreview.app` redirige al dominio.
2. **Si ese dominio ya tenía otro sitio,** sus direcciones viejas dan 404 al moverlo, y
   Google las tenía indexadas. Pregunta cuáles eran (o revisa su sitemap viejo) y
   redirígelas a `/`, con una ruta que haga `throw redirect({ to: "/", statusCode: 301 })`
   en su `beforeLoad`.
3. **SEO final**, cuando el alumno diga «haz el SEO final de mi sitio» o `probar-preview`
   marque errores de SEO en el dominio. Reconvierte con el dominio. Su form ID se conserva
   solo, desde el manifiesto anterior:

   ```bash
   node <skill>/scripts/convertir-html.mjs "<build>" --plantilla "<zip en blanco>" --dominio <dominio>
   node <skill>/scripts/validar.mjs && node <skill>/scripts/kit.mjs
   node <skill>/scripts/kit.mjs --comparar "<ZIP actual de AI Studio>"
   ```

   Lo que agrega el dominio:
   - la URL canónica y `og:url`;
   - datos estructurados `WebSite` + `Organization`, salvo que la página traiga los suyos;
   - `public/robots.txt` con su línea `Sitemap:`;
   - `public/sitemap.xml`.

   `--comparar` deja en `kit/correcciones/` justo los mensajes que cambian: `head.ts`,
   `robots.txt` y `sitemap.xml`. Dáselos, que vuelva a publicar, y confirma con
   `probar-preview.mjs "https://<dominio>/"`: todo el SEO debe salir ✓.
4. **Google Search Console** (lo hace el alumno): dar de alta el dominio en
   https://search.google.com/search-console y enviar `https://<dominio>/sitemap.xml`.

Los metadatos propios van siempre, con o sin dominio: autor, `og:title`, `og:description`,
`og:site_name` y los de Twitter. Sin ellos, la página heredaría los genéricos de la
plantilla («AI Studio», «AI Studio Generated Project»).

### 9. Antes de salir a producción (con el alumno)

- **Lead real:** que se registre con su correo y lo vea en **Contactos** y en
  **Sites › Forms › Submissions › External Forms**.
- **Workflows:** los que dependen del formulario necesitan el nuevo en su disparador
  («AI Studio Form Submitted» o «External Tracking Event»). Que haga otro lead y confirme
  que corren.

## Si el sitio no es HTML

Para una app TanStack/React (como la landing de HighLevel Studio, el primer sitio que se
migró), no hay conversión automática. Tú escribes los archivos y el manifiesto; el resto
del flujo es igual.

1. **`archivos/`:** crea los archivos a su ruta en el proyecto (`src/...`), siguiendo las
   reglas de la plantilla:
   - alias `@/`, `tsconfig` estricto y Prettier de la plantilla;
   - ningún componente de más de ~350 líneas: pártelo por capítulos;
   - el root sale del ZIP en blanco, con cambios mínimos;
   - un `image-urls.ts` con una clave vacía por archivo;
   - un `lead.ts` con `sendLeadToCrm(...)` vacía, `LEAD_FORM_ID` y `LEAD_SOURCE`.
2. **`manifiesto.json`:** junto a `archivos/`:

```json
{
  "proyecto": "HighLevel Studio",
  "plantilla": "/ruta/al/proyecto-en-blanco.zip",
  "tipo": "tanstack",
  "meta": { "titulo": "Título exacto de la página", "lang": "es" },
  "archivos": [
    { "ruta": "src/lib/scrollcraft.js" },
    { "ruta": "src/components/hls/image-urls.ts", "costura": true },
    { "ruta": "src/components/hls/lead.ts", "costura": true },
    { "ruta": "src/routes/index.tsx" },
    { "ruta": "src/routes/__root.tsx" }
  ],
  "imagenes": [{ "clave": "hero", "archivo": "/ruta/absoluta/hero.jpg", "tipo": "imagen" }],
  "mapaImagenes": "src/components/hls/image-urls.ts",
  "formulario": {
    "existe": true,
    "nombre": "registro", "formId": "registro", "source": "registro", "mediumId": "registro",
    "costura": "src/components/hls/lead.ts",
    "firma": "sendLeadToCrm(name, email)",
    "descripcion": "Dónde está el formulario y qué hace ya (para el mensaje de conectar).",
    "abrir": ".selector-del-boton-que-abre-el-dialogo",
    "selector": "dialog[open] form"
  }
}
```

   Los campos:

   - **`archivos`** va en orden de envío: dependencias primero, y las rutas y el root al
     final.
   - **`costura`** marca los archivos que AI Studio llena: el mapa de imágenes y el
     `lead.ts`.
   - **`clave`** es la clave exacta en el mapa de imágenes. **`archivo`** es el que se
     adjunta, y su nombre es como el chat sabe qué clave llenar.
   - **`origen.html`** es opcional: la ruta a una versión estática para comparar lado a
     lado.

3. Corre `validar.mjs` y `kit.mjs` como arriba.

## Límites conocidos

- **Una página por migración:** el `index.html` va a la ruta `/`. Los enlaces a otras
  páginas `.html` del build no existen en AI Studio (el convertidor avisa).
- **MP4, WebP y AVIF en el chat:** falta confirmar que los acepte, porque solo se probaron
  JPG y PNG. Si rechaza un formato:
  - **Imagen:** conviértela a JPG o PNG en el build y vuelve a convertir.
  - **Video:** que el alumno lo suba a la Media Library de GHL y pegue su URL en la clave.
    Si tampoco se puede, deja el poster fijo y avísale qué efecto se pierde.

  Anota lo que descubras en las reglas.
- **Formularios:** todos los de la página comparten una identidad en el CRM. Si necesitan
  identidades distintas, sepáralos a mano.
- **Contenido embebido:** los `<iframe>` y los scripts de terceros funcionan igual que en
  el original, pero la prueba en Chrome los bloquea (nada sale de la máquina). Revísalos
  en la URL publicada.
