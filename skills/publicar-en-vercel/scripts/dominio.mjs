#!/usr/bin/env node
// The student's own domain.
//
//   node dominio.mjs <dominio>     adds the domain (and www) to the Vercel project, saves
//                                  it in config.json, and prints the DNS records to set
//                                  at the provider it detects, plus the ones not to touch
//   node dominio.mjs --revisar     checks DNS, the certificate, www → domain, http → https
//                                  and that Google can index the domain
//
// Run it in the workspace. After adding the domain, publish again: the tracking only
// sends on the domain written in config.json.
import { Resolver } from 'node:dns/promises'
import { ESPACIO, args, aviso, dominioLimpio, guardarConfig, guardarEstado, leerConfig, leerEstado, no, ok, vercel } from './lib.mjs'

const a = args()
const c = leerConfig()
const dns = new Resolver()
dns.setServers(['1.1.1.1', '8.8.8.8'])
const intentar = async (f) => {
  try {
    return await f()
  } catch {
    return []
  }
}

// The records Vercel has always accepted; its dashboard may show newer ones
// (216.198.79.x and <algo>.vercel-dns-0xx.com) and either set works.
const A_VERCEL = '76.76.21.21'
const CNAME_VERCEL = 'cname.vercel-dns.com'
const esVercelA = (ip) => ip === A_VERCEL || /^216\.198\.79\./.test(ip) || /^76\.76\.21\./.test(ip)
const esVercelCname = (h) => /vercel-dns(-\d+)?\.com\.?$/i.test(h)
const esCloudflareIp = (ip) => /^(104\.(1[6-9]|2[0-7])\.|172\.(6[4-9]|7[01])\.|188\.114\.)/.test(ip)

const PROVEEDORES = [
  [/cloudflare\.com/i, 'Cloudflare'],
  [/domaincontrol\.com/i, 'GoDaddy'],
  [/dns-parking\.com|hostinger/i, 'Hostinger'],
  [/registrar-servers\.com/i, 'Namecheap'],
  [/googledomains\.com|squarespacedns|squarespace/i, 'Squarespace (antes Google Domains)'],
  [/wixdns\.net/i, 'Wix'],
  [/vercel-dns\.com/i, 'Vercel'],
  [/awsdns/i, 'Amazon Route 53'],
  [/akky|neubox|hostgator|bluehost|ionos|ui-dns/i, 'otro proveedor'],
]
async function proveedor(d) {
  const ns = await intentar(() => dns.resolveNs(d))
  const p = PROVEEDORES.find(([re]) => ns.some((n) => re.test(n)))
  return { ns, nombre: p ? p[1] : ns.length ? 'otro proveedor' : 'desconocido' }
}

if (a.revisar) {
  const d = dominioLimpio(c.dominio)
  if (!d) {
    no('config.json todavía no tiene dominio. Primero: node dominio.mjs <dominio>')
    process.exit(1)
  }
  let fallas = 0
  const falla = (m) => (fallas++, no(m))
  const A = await intentar(() => dns.resolve4(d))
  const wwwC = await intentar(() => dns.resolveCname(`www.${d}`))
  const wwwA = wwwC.length ? [] : await intentar(() => dns.resolve4(`www.${d}`))
  if (A.some(esVercelA)) ok(`${d} apunta a Vercel (${A.join(', ')})`)
  else if (A.some(esCloudflareIp)) falla(`${d} pasa por el proxy de Cloudflare (${A.join(', ')}): pon el registro en «DNS only» (nube gris).`)
  else falla(`${d} todavía apunta a ${A.join(', ') || 'nada'}: falta el registro A ${A_VERCEL} (o el cambio aún no se propaga).`)
  if (c.www !== false) {
    if (wwwC.some(esVercelCname) || wwwA.some(esVercelA)) ok(`www.${d} apunta a Vercel`)
    else if (wwwA.some(esCloudflareIp)) falla(`www.${d} pasa por el proxy de Cloudflare: ponlo en «DNS only».`)
    else falla(`www.${d} apunta a ${wwwC.join(', ') || wwwA.join(', ') || 'nada'}: falta el CNAME ${CNAME_VERCEL}.`)
  }
  const pedir = async (u) => {
    try {
      return await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    } catch (e) {
      return { error: String(e.cause?.code || e.cause?.message || e.message) }
    }
  }
  const raiz = await pedir(`https://${d}/`)
  if (raiz.error) falla(`https://${d} no responde (${raiz.error}). Si el DNS ya está bien, el certificado tarda unos minutos: vuelve a revisar.`)
  else if (raiz.status !== 200) falla(`https://${d} responde ${raiz.status}`)
  else {
    ok(`https://${d} con certificado`)
    const robots = raiz.headers.get('x-robots-tag') || ''
    if (/noindex/.test(robots)) falla(`El dominio lleva noindex (${robots}): Google no lo va a mostrar.`)
  }
  if (c.www !== false) {
    const www = await pedir(`https://www.${d}/`)
    const loc = www.headers?.get('location') || ''
    if (www.status >= 300 && www.status < 400 && loc.startsWith(`https://${d}`)) ok(`www.${d} → ${d}`)
    else falla(`https://www.${d} no redirige a ${d} (${www.error || www.status} ${loc}). ¿Publicaste después de agregar el dominio?`)
  }
  const http = await pedir(`http://${d}/`)
  const locHttp = http.headers?.get('location') || ''
  if (http.status >= 300 && http.status < 400 && locHttp.startsWith('https://')) ok('http → https')
  else falla(`http://${d} no lleva a https (${http.error || http.status})`)
  console.log(fallas ? `\n${fallas} cosa(s) por resolver.` : `\nEl dominio está listo: https://${d}`)
  process.exit(fallas ? 1 : 0)
}

// ---- add the domain ----------------------------------------------------------------------------
const d = dominioLimpio(a._[0])
if (!d || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) {
  no('Uso: node dominio.mjs <dominio>   (por ejemplo: node dominio.mjs midominio.com)')
  process.exit(1)
}
const est = leerEstado()
if (!est.direccion) {
  no('Primero publica el sitio (node publicar.mjs): el dominio se agrega a un proyecto que ya existe.')
  process.exit(1)
}
const nombres = c.www !== false ? [d, `www.${d}`] : [d]
for (const n of nombres) {
  const r = vercel(c, ['domains', 'add', n, c.proyecto], { cwd: ESPACIO })
  if (r.status === 0 || /already (assigned|added|exists)/i.test(r.salida)) ok(`${n} agregado al proyecto ${c.proyecto}`)
  else {
    no(`Vercel no aceptó ${n}:\n${r.salida.trim().slice(-800)}`)
    aviso('Si dice que ya está en otro proyecto o cuenta, quítalo de ahí primero (references/problemas.md).')
    process.exit(1)
  }
}
c.dominio = d
guardarConfig(c)
est.dominio = d
guardarEstado(est)

const p = await proveedor(d)
const A = await intentar(() => dns.resolve4(d))
const MX = await intentar(() => dns.resolveMx(d))
const TXT = await intentar(() => dns.resolveTxt(d))
console.log(`\nEl DNS de ${d} lo maneja: ${p.nombre}${p.ns.length ? ` (${p.ns.join(', ')})` : ''}`)
if (p.nombre === 'Vercel') console.log('Los nameservers ya son de Vercel: no hay registros que cambiar.')
else {
  console.log('\nRegistros que hay que poner (cambiar si ya existen, nunca duplicar):')
  console.log(`  Tipo A      Nombre @     Valor ${A_VERCEL}${A.length ? `   (hoy: ${A.join(', ')})` : ''}`)
  if (c.www !== false) console.log(`  Tipo CNAME  Nombre www   Valor ${CNAME_VERCEL}`)
  if (p.nombre === 'Cloudflare') console.log('  En Cloudflare, los dos en «DNS only» (nube gris), no «Proxied».')
  console.log('\nNo toques (son del correo, de GHL o de verificaciones):')
  console.log(`  - los MX${MX.length ? `: ${MX.map((m) => m.exchange).join(', ')}` : ''}`)
  console.log(`  - los TXT${TXT.length ? ` (${TXT.length}: SPF, DKIM, verificaciones…)` : ''}`)
  console.log('  - cualquier otro subdominio (link, mail, app, calendario…), sobre todo los CNAME que apuntan a GHL')
  console.log(`\nLos pasos en ${p.nombre}: references/dns-por-proveedor.md`)
}
console.log('\nSiguiente: publica otra vez (node publicar.mjs) para que el seguimiento envíe en el dominio,\ny cuando el alumno guarde los registros: node dominio.mjs --revisar')
