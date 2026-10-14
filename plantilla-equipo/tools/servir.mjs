#!/usr/bin/env node
// Servidor local para ver el sitio en el panel de Claude Code.
// Uso: node tools/servir.mjs [puerto]   (por defecto 4550)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = Number(process.argv[2]) || 4550;
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(raiz, path.normalize(ruta));
  if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No existe: ' + ruta); return;
  }
  const tam = fs.statSync(archivo).size;
  const tipo = tipos[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
  const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (rango) {
    // Safari pide los videos por partes.
    const ini = rango[1] ? Number(rango[1]) : 0;
    const fin = rango[2] ? Number(rango[2]) : tam - 1;
    res.writeHead(206, { 'Content-Type': tipo, 'Content-Range': `bytes ${ini}-${fin}/${tam}`, 'Accept-Ranges': 'bytes', 'Content-Length': fin - ini + 1, 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo, { start: ini, end: fin }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': tam, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  fs.createReadStream(archivo).pipe(res);
}).listen(puerto, '127.0.0.1', () => console.log(`Sitio en http://localhost:${puerto}`));
