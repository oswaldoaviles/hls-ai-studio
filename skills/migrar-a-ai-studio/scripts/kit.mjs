#!/usr/bin/env node
// The kit a student pastes into AI Studio's chat, built from the workspace's
// manifiesto.json + archivos/ (convertir-html.mjs writes both; for a TanStack
// build, Claude writes the manifest by hand, see SKILL.md), and the check of
// what the chat actually built.
//
//   cd <workspace>
//   node <skill>/scripts/kit.mjs                    -> kit/
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
const fence = (f) => (f.endsWith('.css') ? 'css' : f.endsWith('.tsx') ? 'tsx' : f.endsWith('.ts') ? 'ts' : 'js')
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

function mensajeArchivo(n, total, ruta, parte, partes, cuerpo) {
  const titulo = `Mensaje ${String(n).padStart(2, '0')} de ${total} · ${ruta}${partes > 1 ? ` (parte ${parte} de ${partes})` : ''}`
  const accion =
    parte === 1
      ? `Crea el archivo \`${ruta}\` (si ya existe, reemplaza todo su contenido) con EXACTAMENTE este contenido${partes > 1 ? `. Es la parte 1 de ${partes}: las demás llegan en los siguientes mensajes` : ''}.`
      : `Agrega este texto AL FINAL de \`${ruta}\`, en la línea siguiente a la parte ${parte - 1}. Es la parte ${parte} de ${partes}.`
  const fin = `Responde solo: «Listo: ${ruta}${partes > 1 ? ` (parte ${parte} de ${partes})` : ''}».`
  // a fence longer than any run of backticks inside, so the code block never ends early
  const valla = '`'.repeat(Math.max(3, ...(cuerpo.match(/`+/g) || []).map((x) => x.length + 1)))
  return `${titulo}\n\n${accion} No lo modifiques. ${fin}\n\n${valla}${fence(ruta)}\n${cuerpo}${cuerpo.endsWith('\n') ? '' : '\n'}${valla}\n`
}

// images first, then videos in groups of their own: a video the chat refuses never
// holds an image back
const grupos = []
for (const lista of [(M.imagenes || []).filter((i) => i.tipo !== 'video'), (M.imagenes || []).filter((i) => i.tipo === 'video')]) {
  for (let i = 0; i < lista.length; i += ADJUNTOS_POR_MENSAJE) grupos.push(lista.slice(i, i + ADJUNTOS_POR_MENSAJE))
}
// the file the student attaches (its name is how the chat knows which key it fills)
const adjunto = (i) => path.basename(i.archivo)
const rutaMapa = M.mapaImagenes || 'src/components/pagina/image-urls.ts'

const mensajeImagenes = (n, total, g) => `Mensaje ${String(n).padStart(2, '0')} de ${total} · archivos de assets, grupo ${g + 1} de ${grupos.length}

Te adjunto ${grupos[g].length} archivo(s). No los pongas en ninguna página ni los modifiques: solo súbelos y, en \`${rutaMapa}\`, pon la URL pública completa de cada uno en la clave que se indica. Cambia SOLO estas claves y deja las demás exactamente como están. No cambies el formato del archivo.

${grupos[g].map((i) => `- ${adjunto(i)} → clave "${i.clave}"`).join('\n')}

Responde con estas claves y su URL, y «Listo: grupo ${g + 1} de ${grupos.length}».
`
const mensajeRevisarImagenes = `Muéstrame el contenido completo de \`${rutaMapa}\`, sin cambiarlo. Cada una de las ${(M.imagenes || []).length} claves debe tener una URL que empiece con https://.
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
const mensajeFormulario = (n, total) => `Mensaje ${String(n).padStart(2, '0')} de ${total} · conectar el formulario al CRM

Conecta a mi CRM el formulario de esta página, con tu integración de formularios de AI Studio (Connect forms to my CRM).

- ${F.descripcion || `El formulario está en el HTML de la página (\`src/components/pagina/html-NN.ts\`, marcado con \`data-ai-studio-form\`) y su envío lo maneja \`src/components/pagina/formulario.ts\`.`}${F.formularios?.[0]?.campos?.length ? ` Campos: ${camposCrm(F.formularios[0].campos)}.` : ''}
- ${F.nombre === F.formId && F.source === F.formId && F.mediumId === F.formId ? `Usa \`${F.formId}\` como FORM_ID, CONTACT_SOURCE, MEDIUM_ID y nombre del formulario en el CRM.` : `Nombre del formulario en el CRM: «${F.nombre}». Usa estos valores: FORM_ID \`${F.formId}\`, CONTACT_SOURCE «${F.source}», MEDIUM_ID \`${F.mediumId}\`.`}
- Implementa el envío SOLO dentro de la función \`${firmaForm}\` de \`${costuraForm}\`, usando tu \`postTrackingEvent\` de \`@/lib/tracking\`. Si \`postTrackingEvent\` devuelve una promesa, regrésala.
- En ese mismo archivo deja exportados \`LEAD_FORM_ID\` y \`LEAD_SOURCE\` con los valores de tu FORM_ID y CONTACT_SOURCE.
- NO modifiques ningún otro archivo de la página. No agregues eventos de \`dataLayer\`, toasts, \`window.open\` ni redirecciones: la página ya valida el formulario, manda el evento a GTM y lleva al visitante a su destino.

Cuando termine, dime qué archivos creaste o cambiaste.
`

// ---- the guide -------------------------------------------------------------------------
function guia(mapa, total) {
  const n = (pred) => mapa.find(pred)?.[0]
  const ultimoArchivo = [...mapa].reverse().find((x) => x[2] === 'archivo')?.[0]
  const img = n((x) => x[2] === 'imagenes')
  const form = n((x) => x[2] === 'formulario')
  return `# Migrar «${M.proyecto}» a tu proyecto nuevo de AI Studio

Guía paso a paso. Tiempo estimado: 30 a 60 minutos. Hazlo desde una computadora: vas a
copiar y pegar ${total} mensajes${(M.imagenes || []).length ? ` y adjuntar ${M.imagenes.length} archivo(s) en ${grupos.length} grupo(s)` : ''}.

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

**Si el chat…**

| Si el chat… | Respóndele |
|---|---|
| pregunta si «lo implementa él» o te da opciones para seguir | Elige siempre **«Te los paso ahora»** y mándale el siguiente mensaje. |
| dice que «mejoró», «optimizó», «reformateó» o «corrigió» algo | «Vuelve a crear ese archivo exactamente como te lo pasé, sin ningún cambio», y reenvía el mismo mensaje. |
| contesta con código resumido, con «…» o «resto del código» | Reenvía el mismo mensaje. |
| dice que el mensaje es muy largo o que un archivo es demasiado grande | Detente y pídele a Claude (en Claude Code) que lo parta más. |
| dice que un archivo falta o quedó incompleto | Reenvíalo desde \`prompts/sueltos/\`: un mensaje por archivo; si tiene partes, todas en orden. |
| quiere borrar una ruta o archivo por un error de TypeScript | «No borres nada: ese error desaparece cuando se regenera la vista previa.» |

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
qué URL va en qué clave.${(M.imagenes || []).some((i) => i.tipo === 'video') ? `

**Videos:** si el chat no acepta un MP4, dile a Claude (en Claude Code). Hay dos
alternativas: subirlo a la Media Library de GHL y pegar su URL en la clave, o dejar la
imagen fija (poster) de ese momento.` : ''}
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
- **Dominio:** conéctalo en la publicación del proyecto (recomendado: un subdominio), crea
  el registro DNS que te indique AI Studio, márcalo como URL principal y vuelve a publicar.

## Qué NO hacer mientras migras

- No pidas cambios de diseño ni de texto al chat hasta que Claude confirme el ZIP.
- No aceptes que instale librerías ni que «optimice» archivos.
- No renombres archivos ni imágenes del kit.
`
}

// ---- build -------------------------------------------------------------------------------
async function construir() {
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

  // messages: one file (or part) each, in the manifest's order
  const trozos = contenidos.flatMap(([ruta, texto]) => {
    const partes = partir(texto, ruta)
    return partes.map((cuerpo, i) => ({ ruta, parte: i + 1, partes: partes.length, cuerpo }))
  })
  const total = trozos.length + (grupos.length ? 1 : 0) + (F.existe ? 1 : 0)
  const mapa = []
  const mensajes = [['00-reglas.md', REGLAS + '\n']]
  mapa.push(['00', '00-reglas.md', 'reglas', 'Las reglas: copiar tal cual, un archivo por mensaje'])
  let n = 1
  for (const t of trozos) {
    const nombre = `${String(n).padStart(2, '0')}-${base(t.ruta)}${t.partes > 1 ? `-${t.parte}de${t.partes}` : ''}.md`
    mensajes.push([nombre, mensajeArchivo(n, total, t.ruta, t.parte, t.partes, t.cuerpo)])
    mapa.push([String(n).padStart(2, '0'), nombre, 'archivo', `\`${t.ruta}\`${t.partes > 1 ? ` (parte ${t.parte} de ${t.partes})` : ''}`])
    n++
  }
  if (grupos.length) {
    grupos.forEach((g, i) => {
      const nombre = `${String(n).padStart(2, '0')}-assets-grupo${i + 1}de${grupos.length}.md`
      mensajes.push([nombre, mensajeImagenes(n, total, i)])
      mapa.push([String(n).padStart(2, '0'), nombre, 'imagenes', `Assets, grupo ${i + 1} de ${grupos.length}: adjuntar ${g.map(adjunto).join(', ')}`])
    })
    const nombre = `${String(n).padStart(2, '0')}-assets-revisar.md`
    mensajes.push([nombre, mensajeRevisarImagenes])
    mapa.push([String(n).padStart(2, '0'), nombre, 'imagenes', `Assets: revisar que las ${M.imagenes.length} claves tengan URL`])
    n++
  }
  if (F.existe) {
    const nombre = `${String(n).padStart(2, '0')}-conectar-formulario.md`
    mensajes.push([nombre, mensajeFormulario(n, total)])
    mapa.push([String(n).padStart(2, '0'), nombre, 'formulario', `Conectar el formulario de AI Studio al CRM («${F.nombre}»)`])
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
${contenidos.map(([ruta, texto]) => `| \`${ruta}\` | ${reformateable(ruta) ? 'solo que exista' : lineas(texto)} |`).join('\n')}
`,
  )

  // the files to attach, one folder per message: select all, drag, done
  grupos.forEach((g, n) => {
    const dir = path.join(KIT, 'imagenes', `grupo-${n + 1}`)
    fs.mkdirSync(dir, { recursive: true })
    for (const i of g) fs.copyFileSync(i.archivo, path.join(dir, adjunto(i)))
  })

  escribir(path.join(KIT, 'PASOS.md'), guia(mapa, mensajes.length - 1))
  escribir(
    path.join(KIT, 'referencia', 'manifest.json'),
    JSON.stringify({ archivos: huella, imagenes: (M.imagenes || []).map((i) => ({ clave: i.clave, sha: sha(fs.readFileSync(i.archivo)) })), mapa: rutaMapa, costuraForm, formulario: F.existe }, null, 2),
  )
  const mayor = Math.max(...mensajes.map(([, t]) => Buffer.byteLength(t)))
  console.log(`kit/: ${contenidos.length} archivos, ${mensajes.length - 1} mensajes (el mayor, ${(mayor / 1024).toFixed(1)} KB), ${(M.imagenes || []).length} assets en ${grupos.length} grupo(s)`)
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
  for (const m of mapa.matchAll(/(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*:\s*["'](https?:\/\/[^"']+)["']/g)) urls[m[1] || m[2]] = m[3]
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
    const lead = (zip.leer(ref.costuraForm) || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const importa = /import\s*\{[^}]*\bpostTrackingEvent\b[^}]*\}\s*from\s*["'][^"']*tracking["']/.test(lead)
    const ok = importa && /\bpostTrackingEvent\s*\(/.test(lead) && zip.leer('src/lib/tracking.ts') && /\bLEAD_FORM_ID\b/.test(lead) && /\bLEAD_SOURCE\b/.test(lead)
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
} else await construir()
