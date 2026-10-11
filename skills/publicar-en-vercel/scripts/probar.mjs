#!/usr/bin/env node
// Tests the site as it will be published, without sending anything anywhere.
//
//   node probar.mjs                 prepares sitio/ and tests it on a local server that
//                                   behaves like Vercel
//   node probar.mjs --url <url>     tests the published site (the .vercel.app address
//                                   or the domain)
//   --solo paginas | formularios    only one half
//
// Pages, in Chrome at 1440×900 and 390×664 (an iPhone with Safari's bars): errors,
// files that don't load, broken internal links and anchors, missing icons, sideways
// scroll on the phone, the 404 page, the noindex header and the redirects.
// Forms (each one in config.json): opens the page with UTMs and ?seguimiento=1, fills
// it in, sends it, and checks what would reach GHL and Tag Manager. GHL's endpoint is
// intercepted and Tag Manager blocked: no contact is created, no visit is counted.
import fs from 'node:fs'
import path from 'node:path'
import { ESPACIO, args, aviso, cargar, esPagina, leerConfig, no, ok, rutaLimpia, servir } from './lib.mjs'
import { preparar } from './preparar.mjs'

const a = args()
const ENDPOINT = 'https://backend.leadconnectorhq.com/external-tracking/events'
const RASTREADORES = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|connect\.facebook\.net|facebook\.com\/tr|clarity\.ms|hotjar\.com|analytics\.tiktok\.com|googleadservices\.com|bat\.bing\.com/

let c = leerConfig()
let base
let servidor
let rutas
if (a.url) {
  base = String(a.url).replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) base = 'https://' + base
  const sitio = path.join(ESPACIO, 'sitio')
  const lista = fs.existsSync(sitio) ? fs.readdirSync(sitio, { recursive: true }).map(String).filter(esPagina) : ['index.html']
  rutas = lista.filter((r) => !/(^|\/)404\.html$/.test(r)).map((r) => rutaLimpia(r.replace(/\\/g, '/')))
} else {
  const r = preparar(ESPACIO, { silencioso: true })
  if (r.errores.length) {
    for (const e of r.errores) no(e)
    process.exit(1)
  }
  c = r.config
  servidor = await servir(r.salida)
  base = servidor.url
  rutas = r.paginas.filter((p) => !/(^|\/)404\.html$/.test(p.rel)).map((p) => p.ruta)
}
rutas = [...new Set(rutas)].sort((x, y) => x.length - y.length)
console.log(`Probando ${base} (${rutas.length} página(s))\n`)

const { chromium } = await cargar('playwright-core')
const navegador = await chromium.launch({ channel: 'chrome', headless: true })
let fallas = 0
const falla = (m) => (fallas++, no(m))

/** A context whose GHL calls are kept here and whose trackers never load. */
async function contexto(viewport, ghl) {
  const ctx = await navegador.newContext({ viewport: { width: viewport[0], height: viewport[1] }, ignoreHTTPSErrors: false })
  await ctx.route('**/*', async (route) => {
    const req = route.request()
    const u = req.url()
    if (u.startsWith(ENDPOINT)) {
      const cuerpo = (req.postDataBuffer() || Buffer.from('')).toString('utf8')
      try {
        ghl.push({ version: req.headers()['version'], evento: JSON.parse(cuerpo.slice(cuerpo.indexOf('{'), cuerpo.lastIndexOf('}') + 1)) })
      } catch {
        ghl.push({ version: req.headers()['version'], evento: null })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    }
    if (RASTREADORES.test(u)) return route.abort()
    // leaving the site (a form's destination, WhatsApp): a blank page, nothing is sent
    if (req.isNavigationRequest() && req.frame() === req.frame().page()?.mainFrame() && !u.startsWith(base)) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>destino</title>' })
    }
    return route.continue()
  })
  return ctx
}

// ---- pages ---------------------------------------------------------------------------------
if (a.solo !== 'formularios') {
  const enlaces = new Map()
  for (const vp of [[1440, 900], [390, 664]]) {
    const ctx = await contexto(vp, [])
    for (const ruta of rutas) {
      const page = await ctx.newPage()
      const problemas = []
      const deSitio = (u) => !u || u.startsWith(base)
      page.on('pageerror', (e) => problemas.push('error de JavaScript: ' + e.message.split('\n')[0]))
      page.on('console', (m) => {
        if (m.type() === 'error' && deSitio(m.location().url) && !/ERR_FAILED|ERR_ABORTED|Failed to load resource/.test(m.text())) problemas.push('consola: ' + m.text().slice(0, 160))
      })
      page.on('response', (r) => {
        if (r.status() >= 400 && r.url().startsWith(base)) problemas.push(`${r.status()} ${r.url().slice(base.length) || '/'}`)
      })
      let resp
      try {
        resp = await page.goto(base + ruta, { waitUntil: 'load', timeout: 45000 })
      } catch (e) {
        falla(`${vp[0]}px ${ruta}: no cargó (${e.message.split('\n')[0]})`)
        await page.close()
        continue
      }
      await page.waitForTimeout(1200)
      // down the whole page, so lazy images and videos ask for their files
      await page.evaluate(async () => {
        const alto = document.documentElement.scrollHeight
        for (let i = 1; i <= 12; i++) {
          window.scrollTo(0, (alto * i) / 12)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(500)
      if (resp && resp.status() >= 400) problemas.push(`la página responde ${resp.status()}`)
      if (vp[0] === 1440 && resp) {
        const robots = resp.headers()['x-robots-tag'] || ''
        const host = new URL(base).hostname
        if (host.endsWith('.vercel.app') && !/noindex/.test(robots)) problemas.push('la dirección .vercel.app no lleva noindex (Google la puede indexar)')
        if (!host.endsWith('.vercel.app') && host !== 'localhost' && /noindex/.test(robots)) problemas.push(`el dominio lleva noindex: Google no la va a mostrar (${robots})`)
      }
      const revision = await page.evaluate(() => {
        const out = { iconos: [], anclas: [], enlaces: [], ancho: 0 }
        document.querySelectorAll('use').forEach((u) => {
          const h = u.getAttribute('href') || u.getAttribute('xlink:href') || ''
          if (h.startsWith('#') && !document.getElementById(h.slice(1))) out.iconos.push(h)
        })
        for (const el of document.querySelectorAll('a[href]')) {
          const u = new URL(el.href, location.href)
          if (u.origin !== location.origin) continue
          if (u.hash && u.pathname === location.pathname) {
            const id = decodeURIComponent(u.hash.slice(1))
            if (id && !document.getElementById(id) && !document.getElementsByName(id).length) out.anclas.push(u.hash)
          } else out.enlaces.push(u.origin + u.pathname)
        }
        out.ancho = document.documentElement.scrollWidth - window.innerWidth
        return out
      })
      for (const i of new Set(revision.iconos)) problemas.push('ícono sin definir: ' + i)
      for (const h of new Set(revision.anclas)) problemas.push('ancla que no existe: ' + h)
      for (const e of revision.enlaces) if (!enlaces.has(e)) enlaces.set(e, ruta)
      if (vp[0] === 390 && revision.ancho > 1) problemas.push(`en teléfono la página se mueve de lado (${revision.ancho}px de más)`)
      const unicos = [...new Set(problemas)]
      if (unicos.length) {
        fallas++
        no(`${vp[0]}px ${ruta}:\n    - ${unicos.join('\n    - ')}`)
      } else ok(`${vp[0]}px ${ruta}`)
      await page.close()
    }
    await ctx.close()
  }
  // internal links, once each
  const ctx = await navegador.newContext()
  for (const [url, desde] of enlaces) {
    try {
      const r = await ctx.request.get(url, { maxRedirects: 5 })
      if (r.status() >= 400) falla(`enlace roto en ${desde}: ${url.slice(base.length) || '/'} (${r.status()})`)
    } catch (e) {
      falla(`enlace que no responde en ${desde}: ${url}`)
    }
  }
  if (enlaces.size) ok(`${enlaces.size} enlace(s) interno(s) revisados`)
  const r404 = await ctx.request.get(base + '/esta-pagina-no-existe-' + Date.now(), { maxRedirects: 0 })
  if (r404.status() === 404 && /<html/i.test(await r404.text())) ok('Página 404 propia')
  else falla(`No hay página 404 propia (una dirección que no existe responde ${r404.status()})`)
  if (a.url) {
    for (const red of c.redirecciones) {
      const r = await ctx.request.get(base + red.desde, { maxRedirects: 0 })
      const loc = r.headers()['location'] || ''
      if (r.status() >= 300 && r.status() < 400 && loc.replace(base, '').replace(/\/$/, '') === red.hacia.replace(base, '').replace(/\/$/, '')) ok(`Redirección ${red.desde} → ${red.hacia}`)
      else falla(`Redirección ${red.desde}: responde ${r.status()} ${loc}`)
    }
  }
  await ctx.close()
}

// ---- forms ---------------------------------------------------------------------------------
const formularios = c.formularios.filter((f) => f.incluir)
if (a.solo !== 'paginas' && formularios.length) {
  console.log('\nFormularios (nada sale de esta computadora):')
  const conGhl = !!(c.ghl.trackingId && c.ghl.locationId)
  if (!conGhl) aviso('Sin Tracking ID o Location ID en config.json: pruebo lo que se mandaría, pero en vivo no llegaría a GHL.')
  for (const f of formularios) {
    const ghl = []
    const capa = []
    const registro = []
    const ctx = await contexto([1440, 900], ghl)
    await ctx.addCookies([{ name: '_fbp', value: 'fb.1.1700000000000.123456789', url: base }])
    const page = await ctx.newPage()
    await page.exposeFunction('__probarCapa', (s) => capa.push(JSON.parse(s)))
    await page.exposeFunction('__probarRegistro', (s) => registro.push(JSON.parse(s)))
    await page.addInitScript(() => {
      const espejo = (nombre, aviso) => {
        const arr = []
        const push = arr.push.bind(arr)
        arr.push = (...xs) => {
          for (const x of xs) {
            try {
              window[aviso](JSON.stringify(x))
            } catch {}
          }
          return push(...xs)
        }
        window[nombre] = arr
      }
      espejo('dataLayer', '__probarCapa')
      espejo('__seguimiento', '__probarRegistro')
    })
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message.split('\n')[0]))
    const ruta = rutaLimpia(f.pagina)
    const titulo = `${f.formId} (${ruta})`
    try {
      await page.goto(`${base}${ruta}?seguimiento=1&utm_source=prueba&utm_medium=prueba&utm_campaign=prueba&utm_content=prueba&fbclid=PRUEBA&gclid=PRUEBA`, { waitUntil: 'load', timeout: 45000 })
      await page.waitForTimeout(1000)
      const sel = `form[data-form-id="${f.formId}"]`
      if (!(await page.$(sel))) throw new Error(`la página no tiene ${sel} (corre preparar.mjs)`)
      if (f.abrir) {
        await page.click(f.abrir)
        await page.waitForTimeout(600)
      }
      // a form inside a closed <dialog> or a hidden panel: open it the way the site would
      await page.evaluate((s) => {
        const form = document.querySelector(s)
        const dlg = form.closest('dialog')
        if (dlg && !dlg.open) dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '')
        form.scrollIntoView({ block: 'center' })
      }, sel)
      await page.waitForTimeout(400)
      if (!(await page.locator(sel).isVisible())) throw new Error('el formulario no se ve. En config.json ponle "abrir": "<selector del botón que lo abre>"')
      // fill in every field, in order, the way a person would (focus → type → leave)
      const tel = c.telefono || { digitos: 10 }
      const llenado = await page.evaluate(
        ({ s, digitos }) => {
          const form = document.querySelector(s)
          const valores = []
          const setter = (el, v) => {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
          }
          const ver = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
          const grupos = new Set()
          for (const el of form.elements) {
            if (!el.name || el.disabled || el.type === 'hidden' || /^(submit|button|reset|image|file)$/.test(el.type)) continue
            if (!ver(el) && !el.required) continue
            const n = (el.name || '').toLowerCase()
            const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
            el.focus()
            if (el.type === 'radio') {
              if (grupos.has(el.name)) continue
              grupos.add(el.name)
              if (!form.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`)) el.click()
            } else if (el.type === 'checkbox') {
              if (el.required && !el.checked) el.click()
            } else if (el.tagName === 'SELECT') {
              const op = [...el.options].find((o) => o.value && !o.disabled)
              if (op) setter(el, op.value)
            } else {
              let v = 'Prueba'
              if (el.type === 'email' || /e-?mail|correo/.test(n) || ac.includes('email')) v = 'prueba+seguimiento@ejemplo.com'
              else if (el.type === 'tel' || /tel|phone|celular|movil|móvil|whatsapp/.test(n) || ac.includes('tel')) v = '9'.padEnd(digitos, '8')
              else if (/apellido|last/.test(n) || ac.includes('family')) v = 'Seguimiento'
              else if (/nombre|name/.test(n) || ac.includes('name')) v = 'Prueba Seguimiento'
              else if (el.tagName === 'TEXTAREA') v = 'Mensaje de prueba del seguimiento'
              else if (el.type === 'number') v = el.min || '1'
              else if (el.type === 'date') v = new Date().toISOString().slice(0, 10)
              else if (el.type === 'url') v = 'https://ejemplo.com'
              setter(el, v)
              el.dispatchEvent(new Event('input', { bubbles: true }))
            }
            el.dispatchEvent(new Event('change', { bubbles: true }))
            el.blur()
            valores.push(`${el.name}=${el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value}`)
          }
          return valores
        },
        { s: sel, digitos: tel.digitos || 10 },
      )
      await page.waitForTimeout(500)
      const boton = page.locator(`${sel} button[type=submit], ${sel} button:not([type]), ${sel} input[type=submit]`).first()
      if ((await boton.count()) && (await boton.isVisible())) await boton.click()
      else await page.evaluate((s) => document.querySelector(s).requestSubmit(), sel)
      await page.waitForTimeout(2600)
      const final = page.url()
      const estado = await page.evaluate((s) => document.querySelector(s)?.getAttribute('data-estado') || '', sel).catch(() => '')

      // what was sent
      const eventos = registro.length ? registro : ghl.map((g) => g.evento)
      const visita = eventos.find((e) => e && e.type === 'external_script_page_view')
      const completo = eventos.find((e) => e && e.formId === f.formId)
      const parcial = eventos.find((e) => e && e.formId === `${f.formId}-parcial`)
      const conv = (n) => capa.find((e) => e.event === 'conversion' && e.event_name === n)
      const p = []
      const bien = []
      if (!visita) p.push('no se mandó la visita de página (sin ella GHL pierde el utm_campaign)')
      else if (!/utm_campaign=prueba/.test(visita.url)) p.push('la visita no lleva los UTM en la URL')
      else bien.push('visita con UTM')
      if (!conv('FormStart')) p.push('Tag Manager no recibió FormStart')
      if (f.parcial !== false) {
        if (!parcial) p.push(`no se mandó el parcial (${f.formId}-parcial) al salir del correo o teléfono`)
        else if (!conv('FormPartial')) p.push('Tag Manager no recibió FormPartial')
        else bien.push('parcial')
      }
      if (!completo) p.push(`no se mandó el registro completo (${f.formId})`)
      else {
        const fd = completo.formData || {}
        const clave = (k) => c.campos[k] || k
        if (!fd.email && !fd.phone) p.push('el registro no lleva correo ni teléfono')
        if (completo.sessionId !== visita?.sessionId) p.push('el registro no repite la sesión de la visita')
        if (!completo.pageUrl) p.push('el registro no lleva pageUrl')
        if (!fd[clave('utm_campaign')]) p.push('el registro no lleva utm_campaign')
        if (fd[clave('meta_fbp')] !== 'fb.1.1700000000000.123456789') p.push('el registro no lleva la cookie _fbp de Meta')
        if (!fd[clave('meta_fbc')]) p.push('el registro no lleva meta_fbc (fbclid)')
        const lead = conv('Lead')
        let idsMeta = {}
        try {
          idsMeta = JSON.parse(fd[clave('meta_event_ids')] || '{}')
        } catch {}
        if (!lead) p.push('Tag Manager no recibió Lead')
        else if (idsMeta.Lead !== lead.event_id) p.push('el event_id del Lead en GHL no es el mismo que recibe el pixel')
        else bien.push('Lead con el mismo event_id')
        if (conGhl) {
          const enRed = ghl.find((g) => g.evento && g.evento.formId === f.formId)
          if (!enRed) p.push('el registro no salió a la red')
          else if (enRed.version !== '2021-07-28') p.push('falta el encabezado version: 2021-07-28')
          else if (enRed.evento.trackingId !== c.ghl.trackingId || enRed.evento.locationId !== c.ghl.locationId) p.push('el registro no lleva el Tracking ID o el Location ID de config.json')
          else bien.push('sale a GHL')
        }
      }
      if (errores.length) p.push('errores de JavaScript: ' + [...new Set(errores)].join(' | '))
      const despues = final.startsWith(base) ? (estado === 'enviado' ? 'queda en «enviado»' : 'se queda en la página (lo maneja el sitio)') : `va a ${final}`
      if (p.length) {
        fallas++
        no(`${titulo}:\n    - ${p.join('\n    - ')}\n    Al enviar ${despues}`)
      } else ok(`${titulo}: ${bien.join(', ')}; al enviar ${despues}`)
      if (completo && (a.detalle || p.length)) {
        console.log('    Llenado: ' + llenado.join(' | '))
        console.log('    Llega a GHL: ' + Object.entries(completo.formData || {}).map(([k, v]) => `${completo.formLabels?.[k] || k}=${String(v).slice(0, 40)}`).join(' | '))
      }
    } catch (e) {
      falla(`${titulo}: ${e.message.split('\n')[0]}`)
    }
    await ctx.close()
  }
}

await navegador.close()
servidor && servidor.cerrar()
console.log(fallas ? `\n${fallas} problema(s).` : '\nTodo bien.')
process.exit(fallas ? 1 : 0)
