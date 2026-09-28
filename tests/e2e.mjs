#!/usr/bin/env node
// End-to-end test of the skill on a synthetic scroll-craft site:
// convert -> validate on the real template -> kit -> limits -> compare against a
// simulated AI Studio ZIP (clean, then tampered).
//
//   node tests/e2e.mjs --plantilla <blank AI Studio project.zip> [--espacio <dir>]
//
// The workspace (default: a folder in the OS temp dir) is prepared with
// doctor.mjs --preparar the first time. Exit code 0 when everything holds.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.join(AQUI, '..', 'skills', 'migrar-a-ai-studio', 'scripts')
const argv = process.argv.slice(2)
const opcion = (n, d) => {
  const i = argv.indexOf(n)
  return i > -1 ? argv[i + 1] : d
}
const PLANTILLA = opcion('--plantilla') && path.resolve(opcion('--plantilla'))
if (!PLANTILLA || !fs.existsSync(PLANTILLA)) {
  console.error('Uso: node tests/e2e.mjs --plantilla <zip del proyecto en blanco de AI Studio>')
  process.exit(1)
}
const ESPACIO = path.resolve(opcion('--espacio', path.join(os.tmpdir(), 'hls-ai-studio-e2e')))
fs.mkdirSync(ESPACIO, { recursive: true })
process.env.HLS_ESPACIO = ESPACIO // lib.mjs loads the workspace's packages from here

const fallas = []
const ok = (nombre, bien, detalle = '') => {
  if (!bien) fallas.push(nombre)
  console.log(`${bien ? 'PASS' : 'FAIL'}  ${nombre}${detalle ? `  ${detalle}` : ''}`)
}
function correr(script, args, { mostrar = false, espacio = ESPACIO } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: espacio, env: { ...process.env, HLS_ESPACIO: espacio } })
    let salida = ''
    p.stdout.on('data', (d) => {
      salida += d
      if (mostrar) process.stdout.write(d)
    })
    p.stderr.on('data', (d) => {
      salida += d
      if (mostrar) process.stderr.write(d)
    })
    p.on('close', (codigo) => resolve({ codigo, salida }))
  })
}
const { cargar, formatear, partir, prettierDe, abrirZip } = await import(path.join(SCRIPTS, 'lib.mjs')).then(async (lib) => {
  if (!fs.existsSync(path.join(ESPACIO, 'node_modules', 'vite'))) {
    const r = await correr('doctor.mjs', ['--preparar', ESPACIO], { mostrar: true })
    if (r.codigo !== 0) process.exit(1)
  }
  return lib
})

// 1. the site
{
  const p = spawn(process.execPath, [path.join(AQUI, 'crear-assets.mjs'), path.join(ESPACIO, 'sitio')], { cwd: ESPACIO, env: { ...process.env, HLS_ESPACIO: ESPACIO }, stdio: 'inherit' })
  const codigo = await new Promise((r) => p.on('close', r))
  ok('sitio de prueba creado', codigo === 0)
}

// 2. conversion
{
  const r = await correr('convertir-html.mjs', ['sitio', '--plantilla', PLANTILLA, '--gtm', 'GTM-TEST123', '--dominio', 'faro.example.com'])
  ok('convertir-html.mjs', r.codigo === 0, r.codigo === 0 ? '' : r.salida.slice(-800))
  const m = JSON.parse(fs.readFileSync(path.join(ESPACIO, 'manifiesto.json'), 'utf8'))
  ok('las 4 páginas del sitio, cada una con su dirección', (m.paginas || []).map((x) => x.ruta).join() === '/,/contacto,/nosotros,/servicios/torno', (m.paginas || []).map((x) => x.ruta).join(', '))
  ok('12 assets detectados en todas las páginas (imágenes, videos y og:image)', m.imagenes.length === 12, m.imagenes.map((i) => i.clave).join(', '))
  ok('formulario detectado con sus campos', m.formulario.existe && m.formulario.formularios[0].campos.map((c) => c.name).join() === 'nombre,email')
  ok('cada formulario con su form ID genérico', m.formulario.formularios.map((f) => f.formId).join() === 'registro,contacto', m.formulario.formularios.map((f) => f.formId).join(', '))
  const htmlHome = fs.readFileSync(path.join(ESPACIO, 'archivos/src/components/pagina/html-01.ts'), 'utf8')
  const htmlServicio = fs.readFileSync(path.join(ESPACIO, 'archivos/src/components/paginas/servicios-torno/html-01.ts'), 'utf8')
  ok('los links entre páginas se vuelven direcciones (también desde una subcarpeta)', ['/nosotros', '/servicios/torno', '/contacto'].every((r) => htmlHome.includes(`href="${r}"`)) && htmlServicio.includes('href="/"') && !/\.html"/.test(htmlHome + htmlServicio))
  const compartido = path.join(ESPACIO, 'archivos/src/components/pagina/compartido-sitio-01.ts')
  const cssHome = fs.readFileSync(path.join(ESPACIO, 'archivos/src/components/pagina/css-01.ts'), 'utf8')
  ok('sitio.css va una sola vez, compartido por las páginas', fs.existsSync(compartido) && fs.readFileSync(compartido, 'utf8').includes('--sc-canvas') && !cssHome.includes('--sc-canvas'))
  const headServicio = fs.readFileSync(path.join(ESPACIO, 'archivos/src/components/paginas/servicios-torno/head.ts'), 'utf8')
  ok('cada página con su propio SEO (canónica y og:image de su dirección)', headServicio.includes('href: "https://faro.example.com/servicios/torno"') && headServicio.includes('asset("torno.webp")'))
  ok('una ruta por página, al final del kit', fs.existsSync(path.join(ESPACIO, 'archivos/src/routes/servicios/torno.tsx')) && fs.existsSync(path.join(ESPACIO, 'archivos/src/routes/contacto.tsx')))
  const head = fs.readFileSync(path.join(ESPACIO, 'archivos/src/components/pagina/head.ts'), 'utf8')
  ok('JSON-LD conserva su type en el <head>', /type: "application\/ld\+json"/.test(head))
  ok('GTM en el <head>, limitado al dominio', head.includes('GTM-TEST123') && /faro.+example.+com.+location\.hostname/.test(head), head.match(/if \(!.*location\.hostname.*/)?.[0])
  ok('la página declara sus propios metadatos (nada genérico de la plantilla)', /name: "author"/.test(head) && /property: "og:description"/.test(head) && /name: "twitter:title"/.test(head))
  ok('SEO final: URL canónica y og:url con el dominio', head.includes('{ rel: "canonical", href: "https://faro.example.com/" }') && head.includes('property: "og:url", content: "https://faro.example.com/"'))
  const robots = fs.readFileSync(path.join(ESPACIO, 'archivos/public/robots.txt'), 'utf8')
  const sitemap = fs.readFileSync(path.join(ESPACIO, 'archivos/public/sitemap.xml'), 'utf8')
  ok('SEO final: robots.txt anuncia el sitemap y sitemap.xml lista todas las páginas', /Sitemap: https:\/\/faro\.example\.com\/sitemap\.xml/.test(robots) && ['/', '/contacto', '/nosotros', '/servicios/torno'].every((r) => sitemap.includes(`<loc>https://faro.example.com${r}</loc>`)))
  ok('respeta los datos estructurados que trae la página (no los duplica)', !head.includes('@graph'))
  const root = fs.readFileSync(path.join(ESPACIO, 'archivos/src/routes/__root.tsx'), 'utf8')
  ok('root de la plantilla con lang="es" y viewport-fit=cover', root.includes('<html lang="es"') && root.includes('viewport-fit=cover'))
}

// 3. validation on the real template
{
  const r = await correr('validar.mjs', [], { mostrar: false })
  const resumen = r.salida.split('\n').filter((l) => /^(✓|✗)|pruebas bien/.test(l))
  ok('validar.mjs (plantilla real, build, tsc, prettier, Chrome, formularios, paridad de cada página)', r.codigo === 0, r.codigo === 0 ? resumen.at(-1) : `\n${r.salida.slice(-2500)}`)
  const informe = JSON.parse(fs.readFileSync(path.join(ESPACIO, '.validar/informe.json'), 'utf8'))
  ok('la comparación visual de cada página quedó guardada', ['comparacion-escritorio.jpg', 'comparacion-telefono.jpg', 'comparacion-contacto-escritorio.jpg', 'comparacion-servicios-torno-telefono.jpg'].every((f) => fs.existsSync(path.join(ESPACIO, '.validar', f))), `${informe.resultados.length} pruebas en informe.json`)
}

// 4. the kit and its limits
const KIT = path.join(ESPACIO, 'kit')
{
  const r = await correr('kit.mjs', [])
  ok('kit.mjs', r.codigo === 0, r.salida.trim().split('\n').at(-1))
  const prompts = fs.readdirSync(path.join(KIT, 'prompts')).filter((f) => f.endsWith('.md'))
  const grandes = prompts.filter((f) => fs.statSync(path.join(KIT, 'prompts', f)).size > 12 * 1024 + 400)
  ok('ningún mensaje pasa de 12 KB', grandes.length === 0, grandes.join(', '))
  const archivos = []
  const listar = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? listar(path.join(d, e.name)) : archivos.push(path.join(d, e.name))))
  listar(path.join(KIT, 'archivos'))
  const largos = archivos.filter((f) => /\.tsx?$/.test(f) && fs.readFileSync(f, 'utf8').split('\n').length > 351)
  ok('ningún archivo .ts/.tsx pasa de 350 líneas', largos.length === 0, largos.map((f) => path.basename(f)).join(', '))
  // the numbered messages, glued back per file, give the kit's files byte for byte
  const numerados = prompts.filter((f) => /^\d\d-/.test(f)).sort()
  const pegado = {}
  for (const f of numerados) {
    const t = fs.readFileSync(path.join(KIT, 'prompts', f), 'utf8')
    const titulo = t.match(/^Mensaje \d+ de \d+ · (\S+)(?: \(parte (\d+) de (\d+)\))?/)
    if (!titulo || !/^(src|public)\//.test(titulo[1])) continue
    const cuerpo = t.match(/^(`{3,})[a-z]*\n([\s\S]*?)\n\1\n?$/m)
    if (!cuerpo) {
      ok(`bloque de código en ${f}`, false)
      continue
    }
    pegado[titulo[1]] = (pegado[titulo[1]] || '') + cuerpo[2] + '\n'
  }
  const distintos = Object.entries(pegado).filter(([ruta, t]) => fs.readFileSync(path.join(KIT, 'archivos', ruta), 'utf8') !== t)
  ok(`los mensajes reconstruyen los ${Object.keys(pegado).length} archivos byte por byte`, distintos.length === 0 && Object.keys(pegado).length === archivos.length, distintos.map(([r]) => r).join(', '))
  const grupos = fs.readdirSync(path.join(KIT, 'imagenes'))
  ok('assets en carpetas de máximo 5', grupos.every((g) => fs.readdirSync(path.join(KIT, 'imagenes', g)).length <= 5), grupos.map((g) => `${g}: ${fs.readdirSync(path.join(KIT, 'imagenes', g)).length}`).join(', '))
  const pasos = fs.readFileSync(path.join(KIT, 'PASOS.md'), 'utf8')
  ok('PASOS.md nombra cada mensaje del mapa', numerados.every((f) => pasos.includes(`prompts/${f}`)))
}

// 5. a simulated AI Studio ZIP: files reformatted by its Prettier, assets with URLs,
//    the form connected with postTrackingEvent
const servidor = await servirAssets(path.join(ESPACIO, 'sitio', 'assets'), 4839)
async function zipSimulado(nombre, alterar = () => {}, { kit = KIT, espacio = ESPACIO } = {}) {
  const AdmZip = await cargar('adm-zip', ESPACIO)
  const plantilla = await abrirZip(PLANTILLA)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-zip-'))
  const raiz = path.join(dir, 'project-x-prueba')
  plantilla.extraer(raiz)
  const copiar = (d, rel = '') =>
    fs.readdirSync(path.join(d, rel), { withFileTypes: true }).forEach((e) => {
      const r = path.join(rel, e.name)
      if (e.isDirectory()) return copiar(d, r)
      fs.mkdirSync(path.dirname(path.join(raiz, r)), { recursive: true })
      fs.copyFileSync(path.join(d, r), path.join(raiz, r))
    })
  copiar(path.join(kit, 'archivos'))
  const config = prettierDe(plantilla)
  for (const f of ['src/lib/scrollcraft.js', 'src/lib/scrollcraft.css']) {
    const t = fs.readFileSync(path.join(raiz, f), 'utf8')
    fs.writeFileSync(path.join(raiz, f), await formatear(f, t, config))
  }
  const mapa = path.join(raiz, 'src/components/pagina/image-urls.ts')
  fs.writeFileSync(mapa, fs.readFileSync(mapa, 'utf8').replace(/"([^"]+)": "",/g, (_m, k) => `"${k}": "http://localhost:4839/${k}",`))
  fs.writeFileSync(
    path.join(raiz, 'src/lib/tracking.ts'),
    'export const FORM_ID = "registro";\nexport const CONTACT_SOURCE = "registro";\nexport function postTrackingEvent(data: Record<string, unknown>): void {\n  void data;\n}\n',
  )
  fs.writeFileSync(
    path.join(raiz, 'src/components/pagina/lead.ts'),
    'import { CONTACT_SOURCE, FORM_ID, postTrackingEvent } from "@/lib/tracking";\n\nexport function sendLeadToCrm(campos: Record<string, string>): Promise<unknown> | void {\n  postTrackingEvent({ formId: FORM_ID, formData: campos });\n}\n\nexport const LEAD_FORM_ID = FORM_ID;\nexport const LEAD_SOURCE = CONTACT_SOURCE;\n',
  )
  await alterar(raiz)
  const zip = new AdmZip()
  zip.addLocalFolder(dir)
  const archivo = path.join(espacio, nombre)
  zip.writeZip(archivo)
  fs.rmSync(dir, { recursive: true, force: true })
  return archivo
}
{
  const limpio = await zipSimulado('simulado-limpio.zip')
  const r = await correr('kit.mjs', ['--comparar', limpio])
  ok('--comparar: ZIP limpio de AI Studio (reformateado, con URLs y formulario conectado)', r.codigo === 0, r.codigo === 0 ? r.salida.trim().split('\n')[0] : `\n${r.salida}`)
  ok('--comparar: cada URL sirve exactamente su archivo', /cada URL sirve exactamente su archivo \(12\)/.test(r.salida))
  ok('--comparar: detecta el formulario conectado', /usa el postTrackingEvent/.test(r.salida))
}
{
  const alterado = await zipSimulado('simulado-alterado.zip', async (raiz) => {
    const html = path.join(raiz, 'src/components/pagina/html-01.ts')
    fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('Tres horas, una pieza.', 'Tres horas, una pieza increíble.'))
    fs.rmSync(path.join(raiz, 'src/components/pagina/head.ts'))
    // a different style, same program: must NOT count as a change
    const pagina = path.join(raiz, 'src/components/pagina/Pagina.tsx')
    fs.writeFileSync(pagina, await formatear('Pagina.tsx', fs.readFileSync(pagina, 'utf8'), { printWidth: 70, singleQuote: true, semi: false }))
    const mapa = path.join(raiz, 'src/components/pagina/image-urls.ts')
    fs.writeFileSync(mapa, fs.readFileSync(mapa, 'utf8').replace('"http://localhost:4839/03.webp"', '"http://localhost:4839/item-1.webp"'))
    fs.writeFileSync(path.join(raiz, 'src/components/pagina/lead.ts'), fs.readFileSync(path.join(KIT, 'archivos/src/components/pagina/lead.ts')))
  })
  const r = await correr('kit.mjs', ['--comparar', alterado])
  ok('--comparar: el ZIP alterado no pasa', r.codigo === 1)
  ok('--comparar: detecta el texto cambiado', /✗ src\/components\/pagina\/html-01\.ts: distinto/.test(r.salida))
  ok('--comparar: detecta el archivo que falta', /✗ src\/components\/pagina\/head\.ts: falta/.test(r.salida))
  ok('--comparar: un reformateo no cuenta como cambio', !/Pagina\.tsx/.test(r.salida))
  ok('--comparar: detecta una URL que sirve otro archivo', /no sirven el archivo correcto: 03\.webp/.test(r.salida))
  ok('--comparar: detecta el formulario sin conectar', /todavía no está conectado/.test(r.salida))
  const correcciones = fs.existsSync(path.join(KIT, 'correcciones')) ? fs.readdirSync(path.join(KIT, 'correcciones')) : []
  ok('--comparar: escribe un mensaje de corrección por archivo', correcciones.join() === '01-html-01.ts.md,02-head.ts.md', correcciones.join(', '))
}

// 6. adding pages later: the student migrated only the home first, now the whole site;
//    the update kit carries only what is new or changed, and applying it gives the site
{
  const B = path.join(ESPACIO, 'incremental')
  fs.rmSync(B, { recursive: true, force: true })
  fs.mkdirSync(B, { recursive: true })
  fs.symlinkSync(path.join(ESPACIO, 'node_modules'), path.join(B, 'node_modules'))
  const KB = path.join(B, 'kit')
  let r = await correr('convertir-html.mjs', [path.join(ESPACIO, 'sitio'), '--plantilla', PLANTILLA, '--html', 'index.html'], { espacio: B })
  r = r.codigo === 0 ? await correr('kit.mjs', [], { espacio: B }) : r
  ok('primera migración: solo el home', r.codigo === 0, r.codigo === 0 ? '' : r.salida.slice(-600))
  const v1 = await zipSimulado('v1.zip', () => {}, { kit: KB, espacio: B })
  r = await correr('convertir-html.mjs', [path.join(ESPACIO, 'sitio'), '--plantilla', PLANTILLA], { espacio: B })
  r = r.codigo === 0 ? await correr('kit.mjs', ['--desde', v1], { espacio: B }) : r
  ok('kit de actualización (--desde el ZIP de AI Studio)', r.codigo === 0, r.salida.trim().split('\n').at(-1))
  ok('detecta las páginas nuevas', /páginas nuevas: \/contacto, \/nosotros, \/servicios\/torno/.test(r.salida))
  const prompts = fs.readdirSync(path.join(KB, 'prompts')).filter((f) => /^\d\d-/.test(f)).sort()
  const leer = (f) => fs.readFileSync(path.join(KB, 'prompts', f), 'utf8')
  ok('no reenvía lo que AI Studio ya tiene (el motor)', !prompts.some((f) => /scrollcraft\.(js|css)/.test(f)), prompts.filter((f) => /scrollcraft/.test(f)).join(', '))
  const mapa = prompts.find((f) => /image-urls/.test(f))
  ok('el mapa de imágenes conserva las URLs que ya tenía y agrega la nueva', !!mapa && leer(mapa).includes('"01-poster.webp": "http://localhost:4839/01-poster.webp"') && leer(mapa).includes('"torno.webp": ""'))
  ok('solo sube el asset nuevo', fs.readdirSync(path.join(KB, 'imagenes')).flatMap((g) => fs.readdirSync(path.join(KB, 'imagenes', g))).join() === 'torno.webp')
  ok('pide actualizar la conexión: cada formulario con su form ID', prompts.some((f) => /actualizar-formularios/.test(f)))
  ok('las reglas son de actualización', /actualizar el sitio/.test(leer('00-reglas.md')))
  const ruta = prompts.find((f) => /torno\.tsx/.test(f))
  ok('el mensaje de cada ruta nueva prohíbe borrarla', !!ruta && /no lo borres/.test(leer(ruta)))
  // what AI Studio ends up with: v1 plus the update's files, the new asset's URL, and
  // the connection updated to take each form's ID
  const aplicado = await (async () => {
    const AdmZip = await cargar('adm-zip', ESPACIO)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-v2-'))
    const raiz = path.join(dir, 'project-x-prueba')
    ;(await abrirZip(v1)).extraer(raiz)
    const piezas = {}
    for (const f of prompts) {
      const t = leer(f)
      const titulo = t.match(/^Mensaje \d+ de \d+ · (\S+)/)
      const cuerpo = t.match(/^(`{3,})[a-z]*\n([\s\S]*?)\n\1\n?$/m)
      if (titulo && cuerpo && /^(src|public)\//.test(titulo[1])) piezas[titulo[1]] = (piezas[titulo[1]] || '') + cuerpo[2] + '\n'
    }
    for (const [archivo, texto] of Object.entries(piezas)) {
      fs.mkdirSync(path.dirname(path.join(raiz, archivo)), { recursive: true })
      fs.writeFileSync(path.join(raiz, archivo), texto)
    }
    const m = path.join(raiz, 'src/components/pagina/image-urls.ts')
    fs.writeFileSync(m, fs.readFileSync(m, 'utf8').replace('"torno.webp": ""', '"torno.webp": "http://localhost:4839/torno.webp"'))
    fs.writeFileSync(
      path.join(raiz, 'src/components/pagina/lead.ts'),
      'import { CONTACT_SOURCE, FORM_ID, postTrackingEvent } from "@/lib/tracking";\n\nexport function sendLeadToCrm(campos: Record<string, string>, formId: string = FORM_ID): Promise<unknown> | void {\n  postTrackingEvent({ formId, formData: campos });\n}\n\nexport const LEAD_FORM_ID = FORM_ID;\nexport const LEAD_SOURCE = CONTACT_SOURCE;\n',
    )
    const zip = new AdmZip()
    zip.addLocalFolder(dir)
    const archivo = path.join(B, 'v2.zip')
    zip.writeZip(archivo)
    fs.rmSync(dir, { recursive: true, force: true })
    return archivo
  })()
  r = await correr('kit.mjs', ['--comparar', aplicado], { espacio: B })
  ok('con la actualización aplicada, el proyecto queda igual al sitio completo', r.codigo === 0, r.codigo === 0 ? r.salida.trim().split('\n')[0] : `\n${r.salida}`)
}
servidor.close()

// 7. a page without its own structured data gets WebSite + Organization, valid JSON
{
  const dir = path.join(ESPACIO, 'sitio-sin-jsonld')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.cpSync(path.join(ESPACIO, 'sitio'), dir, { recursive: true })
  const html = path.join(dir, 'index.html')
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, ''))
  const r = await correr('convertir-html.mjs', ['sitio-sin-jsonld', '--plantilla', PLANTILLA, '--dominio', 'faro.example.com'])
  const head = fs.readFileSync(path.join(ESPACIO, 'archivos/src/components/pagina/head.ts'), 'utf8')
  const ld = head.match(/type: "application\/ld\+json", children: ("(?:[^"\\]|\\.)*")/)
  let datos = null
  try {
    datos = ld && JSON.parse(JSON.parse(ld[1]))
  } catch {}
  const tipos = datos?.['@graph']?.map((x) => x['@type']).join(',')
  ok('SEO final: sin datos estructurados propios, agrega WebSite + Organization válidos', r.codigo === 0 && tipos === 'WebSite,Organization' && datos['@graph'][0].url === 'https://faro.example.com/', tipos || 'no se generaron')
}

console.log(`\n${fallas.length ? `${fallas.length} FALLA(S): ${fallas.join(' · ')}` : 'Todo bien.'}\nEspacio de trabajo: ${ESPACIO}`)
process.exit(fallas.length ? 1 : 0)

function servirAssets(dir, puerto) {
  const srv = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!f.startsWith(dir) || !fs.existsSync(f)) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200)
    fs.createReadStream(f).pipe(res)
  })
  return new Promise((r) => srv.listen(puerto, () => r(srv)))
}
