#!/usr/bin/env node
// Preflight for the migration, and the workspace it runs in.
//
//   node doctor.mjs                     check what is there, say what is missing
//   node doctor.mjs --preparar [dir]    create the workspace (default: current dir)
//                                       and install the scripts' dependencies
//
// The workspace (usually <build>/ai-studio/) holds the converted files, the kit,
// the validation copy of the template, and node_modules for the scripts.
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { args, cargar } from './lib.mjs'

const a = args()
const ok = (m) => console.log(`✓ ${m}`)
const no = (m) => console.log(`✗ ${m}`)
let fallas = 0

const DEPS = {
  'adm-zip': '^0.5.16',
  lightningcss: '^1.30.1',
  parse5: '^7.3.0',
  'playwright-core': '^1.55.0',
  prettier: '^3.7.3',
  vite: '^8.1.5',
}

if (a.preparar) {
  const dir = path.resolve(typeof a.preparar === 'string' ? a.preparar : process.cwd())
  fs.mkdirSync(dir, { recursive: true })
  const pj = path.join(dir, 'package.json')
  if (!fs.existsSync(pj)) {
    fs.writeFileSync(
      pj,
      JSON.stringify({ name: 'migracion-ai-studio', private: true, type: 'module', devDependencies: DEPS }, null, 2) + '\n',
    )
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.validar\n')
  console.log(`Instalando dependencias en ${dir} (1-2 minutos la primera vez)…`)
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    no('npm install falló. Revisa el error de arriba.')
    process.exit(1)
  }
  ok(`Espacio de trabajo listo: ${dir}`)
  process.exit(0)
}

// Node
const [maj, min] = process.versions.node.split('.').map(Number)
if (maj > 20 || (maj === 20 && min >= 19)) ok(`Node ${process.versions.node}`)
else {
  no(`Node ${process.versions.node}: hace falta 20.19 o más reciente (https://nodejs.org)`)
  fallas++
}

// npm
try {
  ok(`npm ${execSync('npm --version', { encoding: 'utf8' }).trim()}`)
} catch {
  no('npm no está disponible (viene con Node)')
  fallas++
}

// workspace dependencies
const faltan = Object.keys(DEPS).filter((d) => !fs.existsSync(path.join(process.cwd(), 'node_modules', d, 'package.json')))
if (faltan.length) {
  no(`Faltan dependencias en ${process.cwd()}: ${faltan.join(', ')}. Corre: node doctor.mjs --preparar`)
  fallas++
} else ok('Dependencias del espacio de trabajo')

// Chrome (the tests drive the installed Chrome, not a bundled Chromium)
if (!faltan.includes('playwright-core')) {
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

if (fallas) {
  console.log(`\n${fallas} cosa(s) por resolver antes de migrar.`)
  process.exit(1)
}
console.log('\nTodo listo para migrar.')
