#!/usr/bin/env node
// The kit a student pastes into AI Studio's chat, built from the workspace's
// manifiesto.json + archivos/ (convertir-html.mjs writes both; for a TanStack
// build, Claude writes the manifest by hand, see SKILL.md), and the check of
// what the chat actually built.
//
//   cd <workspace>
//   node <skill>/scripts/kit.mjs                    -> kit/ (the whole site)
//   node <skill>/scripts/kit.mjs --desde <zip>      -> kit/ with only what is new or changed
//                                                      against the student's AI Studio project
//   node <skill>/scripts/kit.mjs --comparar <zip>   -> what differs, and kit/correcciones/
//
// kit/
//   prompts/        numbered messages, ONE file (or part) per message, <= 12 KB
//   prompts/sueltos one message per file, to resend any of them alone
//   imagenes/       the files to attach, in groups of 5
//   PASOS.md        the student's guide
//   referencia/     fingerprints for --comparar
import fs from 'node:fs'
import path from 'node:path'
import {
  ADJUNTOS_POR_MENSAJE,
  ESPACIO,
  LIMITE_LINEAS,
  LIMITE_MENSAJE,
  abrirZip,
  args,
  escribir,
  formatear,
  leer,
  lineas,
  normalizar,
  partir,
  prettierDe,
  sha,
} from './lib.mjs'

const a = args()
const MANIFIESTO = path.join(ESPACIO, 'manifiesto.json')
const ARCHIVOS = path.join(ESPACIO, 'archivos')
const KIT = path.join(ESPACIO, 'kit')
if (!fs.existsSync(MANIFIESTO)) {
  console.error(`No encuentro ${MANIFIESTO}. Corre primero convertir-html.mjs (o escribe el manifiesto, ver SKILL.md).`)
  process.exit(1)
}
const M = JSON.parse(leer(MANIFIESTO))
const F = M.formulario || { existe: false }
const costuraForm = F.costura || 'src/components/pagina/lead.ts'
const firmaForm = F.firma || 'sendLeadToCrm(campos)'
const fence = (f) =>
  f.endsWith('.css') ? 'css' : f.endsWith('.tsx') ? 'tsx' : f.endsWith('.ts') ? 'ts' : f.endsWith('.xml') ? 'xml' : f.endsWith('.txt') ? 'text' : 'js'
const reformateable = (f) => /\.(css|m?js)$/.test(f) // AI Studio reformats these with its Prettier
const base = (f) => path.basename(f)

// ---- messages ------------------------------------------------------------------------
const REGLAS = `Vamos a construir una página copiando archivos que ya están terminados y probados fuera de AI Studio. Te los voy a pasar en varios mensajes, uno por archivo. Reglas para TODOS los mensajes que siguen:

1. Crea o reemplaza cada archivo EXACTAMENTE con el contenido que te paso, carácter por carácter, en la ruta que te indico.
2. No reformatees, no cambies comillas, punto y coma ni sangrías, no traduzcas, no "mejores", no resumas ni completes código por tu cuenta.
3. No instales dependencias ni modifiques archivos que no mencione.
4. Si un archivo llega en varias partes, cada parte nueva se agrega AL FINAL del mismo archivo, en la línea siguiente.
5. Mientras no te pase todos los archivos, la vista previa puede marcar errores: es normal. No corrijas nada, no implementes archivos que falten y no borres ninguno. Si crees que falta algo, pregúntame.
6. Responde solo «Listo: <ruta> (parte x de y)».

Si entendiste, responde solo «Entendido».`

const REGLAS_ACTUALIZAR = `Vamos a actualizar el sitio con archivos que ya están terminados y probados fuera de AI Studio: páginas nuevas o cambios a las que ya existen. Te los voy a pasar en varios mensajes, uno por archivo. Reglas para TODOS los mensajes que siguen:

1. Crea o reemplaza cada archivo EXACTAMENTE con el contenido que te paso, carácter por carácter, en la ruta que te indico.
2. No reformatees, no cambies comillas, punto y coma ni sangrías, no traduzcas, no "mejores", no resumas ni completes código por tu cuenta.
3. No instales dependencias ni modifiques archivos que no mencione. Los archivos y páginas que ya existen y no te paso se quedan como están.
4. Si un archivo llega en varias partes, cada parte nueva se agrega AL FINAL del mismo archivo, en la línea siguiente.
5. Mientras no te pase todos los archivos, la vista previa puede marcar errores: es normal. No corrijas nada, no implementes archivos que falten y no borres ninguno, tampoco rutas ni páginas. Si crees que falta algo, pregúntame.
6. Responde solo «Listo: <ruta> (parte x de y)».

Si entendiste, responde solo «Entendido».`

// the key → URL pairs of an images' map, quoted or bare keys
const URLS_RE = /(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*:\s*["'](https?:\/\/[^"']+)["']/g
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
// how many parameters a function declares (commas inside <>, (), [] or {} do not count)
function parametrosDe(texto, nombre) {
  const m = new RegExp(`(?:function\\s+${nombre}\\s*(?:<[^>]*>)?\\s*\\(|\\b${nombre}\\s*=\\s*(?:async\\s*)?\\()`).exec(texto)
  if (!m) return 0
  let prof = 0
  let n = 0
  let algo = false
  for (let i = m.index + m[0].length; i < texto.length; i++) {
    const c = texto[i]
    if ('<([{'.includes(c)) prof++
    else if ('>)]}'.includes(c)) {
      if (prof === 0) break
      prof--
    } else if (c === ',' && prof === 0) n++
    else if (!/\s/.test(c)) algo = true
  }
  return algo ? n + 1 : 0
}
// the CRM seam, connected with AI Studio's own integration (a real call, not a comment)
function leadConectado(texto, zip) {
  const t = sinComentarios(texto || '')
  return /import\s*\{[^}]*\bpostTrackingEvent\b[^}]*\}\s*from\s*["'][^"']*tracking["']/.test(t) && /\bpostTrackingEvent\s*\(/.test(t) && !!zip.leer('src/lib/tracking.ts')
}

function mensajeArchivo(n, total, ruta, parte, partes, cuerpo) {
  const titulo = `Mensaje ${String(n).padStart(2, '0')} de ${total} · ${ruta}${partes > 1 ? ` (parte ${parte} de ${partes})` : ''}`
  const accion =
    parte === 1
      ? `Crea el archivo \`${ruta}\` (si ya existe, reemplaza todo su contenido) con EXACTAMENTE este contenido${partes > 1 ? `. Es la parte 1 de ${partes}: las demás llegan en los siguientes mensajes` : ''}.`
      : `Agrega este texto AL FINAL de \`${ruta}\`, en la línea siguiente a la parte ${parte - 1}. Es la parte ${parte} de ${partes}.`
  const nuevaRuta = /^src\/routes\/(?!index\.tsx$|__root\.tsx$)/.test(ruta)
    ? ' Es una página nueva del sitio: mientras AI Studio regenera su lista de rutas, TypeScript puede marcar un error en este archivo. Es normal y se quita solo: no lo borres ni lo cambies.'
    : ''
  const fin = `Responde solo: «Listo: ${ruta}${partes > 1 ? ` (parte ${parte} de ${partes})` : ''}».${nuevaRuta}`
  // a fence longer than any run of backticks inside, so the code block never ends early
  const valla = '`'.repeat(Math.max(3, ...(cuerpo.match(/`+/g) || []).map((x) => x.length + 1)))
  return `${titulo}\n\n${accion} No lo modifiques. ${fin}\n\n${valla}${fence(ruta)}\n${cuerpo}${cuerpo.endsWith('\n') ? '' : '\n'}${valla}\n`
}

// the images the chat takes as attachments, in groups of 5. Videos never go through the
// chat: it refuses MP4 (2026-09-29). They go to GoHighLevel's Media Storage, and one
// message puts their URLs in the map (see mensajeVideos).
const esVideo = (i) => i.tipo === 'video'
function gruposDe(imagenes) {
  const out = []
  const lista = imagenes.filter((i) => !esVideo(i))
  for (let i = 0; i < lista.length; i += ADJUNTOS_POR_MENSAJE) out.push(lista.slice(i, i + ADJUNTOS_POR_MENSAJE))
  return out
}
let grupos = gruposDe(M.imagenes || [])
let videos = (M.imagenes || []).filter(esVideo)
// the file the student attaches (its name is how the chat knows which key it fills)
const adjunto = (i) => path.basename(i.archivo)
const rutaMapa = M.mapaImagenes || 'src/components/pagina/image-urls.ts'

const mensajeImagenes = (n, total, g) => `Mensaje ${String(n).padStart(2, '0')} de ${total} · archivos de assets, grupo ${g + 1} de ${grupos.length}

Te adjunto ${grupos[g].length} archivo(s). No los pongas en ninguna página ni los modifiques: solo súbelos y, en \`${rutaMapa}\`, pon la URL pública completa de cada uno en la clave que se indica. Cambia SOLO estas claves y deja las demás exactamente como están. No cambies el formato del archivo.

${grupos[g].map((i) => `- ${adjunto(i)} → clave "${i.clave}"`).join('\n')}

Responde con estas claves y su URL, y «Listo: grupo ${g + 1} de ${grupos.length}».
`
// the student uploads each video to Media Storage and gives Claude its URL; Claude
// checks it (the same bytes, CORS, byte ranges) and fills this message in
const mensajeVideos = (n, total) => `Mensaje ${String(n).padStart(2, '0')} de ${total} · videos (Media Storage de GoHighLevel)

Los videos ya están subidos en la Media Storage de GoHighLevel, así que no hay nada que adjuntar. En \`${rutaMapa}\` pon estas URL en estas claves, exactamente como están. Cambia SOLO estas claves y deja las demás exactamente como están. No cambies el formato del archivo.

${videos.map((i) => `- clave "${i.clave}" → PEGA_AQUI_LA_URL_DE_${adjunto(i)}`).join('\n')}

Responde con estas claves y su URL tal como quedaron en el archivo, y «Listo: videos».
`
const mensajeRevisarImagenes = () => `Muéstrame el contenido completo de \`${rutaMapa}\`, sin cambiarlo. Cada una de las ${(M.imagenes || []).length} claves debe tener una URL que empiece con https://.
`
const mensajeCompilar = `Ya están todos los archivos. Si la vista previa no se actualizó sola, compila el proyecto y muéstrala en \`/\`. Si aparece cualquier error, NO lo corrijas ni cambies código: dime el mensaje de error exacto, el archivo y la línea.
`
function camposCrm(campos) {
  const crm = (c) => {
    const k = `${c.name} ${c.etiqueta || ''}`.toLowerCase()
    if (c.tipo === 'email' || /mail|correo/.test(k)) return 'email'
    if (c.tipo === 'tel' || /tel|phone|whats|celular/.test(k)) return 'phone'
    if (/apellido|last/.test(k)) return 'last_name'
    if (/nombre|name/.test(k)) return 'first_name'
    return `un campo personalizado «${c.etiqueta || c.name}»`
  }
  return campos.map((c) => `«${c.etiqueta || c.name}» (\`${c.name}\`) → ${crm(c).startsWith('un ') ? crm(c) : `\`${crm(c)}\``}`).join(', ')
}
// the site's forms, each with its own ID (a hand-written manifest may have one, without IDs)
const FORMS = (F.formularios || []).map((f) => ({ ...f, formId: f.formId || F.formId }))
const variosIds = new Set(FORMS.map((f) => f.formId)).size > 1
const mensajeFormulario = (n, total, { actualizar = false } = {}) => `Mensaje ${String(n).padStart(2, '0')} de ${total} · ${actualizar ? 'actualizar la conexión de los formularios' : `conectar ${FORMS.length > 1 ? 'los formularios' : 'el formulario'} al CRM`}

${actualizar ? `El sitio ahora tiene ${FORMS.length} formularios, cada uno con su propio form ID. Actualiza la conexión que ya hiciste con tu integración de formularios de AI Studio:` : `Conecta a mi CRM ${FORMS.length > 1 ? `los ${FORMS.length} formularios del sitio` : 'el formulario de esta página'}, con tu integración de formularios de AI Studio (Connect forms to my CRM).`}

- ${F.descripcion || `Están en el HTML de las páginas (archivos \`html-NN.ts\`), marcados con \`data-ai-studio-form\` y con su \`data-form-id\`. Su envío lo maneja \`src/components/pagina/formulario.ts\`.`}
${FORMS.map((f) => `- ${f.ruta ? `En \`${f.ruta}\`` : 'Formulario'}: form ID \`${f.formId}\`${f.campos?.length ? `. Campos: ${camposCrm(f.campos)}` : ''}.`).join('\n')}
- ${F.firma ? `Implementa el envío SOLO dentro de la función \`${firmaForm}\` de \`${costuraForm}\`` : `Implementa el envío SOLO dentro de \`sendLeadToCrm(campos, formId)\` de \`${costuraForm}\``}, usando tu \`postTrackingEvent\` de \`@/lib/tracking\`.${F.firma ? '' : ` Usa el \`formId\` que recibe la función como FORM_ID, CONTACT_SOURCE y MEDIUM_ID de ese envío${variosIds ? ', no un valor fijo: cada formulario manda el suyo' : ''}.`} Si \`postTrackingEvent\` devuelve una promesa, regrésala.
- En ese mismo archivo deja exportados \`LEAD_FORM_ID\` y \`LEAD_SOURCE\`, ambos con \`${F.formId}\`.
- NO modifiques ningún otro archivo del sitio. No agregues eventos de \`dataLayer\`, toasts, \`window.open\` ni redirecciones: la página ya valida cada formulario, manda el evento a GTM y lleva al visitante a su destino.

Cuando termine, dime qué archivos creaste o cambiaste.
`

// ---- the guides -------------------------------------------------------------------------
const TABLA_CHAT = `**Si el chat…**

| Si el chat… | Respóndele |
|---|---|
| pregunta si «lo implementa él» o te da opciones para seguir | Elige siempre **«Te los paso ahora»** y mándale el siguiente mensaje. |
| dice que «mejoró», «optimizó», «reformateó» o «corrigió» algo | «Vuelve a crear ese archivo exactamente como te lo pasé, sin ningún cambio», y reenvía el mismo mensaje. |
| contesta con código resumido, con «…» o «resto del código» | Reenvía el mismo mensaje. |
| dice que el mensaje es muy largo o que un archivo es demasiado grande | Detente y pídele a Claude (en Claude Code) que lo parta más. |
| dice que un archivo falta o quedó incompleto | Reenvíalo desde \`prompts/sueltos/\`: un mensaje por archivo; si tiene partes, todas en orden. |
| quiere borrar una ruta o archivo por un error de TypeScript | «No borres nada: ese error desaparece cuando se regenera la vista previa.» |
`

function guiaActualizacion(mapa, total, r) {
  const img = mapa.find((x) => x[2] === 'imagenes')?.[0]
  const form = mapa.find((x) => x[2] === 'formulario')?.[0]
  return `# Actualizar «${M.proyecto}» en tu proyecto de AI Studio

Estos mensajes le agregan a tu proyecto solo lo que es nuevo o cambió: ${r.nuevos.length} archivo(s)
nuevo(s) y ${r.cambiados.length} cambiado(s)${r.imagenes ? `, más ${r.imagenes} archivo(s) de assets` : ''}. Lo que ya está en AI Studio no se toca: tus
imágenes subidas y tu conexión al CRM se conservan. Vas a pegar ${total} mensajes.

${r.paginas.length ? `Páginas nuevas: ${r.paginas.map((x) => `\`${x}\``).join(', ')}.\n\n` : ''}## Mapa de los mensajes

| # | Archivo | Qué hace |
|---|---|---|
${mapa.map(([num, nombre, , desc]) => `| ${num} | \`prompts/${nombre}\` | ${desc} |`).join('\n')}

Cómo copiar un mensaje: ábrelo, selecciona todo (Cmd/Ctrl + A), copia (Cmd/Ctrl + C) y
pégalo en el chat de AI Studio. **Un mensaje a la vez**: espera la respuesta antes del siguiente.

## Paso 1 · Respaldo

En el historial de versiones de tu proyecto, marca (bookmark) la versión actual.

## Paso 2 · Las reglas (mensaje 00)

Pega \`prompts/00-reglas.md\`. **Respuesta esperada:** «Entendido».

## Paso 3 · Los archivos

Pega cada mensaje en orden. **Respuesta esperada:** «Listo: src/…». Una página nueva puede
marcar un error de TypeScript por unos segundos, mientras AI Studio regenera sus rutas: es
normal, no dejes que el chat la borre.

${TABLA_CHAT}${img ? `
## Paso 4 · Los archivos de assets nuevos (mensajes ${img})

Máximo ${ADJUNTOS_POR_MENSAJE} adjuntos por mensaje: cada grupo tiene su carpeta en \`imagenes/\`.

${grupos.map((g, i) => `${i + 1}. **\`imagenes/grupo-${i + 1}/\`** con \`prompts/${mapa.find((x) => x[1].includes(`grupo${i + 1}de`))?.[1] ?? ''}\`: ${g.map((x) => `\`${adjunto(x)}\``).join(', ')}`).join('\n')}${videos.length ? `

**Videos (${videos.length}):** el chat de AI Studio no acepta MP4, así que no se adjuntan. Súbelos
a **Media Storage** de GoHighLevel (Sites › Media Storage), sin cambiarles el nombre:
${videos.map((i) => `\`videos/${adjunto(i)}\``).join(', ')}. Copia el enlace público de cada uno y dáselo a
Claude: revisa que sea el mismo archivo y que se pueda reproducir en tu sitio, y te
completa el mensaje \`${mapa.find((x) => x[1].includes('videos-media-storage'))?.[1] ?? ''}\`.` : ''}
` : ''}${form ? `
## Paso 5 · Formularios (mensaje ${form})

Pega el mensaje. Si el chat te pide autorizar la conexión al CRM, acéptalo.
` : ''}
## Paso 6 · Publicar y verificar

1. **Publish / Update**, para que el sitio publicado tenga los cambios.
2. Descarga el ZIP (**Code → Download Codebase**) y dáselo a Claude: compara cada archivo.
3. Pásale la dirección de tu sitio: revisa cada página, sus formularios y su SEO.
`
}

function guia(mapa, total) {
  const n = (pred) => mapa.find(pred)?.[0]
  const ultimoArchivo = [...mapa].reverse().find((x) => x[2] === 'archivo')?.[0]
  const img = n((x) => x[2] === 'imagenes')
  const form = n((x) => x[2] === 'formulario')
  return `# Migrar «${M.proyecto}» a tu proyecto nuevo de AI Studio

Guía paso a paso. Tiempo estimado: 30 a 60 minutos. Hazlo desde una computadora: vas a
copiar y pegar ${total} mensajes${grupos.length ? ` y adjuntar ${grupos.flat().length} archivo(s) en ${grupos.length} grupo(s)` : ''}${videos.length ? `, y subir ${videos.length} video(s) a Media Storage` : ''}.

Este kit ya se probó sobre la plantilla de TU proyecto de AI Studio (su configuración,
su formato de código y su build).

## Qué hay en esta carpeta

| Carpeta o archivo | Para qué |
|---|---|
| \`prompts/\` | Los mensajes para el chat de AI Studio, numerados. Se pegan en orden. |
| \`prompts/sueltos/\` | Un mensaje por archivo, para reenviar cualquiera por separado si hace falta. |
| \`prompts/verificar-lineas.md\` | Le pide al chat que revise que cada archivo exista y tenga sus líneas. |
| \`prompts/compilar.md\` | Por si la vista previa no se actualiza o marca un error. |
| \`imagenes/\` | Los archivos que se adjuntan en los mensajes de assets, una carpeta por grupo. |
| \`archivos/\` | Los mismos archivos ya armados, por si usas el editor **Code**. |
| \`referencia/\` | Lo que se usa para comparar al final. No lo toques. |

## Mapa de los mensajes

| # | Archivo | Qué hace |
|---|---|---|
${mapa.map(([num, nombre, , desc]) => `| ${num} | \`prompts/${nombre}\` | ${desc} |`).join('\n')}

Cómo copiar un mensaje: ábrelo (doble clic lo abre en tu editor de texto), selecciona todo
(Cmd/Ctrl + A), copia (Cmd/Ctrl + C) y pégalo en el chat de AI Studio. Pega siempre el
archivo completo, del título al final del bloque de código. **Un mensaje a la vez**:
espera la respuesta antes de mandar el siguiente.

---

## Paso 1 · Respaldo

1. Abre tu proyecto nuevo en AI Studio.
2. En el historial de versiones, marca (bookmark) la versión actual, la plantilla en blanco.

## Paso 2 · Las reglas (mensaje 00)

Pega \`prompts/00-reglas.md\`. **Respuesta esperada:** «Entendido».

## Paso 3 · Los archivos (mensajes 01 a ${ultimoArchivo})

1. Pega cada mensaje en orden, uno por uno. **Respuesta esperada:** «Listo: src/…».
2. Algunos archivos van en partes («parte 1 de 3»…): mándalas en orden, sin saltarte ninguna.
3. Mientras falten archivos, la vista previa puede verse rota o marcar errores: es normal.

${TABLA_CHAT}
### Verificación de los archivos

Al terminar los mensajes de archivos, pega \`prompts/verificar-lineas.md\`. Debe responder
«Todo coincide». Si nombra alguno, reenvíalo desde \`prompts/sueltos/\`.
${img ? `
## Paso 4 · Los archivos de assets (mensajes ${img}${grupos.length > 1 ? `, en ${grupos.length} grupos` : ''})

El chat acepta **máximo ${ADJUNTOS_POR_MENSAJE} adjuntos por mensaje**, así que van en grupos: cada grupo
tiene su carpeta en \`imagenes/\`. En cada uno: abre la carpeta, selecciona todos sus
archivos, arrástralos al chat y, en el mismo mensaje, pega el mensaje de ese grupo.

${grupos.map((g, i) => `${i + 1}. **\`imagenes/grupo-${i + 1}/\`** con \`prompts/${mapa.find((x) => x[1].includes(`grupo${i + 1}de`))?.[1] ?? ''}\`: ${g.map((x) => `\`${adjunto(x)}\``).join(', ')}`).join('\n')}

Después pega el mensaje «revisar»: muestra el mapa con las URLs, y todas deben empezar con
\`https://\`. No les cambies el nombre a los archivos: es lo que el chat usa para saber
qué URL va en qué clave.${videos.length ? `

**Videos (${videos.length}):** el chat de AI Studio no acepta MP4, así que no se adjuntan. Súbelos
a **Media Storage** de GoHighLevel (Sites › Media Storage), sin cambiarles el nombre:
${videos.map((i) => `\`videos/${adjunto(i)}\``).join(', ')}. Copia el enlace público de cada uno y dáselo a
Claude: revisa que sea el mismo archivo y que se pueda reproducir en tu sitio, y te
completa el mensaje \`${mapa.find((x) => x[1].includes('videos-media-storage'))?.[1] ?? ''}\`.` : ''}
` : ''}
## Paso 5 · La vista previa

AI Studio compila solo: abre la vista previa y recórrela completa, en escritorio y en
móvil. Si algo no carga o marca un error, manda el mensaje «compilar» y cópiale a Claude
el error tal cual.
${form ? `
## Paso 6 · Conectar el formulario (mensaje ${form})

1. Pega el mensaje. Si el chat te muestra un botón **Connect** o te pide autorizar la
   conexión al CRM, acéptalo.
2. **Respuesta esperada:** que cambió \`${costuraForm}\` y creó \`src/lib/tracking.ts\`.
   Si dice que tocó otros archivos, díselo a Claude.
3. **Vuelve a publicar** (Publish / Update): la URL pública de la vista previa puede
   quedarse con la versión anterior.
` : ''}
## Paso 7 · Descargar el ZIP y verificar

1. En AI Studio: **Code → Download Codebase**, o **Project Settings → Download Codebase**.
2. Dale el ZIP a Claude. Él compara cada archivo contra este kit (un reformateo no cuenta;
   un cambio real sí), revisa las URLs de los assets y, si algo difiere, te da los mensajes
   exactos para corregirlo.
3. Pásale también la URL de la vista previa (\`…vibepreview.app\`): la prueba sin crear
   contactos.

## Paso 8 · Antes de salir a producción
${F.existe ? `
- **Lead de prueba real:** regístrate en la vista previa con tu correo. Revisa que llegue a
  **Contactos** y a **Sites › Forms › Submissions › External Forms** con el nombre «${F.nombre}».
- **Workflows:** los que deban dispararse con este formulario necesitan tenerlo en su
  disparador («AI Studio Form Submitted» o «External Tracking Event»). Haz otro lead de
  prueba y confirma que corren.` : ''}
- **Dominio:** conecta tu dominio principal en la publicación del proyecto, crea
  el registro DNS que te indique AI Studio, márcalo como URL principal y vuelve a publicar.
- **SEO final:** con el dominio ya conectado, pídele a Claude «haz el SEO final de mi
  sitio». Te da los mensajes para AI Studio con tu dominio: la URL canónica, los datos
  estructurados, el \`sitemap.xml\` y el \`robots.txt\`. Pégalos, vuelve a publicar y Claude lo
  revisa en tu dominio.
- **Google Search Console:** da de alta tu dominio en https://search.google.com/search-console
  y envía tu sitemap (\`https://tu-dominio/sitemap.xml\`).

## Qué NO hacer mientras migras

- No pidas cambios de diseño ni de texto al chat hasta que Claude confirme el ZIP.
- No aceptes que instale librerías ni que «optimice» archivos.
- No renombres archivos ni imágenes del kit.
`
}

// ---- build -------------------------------------------------------------------------------
async function construir({ desde = null } = {}) {
  const zip = fs.existsSync(M.plantilla || '') ? await abrirZip(M.plantilla) : null
  if (!zip) console.log('  ! No encontré el ZIP de la plantilla; uso el formato por defecto de AI Studio.')
  const config = prettierDe(zip)
  fs.rmSync(KIT, { recursive: true, force: true })

  const contenidos = []
  const huella = {}
  for (const x of M.archivos) {
    const original = leer(path.join(ARCHIVOS, x.ruta))
    let texto = original
    if (/\.tsx?$/.test(x.ruta)) {
      texto = await formatear(x.ruta, original, config)
      if ((await normalizar(x.ruta, original)) !== (await normalizar(x.ruta, texto))) throw new Error(`${x.ruta}: el formato cambió el código`)
    }
    if (/\.tsx?$/.test(x.ruta) && lineas(texto) > LIMITE_LINEAS) {
      console.log(`  ! ${x.ruta} tiene ${lineas(texto)} líneas: AI Studio puede rechazarlo. Pártelo en módulos de menos de ${LIMITE_LINEAS}.`)
    }
    contenidos.push([x.ruta, texto, x])
    escribir(path.join(KIT, 'archivos', x.ruta), texto)
    huella[x.ruta] = { lineas: lineas(texto), exacto: sha(texto), normal: sha(await normalizar(x.ruta, texto)), costura: !!x.costura }
  }

  // what the messages carry: the whole site, or only what the student's project lacks
  let aEnviar = contenidos
  let imagenesEnviar = M.imagenes || []
  let conectar = F.existe ? 'conectar' : null
  let resumen = null
  if (desde) {
    const ai = await abrirZip(desde)
    const urls = {}
    for (const m of (ai.leer(rutaMapa) || '').matchAll(URLS_RE)) urls[m[1] || m[2]] = m[3]
    resumen = { nuevos: [], cambiados: [], imagenes: 0, paginas: [] }
    aEnviar = []
    for (const c of contenidos) {
      const [ruta, texto, x] = c
      const actual = ai.leer(ruta)
      if (ruta === rutaMapa) {
        // same keys, in the same order, with the URLs AI Studio already gave
        const fusion = texto.replace(/^(\s*)("[^"]+"|[A-Za-z_$][\w$]*)(\s*:\s*)""/gm, (m, sp, k, sep) => {
          const clave = k.startsWith('"') ? JSON.parse(k) : k
          return urls[clave] ? `${sp}${k}${sep}${JSON.stringify(urls[clave])}` : m
        })
        const faltan = (M.imagenes || []).some((i) => !urls[i.clave] && !(actual || '').includes(JSON.stringify(i.clave)))
        if (actual == null || faltan) {
          aEnviar.push([ruta, fusion, x])
          ;(actual == null ? resumen.nuevos : resumen.cambiados).push(ruta)
        }
        continue
      }
      if (x.costura) {
        // the CRM seam (and any other seam) belongs to AI Studio once it exists there
        if (actual == null) {
          aEnviar.push(c)
          resumen.nuevos.push(ruta)
        }
        continue
      }
      let igual = actual != null && sha(actual) === sha(texto)
      if (actual != null && !igual) {
        try {
          igual = (await normalizar(ruta, actual)) === (await normalizar(ruta, texto))
        } catch {}
      }
      if (igual) continue
      aEnviar.push(c)
      ;(actual == null ? resumen.nuevos : resumen.cambiados).push(ruta)
      if (actual == null && /^src\/routes\/(?!index\.tsx$|__root\.tsx$)/.test(ruta)) resumen.paginas.push(ruta.replace(/^src\/routes/, '').replace(/(\/index)?\.tsx$/, '') || '/')
    }
    imagenesEnviar = (M.imagenes || []).filter((i) => !urls[i.clave])
    resumen.imagenes = imagenesEnviar.length
    const leadAi = ai.leer(costuraForm)
    if (F.existe && leadConectado(leadAi, ai)) {
      // connected before with one fixed ID: the new forms need their own IDs
      const conFormId = parametrosDe(sinComentarios(leadAi), 'sendLeadToCrm') >= 2
      conectar = variosIds && !conFormId ? 'actualizar' : null
    }
  }
  grupos = gruposDe(imagenesEnviar)
  videos = imagenesEnviar.filter(esVideo)

  // messages: one file (or part) each, in the manifest's order
  const trozos = aEnviar.flatMap(([ruta, texto]) => {
    const partes = partir(texto, ruta)
    return partes.map((cuerpo, i) => ({ ruta, parte: i + 1, partes: partes.length, cuerpo }))
  })
  const total = trozos.length + (grupos.length || videos.length ? 1 : 0) + (conectar ? 1 : 0)
  const mapa = []
  const mensajes = [['00-reglas.md', (desde ? REGLAS_ACTUALIZAR : REGLAS) + '\n']]
  mapa.push(['00', '00-reglas.md', 'reglas', 'Las reglas: copiar tal cual, un archivo por mensaje'])
  let n = 1
  for (const t of trozos) {
    const nombre = `${String(n).padStart(2, '0')}-${base(t.ruta)}${t.partes > 1 ? `-${t.parte}de${t.partes}` : ''}.md`
    mensajes.push([nombre, mensajeArchivo(n, total, t.ruta, t.parte, t.partes, t.cuerpo)])
    mapa.push([String(n).padStart(2, '0'), nombre, 'archivo', `\`${t.ruta}\`${t.partes > 1 ? ` (parte ${t.parte} de ${t.partes})` : ''}`])
    n++
  }
  if (grupos.length || videos.length) {
    grupos.forEach((g, i) => {
      const nombre = `${String(n).padStart(2, '0')}-assets-grupo${i + 1}de${grupos.length}.md`
      mensajes.push([nombre, mensajeImagenes(n, total, i)])
      mapa.push([String(n).padStart(2, '0'), nombre, 'imagenes', `Assets, grupo ${i + 1} de ${grupos.length}: adjuntar ${g.map(adjunto).join(', ')}`])
    })
    if (videos.length) {
      const nombreV = `${String(n).padStart(2, '0')}-videos-media-storage.md`
      mensajes.push([nombreV, mensajeVideos(n, total)])
      mapa.push([String(n).padStart(2, '0'), nombreV, 'imagenes', `Videos: subirlos a Media Storage de GHL (${videos.map(adjunto).join(', ')}) y poner sus URL`])
    }
    const nombre = `${String(n).padStart(2, '0')}-assets-revisar.md`
    mensajes.push([nombre, mensajeRevisarImagenes()])
    mapa.push([String(n).padStart(2, '0'), nombre, 'imagenes', `Assets: revisar que las ${M.imagenes.length} claves tengan URL`])
    n++
  }
  if (conectar) {
    const nombre = `${String(n).padStart(2, '0')}-${conectar === 'actualizar' ? 'actualizar-formularios' : 'conectar-formulario'}.md`
    mensajes.push([nombre, mensajeFormulario(n, total, { actualizar: conectar === 'actualizar' })])
    mapa.push([String(n).padStart(2, '0'), nombre, 'formulario', conectar === 'actualizar' ? `Actualizar la conexión al CRM: cada formulario con su form ID (${FORMS.map((f) => `\`${f.formId}\``).join(', ')})` : `Conectar ${FORMS.length > 1 ? 'los formularios' : 'el formulario'} de AI Studio al CRM (${FORMS.map((f) => `\`${f.formId}\``).join(', ')})`])
  }
  mensajes.push(['compilar.md', mensajeCompilar])

  for (const [nombre, texto] of mensajes) {
    if (Buffer.byteLength(texto) > LIMITE_MENSAJE + 400) throw new Error(`${nombre} mide ${Buffer.byteLength(texto)} bytes`)
    escribir(path.join(KIT, 'prompts', nombre), texto)
  }

  // resend any file alone
  for (const [ruta, texto] of contenidos) {
    const partes = partir(texto, ruta)
    partes.forEach((cuerpo, i) => {
      const nombre = `${base(ruta)}${partes.length > 1 ? `-${i + 1}de${partes.length}` : ''}.md`
      escribir(path.join(KIT, 'prompts', 'sueltos', nombre), mensajeArchivo(0, 0, ruta, i + 1, partes.length, cuerpo).replace(/^Mensaje 00 de 0 · /, 'Archivo suelto · '))
    })
  }

  // line check (the files AI Studio does not reformat; the rest only must exist)
  escribir(
    path.join(KIT, 'prompts', 'verificar-lineas.md'),
    `Verificación (no crees ni cambies nada)

Revisa estos archivos del proyecto. Para los que tienen un número, cuenta sus líneas y compáralas (más o menos 1 línea está bien). Para los que dicen «solo que exista», solo confirma que existan: su formato puede cambiar. Responde SOLO con los que falten o no coincidan, así: «ruta: esperadas X, tiene Y» o «ruta: FALTA». Si todo está bien, responde «Todo coincide».

| Archivo | Líneas esperadas |
|---|---|
${aEnviar.map(([ruta, texto]) => `| \`${ruta}\` | ${reformateable(ruta) ? 'solo que exista' : lineas(texto)} |`).join('\n')}
`,
  )

  // the files to attach, one folder per message: select all, drag, done
  grupos.forEach((g, n) => {
    const dir = path.join(KIT, 'imagenes', `grupo-${n + 1}`)
    fs.mkdirSync(dir, { recursive: true })
    for (const i of g) fs.copyFileSync(i.archivo, path.join(dir, adjunto(i)))
  })
  // the videos, to upload to Media Storage (never attached in the chat)
  if (videos.length) {
    fs.mkdirSync(path.join(KIT, 'videos'), { recursive: true })
    for (const i of videos) fs.copyFileSync(i.archivo, path.join(KIT, 'videos', adjunto(i)))
  }

  escribir(path.join(KIT, 'PASOS.md'), desde ? guiaActualizacion(mapa, mensajes.length - 1, resumen) : guia(mapa, mensajes.length - 1))
  escribir(
    path.join(KIT, 'referencia', 'manifest.json'),
    JSON.stringify({ archivos: huella, imagenes: (M.imagenes || []).map((i) => ({ clave: i.clave, sha: sha(fs.readFileSync(i.archivo)) })), mapa: rutaMapa, costuraForm, formulario: F.existe }, null, 2),
  )
  const mayor = Math.max(...mensajes.map(([, t]) => Buffer.byteLength(t)))
  if (resumen) console.log(`kit/ (actualización): ${resumen.nuevos.length} archivo(s) nuevo(s), ${resumen.cambiados.length} cambiado(s), ${resumen.imagenes} asset(s) nuevo(s)${resumen.paginas.length ? `, páginas nuevas: ${resumen.paginas.join(', ')}` : ''}${conectar ? `, ${conectar === 'actualizar' ? 'actualizar' : 'conectar'} formularios` : ''} · ${mensajes.length - 1} mensajes`)
  else console.log(`kit/: ${contenidos.length} archivos, ${mensajes.length - 1} mensajes (el mayor, ${(mayor / 1024).toFixed(1)} KB), ${(M.imagenes || []).length} assets en ${grupos.length} grupo(s)`)
}

// ---- compare an AI Studio ZIP with the kit ---------------------------------------------
async function comparar(zipArchivo) {
  const ref = JSON.parse(leer(path.join(KIT, 'referencia', 'manifest.json')))
  const zip = await abrirZip(zipArchivo)
  const malos = []
  let iguales = 0
  const noCostura = Object.entries(ref.archivos).filter(([, x]) => !x.costura)
  for (const [ruta, x] of noCostura) {
    const t = zip.leer(ruta)
    if (t == null) {
      malos.push([ruta, 'falta'])
      continue
    }
    let igual = sha(t) === x.exacto
    if (!igual) {
      try {
        igual = sha(await normalizar(ruta, t)) === x.normal
      } catch (e) {
        malos.push([ruta, `no compila: ${String(e.message).slice(0, 120)}`])
        continue
      }
    }
    if (igual) iguales++
    else malos.push([ruta, 'distinto'])
  }
  console.log(`${iguales}/${noCostura.length} archivos idénticos (sin contar formato ni comentarios)`)
  for (const [f, por] of malos) console.log(`  ✗ ${f}: ${por}`)

  // assets: every key has a URL, and each URL serves exactly the local file
  const mapa = zip.leer(ref.mapa) || ''
  const urls = {}
  for (const m of mapa.matchAll(URLS_RE)) urls[m[1] || m[2]] = m[3]
  const sinUrl = ref.imagenes.filter((i) => !urls[i.clave]).map((i) => i.clave)
  if (ref.imagenes.length) console.log(sinUrl.length ? `  ✗ assets sin URL: ${sinUrl.join(', ')}` : `  ✓ los ${ref.imagenes.length} assets tienen URL`)
  const conUrl = ref.imagenes.filter((i) => urls[i.clave])
  let identicos = 0
  const distintos = []
  for (const i of conUrl) {
    try {
      const r = await fetch(urls[i.clave])
      const buf = Buffer.from(await r.arrayBuffer())
      if (r.ok && sha(buf) === i.sha) identicos++
      else distintos.push(`${i.clave} (${r.status})`)
    } catch (e) {
      distintos.push(`${i.clave} (${e.message})`)
    }
  }
  if (conUrl.length) console.log(distintos.length ? `  ✗ URLs que no sirven el archivo correcto: ${distintos.join(', ')}` : `  ✓ cada URL sirve exactamente su archivo (${identicos})`)

  // the form
  if (ref.formulario) {
    // real use, not a mention in a comment: imported from its tracking module and called
    const lead = zip.leer(ref.costuraForm) || ''
    const ok = leadConectado(lead, zip) && /\bLEAD_FORM_ID\b/.test(lead) && /\bLEAD_SOURCE\b/.test(lead)
    console.log(ok ? `  ✓ el formulario usa el postTrackingEvent de AI Studio (${ref.costuraForm})` : '  ✗ el formulario todavía no está conectado (falta el mensaje de conectar o no se aplicó)')
  }

  // corrections for what differs
  const dir = path.join(KIT, 'correcciones')
  fs.rmSync(dir, { recursive: true, force: true })
  let n = 0
  for (const [ruta, por] of malos) {
    const texto = leer(path.join(KIT, 'archivos', ruta))
    const partes = partir(texto, ruta)
    partes.forEach((cuerpo, i) => {
      n++
      const intro = por === 'falta' ? `Este archivo no existe en el proyecto. Créalo con este contenido exacto.` : `Este archivo quedó distinto del que te pasé. Reemplázalo COMPLETO con este contenido exacto, aunque te parezca que tu versión funciona igual.`
      const msg = mensajeArchivo(n, 0, ruta, i + 1, partes.length, cuerpo).replace(/^Mensaje \d+ de 0 · /, 'Corrección · ').replace(/\n\n/, `\n\n${i === 0 ? intro + ' ' : ''}`)
      escribir(path.join(dir, `${String(n).padStart(2, '0')}-${base(ruta)}${partes.length > 1 ? `-${i + 1}de${partes.length}` : ''}.md`), msg)
    })
  }
  if (n) console.log(`  → ${n} mensaje(s) de corrección en kit/correcciones/`)
  return malos.length === 0 && sinUrl.length === 0 && distintos.length === 0
}

if (a.comparar) {
  const bien = await comparar(path.resolve(a.comparar))
  process.exit(bien ? 0 : 1)
} else await construir({ desde: typeof a.desde === 'string' ? path.resolve(a.desde) : null })
