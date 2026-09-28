---
name: agregar-pagina
description: >
  Agrega páginas a un sitio que ya existe, hecho con scroll-craft, con la misma marca
  del home: contacto, nosotros, cada servicio, gracias o legales. Lee la guía de marca
  del sitio (MARCA.md, que crea la primera vez), comparte sitio.css, copia el menú y el
  pie, actualiza el menú de todas las páginas y revisa que la página nueva sea
  coherente con el home. Úsalo cuando el alumno diga "crea la página de contacto",
  "agrega una página de servicio", "hazme la página nosotros", "quiero otra página en
  mi sitio", "agrega el servicio de X a mi web" o "página de gracias".
---

# Agregar una página a un sitio

Un sitio de scroll-craft empieza con una sola página, su home. Este skill le agrega más
páginas sin romper su identidad. Todas quedan en la misma carpeta del sitio y después se
pasan juntas a AI Studio con `migrar-a-ai-studio`.

`<skill>` es la carpeta de este archivo (Claude Code la muestra como «Base directory for
this skill»).

## Cómo trabajar con el alumno

- **Estilo:** en español, con pasos cortos. No le propongas nombres ni diseños: la marca ya
  está decidida, y está en el home.
- **Carpeta:** siempre trabaja desde «Mis sitios». Si no sabes en qué sitio, lista los de
  `scrollcraft/builds/` y pregúntale cuál, en una sola pregunta.
- **Conversación:** una por página. En esta misma se itera esa página hasta que quede.

## Cómo queda el sitio

```
scrollcraft/builds/<sitio>/
  index.html               →  /                  el home (no se rediseña)
  nosotros.html            →  /nosotros
  contacto.html            →  /contacto
  servicios/<slug>.html    →  /servicios/<slug>
  sitio.css                   lo compartido: tokens --sc-*, fuentes, menú, pie, botones
  MARCA.md                    la guía de marca del sitio
  assets/                     las imágenes de todas las páginas
  scrollcraft.js / .css       el motor, uno para todo el sitio
  BRIEF.md                    el brief del home, más la lista de páginas
```

`sitio.css` y `MARCA.md` son **uno por sitio**, nunca uno por página.

## Flujo

### 1. Leer el sitio

Ubica el sitio y lee su `MARCA.md` (si ya existe), su `BRIEF.md` y su `index.html`. Si ya
hay otras páginas, léelas también, para no repetir su contenido.

### 2. Solo la primera vez que el sitio recibe una página

1. **`sitio.css`:** pasa del `<style>` del home a `sitio.css` lo que comparten todas las
   páginas:
   - el bloque `:root` con los tokens `--sc-*`;
   - las fuentes;
   - el encabezado y su menú, el pie y los botones (`.cta`).

   En el home, `sitio.css` se enlaza después de `scrollcraft.css` y **antes** de su
   `<style>`, y se borra del `<style>` lo que se movió. El home debe verse idéntico: lo
   confirmas en el paso 6.
2. **El menú:** agrégalo al encabezado del home, con su mismo estilo. Los enlaces van a los
   archivos `.html` (`contacto.html`, `servicios/web.html`): la migración los convierte en
   direcciones. En teléfono, el menú no puede tapar el contenido.
3. **El pie de página:** crea el de las páginas internas (una clase en `sitio.css`). El home
   conserva su cierre, que en scroll-craft no es un pie.
4. **`MARCA.md`:** créalo desde [templates/MARCA.md](templates/MARCA.md), llenando cada
   sección con lo que el home ya decidió:
   - los colores con su rol y las fuentes, tomados de `sitio.css`;
   - el tono y el público, del `BRIEF.md`;
   - el preámbulo de estilo de las imágenes, si el home se hizo con imágenes generadas
     (scroll-craft lo escribe en su flujo de assets).

   Dile al alumno que puede editarlo para agregar sus propias reglas.

### 3. La página nueva

Cada página nueva:

- carga `scrollcraft.css`, `sitio.css` y `scrollcraft.js`, con `../` desde `servicios/`;
- monta el motor: `ScrollCraft.mount(document.body)`;
- lleva el mismo `<head>` base: `lang`, viewport, icono y fuentes;
- tiene su **propio** `<title>` (30 a 60 caracteres) y su `<meta name="description">` (70 a
  160 caracteres), porque cada página se posiciona por separado.

**Página de servicio: experiencia completa de scroll-craft.** Corre el flujo entero de
scroll-craft para esta página, con su entrevista, sus assets y su verificación. Estas reglas
no cambian:

- **Marca fija:** `MARCA.md` es el «brand kit» que scroll-craft debe obedecer: colores,
  fuentes, tono, preámbulo de imágenes, menú y pie.
- **Registro de huellas:** el sitio es **una sola fila**. No registres la página como un
  build nuevo y no la compares contra el home. Sí busca su propio momento cumbre y su
  propio movimiento; lo que la hace distinta del home es la estructura, nunca la marca.
- **Ubicación:** vive en `servicios/<slug>.html`, con un slug en minúsculas y sin acentos.

**Contacto, nosotros, gracias o legales: páginas sencillas.** Hazle al alumno **una sola
pregunta**: «¿Qué quieres que diga esta página?». Luego escríbela con el piso de diseño de
scroll-craft (`references/taste.md`), sin sus reglas de experiencia:

- sin hero por capas ni momento cumbre, y con pie de página normal;
- secciones con `data-sc-act="flow"`, para que el motor y sus pruebas las reconozcan;
- nada de `data-sc-cue` fuera de un acto (quedaría invisible) y nada de `data-sc-in` en
  textos largos;
- los formularios son `<form>` normales, con `name` en cada campo; la migración los
  conecta al CRM, cada uno con su ID genérico, que es el nombre de la página.

### 4. Mantener el sitio coherente

- **Menú:** el mismo en todas las páginas, con rutas relativas a cada una (`../contacto.html`
  desde `servicios/`).
- **`BRIEF.md`:** agrega la página a su lista de páginas, con su propósito.

### 5. Probar la página

Con los scripts de scroll-craft, desde la carpeta del sitio:

```bash
node <scroll-craft>/scripts/serve.mjs --root . --port 4500 &
node <scroll-craft>/scripts/shoot.mjs --url http://localhost:4500/contacto.html --out lab/contacto/escritorio
node <scroll-craft>/scripts/shoot.mjs --url http://localhost:4500/contacto.html --out lab/contacto/telefono --width 390 --height 844
```

Usa una carpeta de salida por página y tamaño, y mira su `sheet.png`. `serve.mjs` no
entiende direcciones limpias: se prueba con `.html`.

### 6. Revisar la coherencia con el home

```bash
node <skill>/scripts/coherencia.mjs "scrollcraft/builds/<sitio>"
```

Compara cada página contra el home:

- sus tokens `--sc-*`;
- las fuentes que carga;
- el menú y sus destinos;
- el estilo del encabezado;
- el pie de página.

También lista los colores que el home no usa. Necesita `playwright-core`, que ya trae el
espacio de trabajo de la migración. Si todavía no existe, créalo con
`node <plugin>/skills/migrar-a-ai-studio/scripts/doctor.mjs --preparar "scrollcraft/builds/<sitio>-ai-studio"`.
Todo debe salir ✓ antes de entregar la página.

### 7. Entregar

- **Revisión:** dile al alumno dónde quedó la página y ofrécele verla en el navegador.
- **Si el sitio ya está en AI Studio:** que descargue el ZIP actual de su proyecto
  (**Code → Download Codebase**) y pida «pasa las páginas nuevas a AI Studio».
  `migrar-a-ai-studio` le arma un kit con **solo lo nuevo**.
- **Si todavía no lo migra:** las páginas nuevas se van con todo el sitio cuando pida
  «migra mi sitio a AI Studio».
