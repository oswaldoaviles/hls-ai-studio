#!/usr/bin/env node
// Publishes the site on Vercel.
//
//   node publicar.mjs              prepares sitio/ and publishes it to production: the
//                                  project's .vercel.app address and, once added, the domain
//   node publicar.mjs --prueba     a preview deployment instead (its own address, visible
//                                  only when signed in to Vercel)
//   --sin-preparar                 publish sitio/ as it is
//
// The first time it creates the Vercel project (config.json "proyecto") and links
// sitio/ to it. Run it in the workspace.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ESPACIO, args, aviso, dominioLimpio, guardarEstado, leerConfig, leerEstado, no, ok, tmp, vercel, vercelEnVivo } from './lib.mjs'
import { preparar } from './preparar.mjs'

const a = args()
let c = leerConfig()
let sitio = path.join(ESPACIO, 'sitio')

if (!a['sin-preparar']) {
  const r = preparar(ESPACIO)
  if (r.errores.length) {
    no('Corrige lo de arriba antes de publicar.')
    process.exit(1)
  }
  c = r.config
  console.log('')
}

// 1. the student's Vercel session
const yo = vercel(c, ['whoami'])
if (yo.status !== 0) {
  no('No hay sesión de Vercel en esta computadora: el alumno inicia sesión primero (SKILL.md, «Vercel: iniciar sesión»).')
  process.exit(1)
}

// 2. the project, and sitio/ linked to it (once)
const enlace = path.join(sitio, '.vercel', 'project.json')
if (!fs.existsSync(enlace)) {
  console.log(`Creando el proyecto "${c.proyecto}" en Vercel…`)
  const alta = vercel(c, ['project', 'add', c.proyecto], { cwd: ESPACIO })
  if (alta.status !== 0 && !/already exists/i.test(alta.salida)) {
    no(`No pude crear el proyecto:\n${alta.salida.trim()}`)
    process.exit(1)
  }
  const ln = vercel(c, ['link', '--yes', '--project', c.proyecto], { cwd: sitio })
  if (ln.status !== 0 || !fs.existsSync(enlace)) {
    no(`No pude enlazar la carpeta con el proyecto:\n${ln.salida.trim()}`)
    process.exit(1)
  }
  ok(`Proyecto "${c.proyecto}" enlazado`)
}

// 3. never from inside a git repository: Vercel checks the last commit's author and can
//    block the deployment («commit author doesn't have permission»)
const enGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: sitio, encoding: 'utf8' })
if (enGit.status === 0 && enGit.stdout.trim() === 'true') {
  const copia = tmp('publicar-')
  fs.cpSync(sitio, copia, { recursive: true })
  sitio = copia
}

// 4. deploy. The CLI can stay on «Building…» after Vercel is done: with a deadline, and
//    then its status is asked with `vercel inspect`.
console.log(a.prueba ? 'Publicando una vista de prueba…' : 'Publicando…')
let url = ''
const salida = await vercelEnVivo(c, ['deploy', ...(a.prueba ? [] : ['--prod']), '--yes'], {
  cwd: sitio,
  limite: 300000,
  alVer: (s) => {
    const m = s.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)
    if (m && !url) url = m[0]
  },
})
if (!url) {
  no(`Vercel no devolvió la dirección de la publicación:\n${salida.salida.trim().slice(-1500)}`)
  process.exit(1)
}

/** status and aliases of a deployment, from `vercel inspect` */
function inspeccionar(u) {
  const r = vercel(c, ['inspect', u], { cwd: ESPACIO, timeout: 90000 })
  const estado = (r.salida.match(/status\s+[●•]?\s*([A-Za-z]+)/i) || [, ''])[1]
  const parteAlias = (r.salida.split(/\n\s*Aliases\s*\n/i)[1] || '').split(/\n\s*Builds\b/i)[0]
  const alias = [...new Set([...parteAlias.matchAll(/https:\/\/[^\s]+/g)].map((m) => m[0]))]
  return { estado, alias, salida: r.salida }
}
let info = inspeccionar(url)
for (let i = 0; i < 30 && !/ready|error|canceled|blocked/i.test(info.estado); i++) {
  await new Promise((r) => setTimeout(r, 10000))
  info = inspeccionar(url)
}
if (!/ready/i.test(info.estado)) {
  no(`La publicación quedó en «${info.estado || 'desconocido'}»: ${url}`)
  console.log(info.salida.trim().slice(-1200))
  aviso('Busca el mensaje en references/problemas.md.')
  process.exit(1)
}

// 5. where it lives now
const dominio = dominioLimpio(c.dominio)
const vercelApp = info.alias.filter((x) => x.endsWith('.vercel.app')).sort((x, y) => x.length - y.length)
const principal = a.prueba ? url : vercelApp.find((x) => x === `https://${c.proyecto}.vercel.app`) || vercelApp[0] || url
const estado = leerEstado()
estado.proyecto = c.proyecto
if (!a.prueba) {
  estado.direccion = principal
  estado.produccion = { url, alias: info.alias, fecha: new Date().toISOString() }
} else estado.prueba = { url, fecha: new Date().toISOString() }
guardarEstado(estado)

ok(`Publicado (${info.estado})`)
console.log(`  ${a.prueba ? 'Vista de prueba (solo con sesión de Vercel)' : 'Dirección de Vercel'}: ${principal}`)
if (!a.prueba && dominio) {
  const conDominio = info.alias.some((x) => x.includes(dominio))
  console.log(`  Dominio: https://${dominio}${conDominio ? '' : '  (todavía no apunta aquí: node dominio.mjs --revisar)'}`)
}
console.log(`\nSiguiente: node probar.mjs --url ${principal}`)
