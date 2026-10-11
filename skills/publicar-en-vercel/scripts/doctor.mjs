#!/usr/bin/env node
// Preflight for publishing on Vercel, and the workspace it runs in.
//
//   node doctor.mjs                     check Node, Chrome, the tests' package and the
//                                       Vercel session; say what is missing
//   node doctor.mjs --preparar [dir]    create the workspace (default: current dir) and
//                                       install playwright-core for the tests
//
// The Vercel CLI is never installed: every command runs `npx vercel@latest`.
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { ESPACIO, WIN, args, cargar, leerConfig, no, ok, vercel } from './lib.mjs'

const a = args()
let fallas = 0
const DEPS = { 'playwright-core': '^1.55.0' }

if (a.preparar) {
  const dir = path.resolve(typeof a.preparar === 'string' ? a.preparar : ESPACIO)
  fs.mkdirSync(dir, { recursive: true })
  const pj = path.join(dir, 'package.json')
  if (!fs.existsSync(pj)) {
    fs.writeFileSync(pj, JSON.stringify({ name: 'publicar-en-vercel', private: true, type: 'module', devDependencies: DEPS }, null, 2) + '\n')
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\nsitio/.vercel\nsitio/.env*\n')
  console.log(`Instalando lo que usan las pruebas en ${dir} (menos de un minuto)…`)
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'inherit', shell: WIN })
  if (r.status !== 0) {
    no('npm install falló. Revisa el error de arriba.')
    process.exit(1)
  }
  ok(`Espacio de publicación listo: ${dir}`)
  process.exit(0)
}

// Node
const [maj, min] = process.versions.node.split('.').map(Number)
if (maj > 20 || (maj === 20 && min >= 19)) ok(`Node ${process.versions.node}`)
else {
  no(`Node ${process.versions.node}: hace falta 20.19 o más reciente (https://nodejs.org, versión LTS)`)
  fallas++
}
try {
  ok(`npm ${execSync('npm --version', { encoding: 'utf8' }).trim()}`)
} catch {
  no('npm no está disponible (viene con Node)')
  fallas++
}

// the tests' package and Chrome
const falta = !fs.existsSync(path.join(ESPACIO, 'node_modules', 'playwright-core', 'package.json'))
if (falta) {
  no(`Falta preparar el espacio ${ESPACIO}. Corre: node doctor.mjs --preparar`)
  fallas++
} else {
  try {
    const { chromium } = await cargar('playwright-core')
    const b = await chromium.launch({ channel: 'chrome', headless: true })
    ok(`Google Chrome ${b.version()}`)
    await b.close()
  } catch (e) {
    no(`No pude abrir Google Chrome (${String(e.message).split('\n')[0]}). Instálalo desde https://www.google.com/chrome`)
    fallas++
  }
}

// Vercel: the student's session (the CLI keeps it after `vercel login`)
let c = null
try {
  c = leerConfig()
} catch {}
const yo = vercel(c, ['whoami'], { timeout: 120000 })
const usuario = yo.salida
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^(Vercel CLI|>|npm )/i.test(l) && !/warn|error|update/i.test(l))
  .pop()
if (yo.status === 0 && usuario) ok(`Sesión de Vercel: ${usuario}${c && c.equipo ? ` (equipo ${c.equipo})` : ''}`)
else {
  no('No hay sesión de Vercel en esta computadora. El alumno inicia sesión (ver SKILL.md, «Vercel: iniciar sesión»).')
  fallas++
}

if (fallas) {
  console.log(`\n${fallas} cosa(s) por resolver antes de publicar.`)
  process.exit(1)
}
console.log('\nTodo listo para publicar.')
