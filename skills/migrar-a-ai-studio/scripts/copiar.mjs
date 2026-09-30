#!/usr/bin/env node
// Puts the next kit message on the student's clipboard, in UTF-8, and checks it arrived
// byte for byte: the student only pastes (Cmd/Ctrl + V) and says «siguiente». Without
// UTF-8, macOS's pbcopy turns every accent, «ñ», «¿» and «·» into garbage (· → ¬∑),
// inside the code.
//
//   cd <workspace>
//   node <skill>/scripts/copiar.mjs            the next message (remembers where it is)
//   node <skill>/scripts/copiar.mjs 07         that message (and goes on from there)
//   node <skill>/scripts/copiar.mjs <file>     any file (a correction, a file for Code)
//   node <skill>/scripts/copiar.mjs --estado   where it is, without copying
//
// Prints what the message is and what the chat should answer. The clipboard is the
// student's own, so on macOS run it outside the sandbox.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ESPACIO, args } from './lib.mjs'

const a = args()
const KIT = path.join(ESPACIO, 'kit')
const PROMPTS = path.join(KIT, 'prompts')
const ESTADO = path.join(KIT, '.copiado')
const pos = a._ || []

// the messages in order: 00-reglas, 01-…, then the assets and the form, as PASOS.md lists them
const mensajes = fs.existsSync(PROMPTS)
  ? fs.readdirSync(PROMPTS).filter((f) => /^\d{2}-.*\.md$/.test(f)).sort()
  : []
const ultimo = fs.existsSync(ESTADO) ? fs.readFileSync(ESTADO, 'utf8').trim() : ''

if (a.estado) {
  console.log(ultimo ? `Último copiado: ${ultimo} (${mensajes.indexOf(ultimo) + 1} de ${mensajes.length})` : 'Todavía no se copió ningún mensaje.')
  process.exit(0)
}

let archivo
const arg = pos[0]
if (arg && fs.existsSync(path.resolve(arg))) archivo = path.resolve(arg)
else if (arg && /^\d{1,2}$/.test(arg)) {
  const n = arg.padStart(2, '0')
  const f = mensajes.find((m) => m.startsWith(`${n}-`))
  if (!f) throw new Error(`No hay mensaje ${n} en ${PROMPTS}`)
  archivo = path.join(PROMPTS, f)
} else {
  const i = ultimo ? mensajes.indexOf(ultimo) + 1 : 0
  if (i >= mensajes.length) {
    console.log('Ya se copiaron todos los mensajes del kit.')
    process.exit(0)
  }
  archivo = path.join(PROMPTS, mensajes[i])
}

const texto = fs.readFileSync(archivo, 'utf8')
const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }
const correr = (cmd, argv, input) => spawnSync(cmd, argv, { input, env, encoding: 'utf8', maxBuffer: 64 << 20 })
let leido
if (process.platform === 'darwin') {
  correr('pbcopy', [], texto)
  leido = correr('pbpaste', []).stdout
} else if (process.platform === 'win32') {
  // PowerShell's Set-Clipboard keeps UTF-8 (clip.exe does not)
  const tmp = path.join(KIT, '.portapapeles.txt')
  fs.writeFileSync(tmp, texto, 'utf8')
  correr('powershell', ['-NoProfile', '-Command', `Get-Content -Raw -Encoding UTF8 '${tmp}' | Set-Clipboard`])
  leido = correr('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw']).stdout
  fs.rmSync(tmp, { force: true })
} else {
  correr('xclip', ['-selection', 'clipboard'], texto)
  leido = correr('xclip', ['-selection', 'clipboard', '-o']).stdout
}
const norm = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/\n+$/, '')
if (norm(leido) !== norm(texto)) {
  console.error(`✗ El portapapeles no quedó igual a ${path.basename(archivo)}: no le digas que pegue. (¿Corre fuera del sandbox?)`)
  process.exit(1)
}
if (archivo.startsWith(PROMPTS) && mensajes.includes(path.basename(archivo))) fs.writeFileSync(ESTADO, path.basename(archivo))

const titulo = texto.split('\n')[0]
// the last «Responde …» of the message is what the chat should answer («Entendido» in 00)
const respuesta = [...texto.matchAll(/[Rr]esponde(?: solo)?:? «([^»]+)»/g)].pop()?.[1]
const i = mensajes.indexOf(path.basename(archivo))
console.log(`✓ En el portapapeles, idéntico al archivo (UTF-8): ${path.basename(archivo)}${i >= 0 ? ` · ${i + 1} de ${mensajes.length}` : ''}`)
console.log(`  ${titulo}`)
if (respuesta) console.log(`  Respuesta esperada: «${respuesta}»`)
const adj = /Te adjunto (\d+) archivo/.exec(texto)
if (adj) console.log(`  Lleva ${adj[1]} adjunto(s): la carpeta de imagenes/ que nombra el mensaje.`)
