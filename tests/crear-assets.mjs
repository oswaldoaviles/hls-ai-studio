#!/usr/bin/env node
// Builds the test site: the pages in tests/fixture/ (a home, nosotros, contacto and a
// service page in servicios/, sharing sitio.css) plus the scroll-craft engine and
// synthetic assets (WebP drawn by Chrome, since ffmpeg often lacks a WebP
// encoder; MP4 clips encoded for scrubbing with ffmpeg).
//
//   cd <workspace prepared by doctor.mjs --preparar>
//   node <plugin>/tests/crear-assets.mjs <destino> [--scroll-craft <skill dir>]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { args, cargar } from '../skills/migrar-a-ai-studio/scripts/lib.mjs'

const a = args()
const DESTINO = path.resolve(a._[0] || 'sitio-de-prueba')
const AQUI = path.dirname(fileURLToPath(import.meta.url))

function buscarScrollCraft() {
  if (typeof a['scroll-craft'] === 'string') return a['scroll-craft']
  const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache')
  const hallados = []
  const buscar = (dir, nivel) => {
    if (nivel > 5 || !fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = path.join(dir, e.name)
      if (e.name === 'scroll-craft' && fs.existsSync(path.join(p, 'engine', 'scrollcraft.js'))) hallados.push(p)
      else buscar(p, nivel + 1)
    }
  }
  buscar(cache, 0)
  return hallados.sort().pop()
}
const SC = buscarScrollCraft()
if (!SC) throw new Error('No encontré el skill scroll-craft (pasa --scroll-craft <carpeta>)')

fs.mkdirSync(path.join(DESTINO, 'assets'), { recursive: true })
fs.cpSync(path.join(AQUI, 'fixture'), DESTINO, { recursive: true })
for (const f of ['scrollcraft.js', 'scrollcraft.css']) fs.copyFileSync(path.join(SC, 'engine', f), path.join(DESTINO, f))

// stills: a warm gradient, a few shapes and the file's name, so a wrong URL shows
const stills = [
  ['01-poster.webp', 1920, 1080, '#3b2415', '#c8643b'],
  ['03.webp', 1920, 1080, '#2a1d14', '#a4704d'],
  ['04-poster.webp', 1920, 1080, '#1c1410', '#e0874f'],
  ['item-1.webp', 800, 1000, '#402a1c', '#d9a37c'],
  ['item-2.webp', 800, 1000, '#2c2420', '#b98b6a'],
  ['item-3.webp', 800, 1000, '#1f1a17', '#8f6a50'],
  ['og.jpg', 1200, 630, '#3b2415', '#e0874f'],
  ['torno.webp', 1600, 1000, '#2f1d12', '#c8643b'],
]
const { chromium } = await cargar('playwright-core')
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage()
for (const [nombre, w, h, c1, c2] of stills) {
  const url = await p.evaluate(
    ([nombre, w, h, c1, c2]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, c1)
      grad.addColorStop(1, c2)
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(255,240,225,.18)'
      for (let i = 0; i < 7; i++) {
        g.beginPath()
        g.arc(w * (0.15 + 0.12 * i), h * (0.5 + 0.28 * Math.sin(i)), Math.min(w, h) * (0.06 + 0.02 * i), 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = 'rgba(255,245,235,.9)'
      g.font = `700 ${Math.round(h / 9)}px system-ui, sans-serif`
      g.fillText(nombre, w * 0.06, h * 0.9)
      return c.toDataURL(nombre.endsWith('.jpg') ? 'image/jpeg' : 'image/webp', 0.82)
    },
    [nombre, w, h, c1, c2],
  )
  fs.writeFileSync(path.join(DESTINO, 'assets', nombre), Buffer.from(url.split(',')[1], 'base64'))
}
await b.close()

// clips: dense keyframes, like scroll-craft's encode.sh; phone variants in portrait
const clips = [
  ['01.mp4', 'testsrc2=size=1280x720:rate=30:duration=3', 8],
  ['01-m.mp4', 'testsrc2=size=720x1280:rate=30:duration=3', 4],
  ['04.mp4', 'smptehdbars=size=1280x720:rate=30:duration=3,hue=h=t*40', 8],
  ['04-m.mp4', 'smptehdbars=size=720x1280:rate=30:duration=3,hue=h=t*40', 4],
]
for (const [nombre, fuente, gop] of clips) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', fuente, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', String(gop), '-crf', '30', '-movflags', '+faststart', '-an', path.join(DESTINO, 'assets', nombre)])
}
const pesos = fs.readdirSync(path.join(DESTINO, 'assets')).map((f) => `${f} ${(fs.statSync(path.join(DESTINO, 'assets', f)).size / 1024).toFixed(0)} KB`)
console.log(`Sitio de prueba en ${DESTINO}\n  ${pesos.join('\n  ')}`)
