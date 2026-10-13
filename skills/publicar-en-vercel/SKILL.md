---
name: publicar-en-vercel
description: >
  Publica en Vercel, sin AI Studio, un sitio hecho con scroll-craft (una página o
  varias), con los formularios conectados a GoHighLevel igual que en AI Studio: cada
  formulario llega al CRM por External Tracking (completo y parcial), con la visita de
  página para que no se pierda el utm_campaign, los datos de Meta para la API de
  conversiones y los eventos de Tag Manager. Prepara una copia del sitio (el original no
  se toca), la prueba en Chrome sin mandar nada, la publica en <proyecto>.vercel.app,
  conecta el dominio del alumno con los registros DNS exactos de su proveedor y vuelve a
  publicar cuando hay cambios. Úsalo cuando el alumno diga "publica mi sitio en Vercel",
  "súbelo a Vercel", "quiero mi sitio sin AI Studio", "conecta mi dominio", "pon mi
  sitio en mi dominio", "publica los cambios" o "actualiza mi sitio en Vercel".
---

# Publicar un sitio en Vercel con GoHighLevel

Es el otro camino de publicación, además de `migrar-a-ai-studio`.

- **Cómo funciona:** el sitio se publica tal cual en Vercel, y un solo script,
  `seguimiento.js`, hace lo que en AI Studio hace su integración de formularios.
- **Lo que hace `seguimiento.js`:**
  - manda cada formulario a GHL;
  - manda la visita de página;
  - junta los datos de Meta para la API de conversiones;
  - manda los eventos de Tag Manager.
- **Antes de empezar la primera publicación de la sesión, lee:**
  - [references/ghl-y-seguimiento.md](references/ghl-y-seguimiento.md): qué se manda y qué
    falta comprobar;
  - [references/problemas.md](references/problemas.md): lo que ya pasó y cómo se resolvió.

`<skill>` es la carpeta de este archivo (Claude Code la muestra como «Base directory for
this skill»). Los scripts están en `<skill>/scripts/` y se corren **dentro del espacio de
publicación**.

## Cómo trabajar con el alumno

- Habla en español, en pasos cortos y concretos. El alumno sabe GoHighLevel, no
  necesariamente código ni terminal.
- Tú corres los scripts. El alumno solo hace lo que pasa en sus cuentas:
  - iniciar sesión en Vercel;
  - copiar datos de GHL;
  - cambiar el DNS;
  - revisar sus contactos.
- **Nunca entres a sus cuentas ni escribas sus contraseñas.** Le das el paso exacto, él lo
  hace y te dice «listo».
- Dile siempre dónde está cada cosa, con su ruta completa. En macOS ofrece abrir la
  carpeta con `open <carpeta>`.
- **El sitio original no se toca.** Todo se arma en una copia (`sitio/`). Si hace falta
  cambiar algo del sitio (un texto, un enlace legal, un formulario), propónselo y hazlo en
  el original solo con su sí. Así el sitio puede ir a AI Studio después, si cambia de
  camino.
- **Nunca digas que algo quedó si no lo comprobaste** con `probar.mjs`, `dominio.mjs
  --revisar` o lo que el alumno vio en GHL.

## AI Studio o Vercel

Si el alumno todavía no eligió, explícale la diferencia en dos líneas y que él decida:

| | AI Studio | Vercel |
|---|---|---|
| Dónde vive el sitio | Dentro de GoHighLevel | En Vercel, con su dominio |
| Cómo se sube | Pegando mensajes en el chat de AI Studio | Claude lo publica con un comando |
| Formularios al CRM | Integración de AI Studio | `seguimiento.js` (el mismo endpoint) |
| Cambios después | Otra ronda de mensajes en el chat | «Publica los cambios» |
| Costo | Incluido en su plan de GHL | Vercel Pro (ver abajo) |

**Vercel Hobby (gratis) es solo para uso personal y no comercial.** Un sitio de negocio va
en **Pro**. Díselo antes de empezar; no es decisión tuya.

## Flujo

### 1. Lo que hace falta

1. **El sitio.** Un build de scroll-craft: una carpeta con `index.html`, `scrollcraft.js`,
   `scrollcraft.css` y `assets/`, normalmente `<workspace>/builds/<nombre>/`.
   - Todas sus páginas se publican: `contacto.html` → `/contacto`,
     `servicios/web.html` → `/servicios/web`.
   - Si no sabes cuál es, lista `scrollcraft/builds/` y pregunta.
2. **Una cuenta de Vercel** (vercel.com, con su correo o con GitHub). GitHub no hace falta.
3. **Sus datos de GHL**, de la subcuenta del sitio. Dile dónde está cada uno:
   - **Location ID:**
     - *Settings → Business Profile*, arriba, con el botón de copiar;
     - o en la dirección del navegador dentro de la subcuenta: lo que va después de
       `/location/`.
   - **Tracking ID:** *Settings → External Tracking*. GHL muestra un
     `<script … data-tracking-id="tk_…">`.
     - Solo se copia el `tk_…`.
     - **El script no se pega en el sitio:** mandaría cada formulario dos veces.
   - **Tag Manager** (opcional): el ID del contenedor, `GTM-XXXXXXX`, de
     tagmanager.google.com. Si no tiene, el sitio funciona igual y se agrega después.
4. **Su dominio** (opcional al principio). Se conecta al final, con el sitio ya probado.

### 2. El espacio de publicación

Va junto al sitio, en `<workspace>/builds/<nombre>-vercel/`:

```bash
node <skill>/scripts/doctor.mjs --preparar "<builds>/<nombre>-vercel"
cd "<builds>/<nombre>-vercel"
node <skill>/scripts/preparar.mjs --sitio "../<nombre>" [--proyecto <nombre-en-vercel>]
```

`preparar.mjs` crea `config.json` con todas las páginas y formularios que encuentra, y se
detiene. Adentro del espacio quedan:

| | |
|---|---|
| `config.json` | los datos de esta publicación (ver [config.json](#configjson)) |
| `sitio/` | la copia que recibe Vercel; se rehace en cada publicación. No se edita a mano |
| `extras/` | opcional: archivos que se ponen encima del sitio (`llms.txt`, `og.jpg`, un `robots.txt` propio…) |
| `estado.json` | la dirección publicada, el dominio y la fecha |

### 3. Los formularios

Muéstrale la lista que imprimió `preparar.mjs` y hazle **una sola pregunta**:

> Tus formularios se llamarán `registro` (inicio) y `cotizacion` (cotización). ¿Quieres
> otro nombre para alguno?

- **Si el sitio ya estuvo en AI Studio** o ya tenía formularios conectados a GHL, usa
  **los mismos form IDs**: sus workflows siguen funcionando sin tocarlos.
- **Nada de «landing», «nueva», versiones ni fechas.** El ID debe servir aunque rehaga la
  página.
- **Cada formulario con correo o teléfono** se conecta, con su parcial (`<id>-parcial`).
  - Si no quiere el parcial: `"parcial": false`.
  - Los que no tienen correo ni teléfono (calculadoras, formularios que arman un mensaje de
    WhatsApp) no crean contacto. Explícaselo.
- **Al enviar:**
  - si el sitio ya maneja el envío con su propio código, ese código sigue mandando y el
    script solo manda a GHL;
  - si no, el formulario va a su `destino` (por ejemplo `/gracias`) o se queda con un
    «¡Gracias!»;
  - para otro texto de gracias: `"gracias": "…"`.
- **Un formulario dentro de un panel o diálogo** que `probar.mjs` no puede abrir solo
  necesita `"abrir": "<selector del botón>"`.
- Pon en `config.json` lo que decida, su Location ID, su Tracking ID y su Tag Manager.

### 4. Preparar y probar, sin publicar

```bash
node <skill>/scripts/probar.mjs --detalle
```

`probar.mjs` corre `preparar.mjs` y prueba la copia en un servidor local que se porta como
Vercel. Nada sale de la computadora.

- **Cada página**, en Chrome a 1440×900 y a 390×664 (un iPhone con las barras de Safari):
  - errores;
  - archivos que no cargan;
  - enlaces y anclas rotos;
  - íconos que faltan;
  - la página que se mueve de lado en el teléfono;
  - la 404.
- **Cada formulario**, abierto con UTM y `?seguimiento=1`:
  - lo llena, sale del correo y lo envía;
  - revisa la visita con UTM, el parcial y el completo con la misma sesión;
  - revisa el `utm_campaign`, `meta_fbp` y `meta_fbc`, y el mismo `event_id` del Lead en
    GHL y en Tag Manager;
  - revisa el Tracking ID y el Location ID.
  - Con `--detalle` imprime lo que llegaría a GHL, campo por campo: enséñaselo al alumno.

`preparar.mjs` también avisa de los enlaces legales que no llevan a ningún lado (por
ejemplo «Aviso de privacidad» con `href="#"`). Ofrécele hacer la página con
`agregar-pagina` antes de publicar.

Corrige lo que salga (en el sitio original, con su permiso) y vuelve a probar hasta que
diga «Todo bien».

### 5. Vercel: iniciar sesión

`doctor.mjs` dice si ya hay sesión. Si no hay:

1. Corre `npx --yes vercel@latest login` en segundo plano.
2. La CLI imprime una dirección (y a veces un código). Dásela al alumno: él la abre, entra
   con su cuenta y aprueba.
3. Cuando el comando termine, `doctor.mjs` otra vez.

- **Si tiene varios equipos en Vercel**, pregúntale en cuál va el sitio y ponlo en
  `"equipo"`.
- **Pregúntale el nombre del proyecto** si no le gusta el del sitio (`"proyecto"`: letras
  minúsculas, números y guiones). Después de la primera publicación ya no se cambia.

### 6. Publicar y probar en vivo

```bash
node <skill>/scripts/publicar.mjs
node <skill>/scripts/probar.mjs --url <la dirección que imprimió>
```

- **La primera vez** crea el proyecto y enlaza `sitio/`.
- **Publica en producción:** la dirección `<proyecto>.vercel.app` (o
  `<proyecto>-algo.vercel.app` si el nombre estaba tomado) es pública y lleva `noindex`, así
  que Google no la muestra.
- **Ahí el seguimiento está apagado**, salvo con `?seguimiento=1`.
- **Dale la dirección al alumno** para que la vea en su teléfono.
- `--prueba` publica una vista que solo se ve con sesión de Vercel. Casi nunca hace falta.

### 7. El lead real de prueba, con su permiso

Un lead real crea un contacto y dispara sus workflows. **Pregúntale antes.** Lo envía él,
con su correo, desde:

```
<dirección>/<página>?seguimiento=1&utm_source=prueba&utm_medium=prueba&utm_campaign=prueba&utm_content=prueba&fbclid=PRUEBA
```

Si te pide que lo llenes tú en el navegador, usa los datos que él te dé para esa prueba.
Luego que revise en GHL:

1. **Contactos:** el contacto con nombre, correo y teléfono.
2. **Atribución del contacto:** *First Session Attribution*, con source, medium, **campaign**
   y content en `prueba`.
3. **Sus campos:**
   - META EVENT IDS, META FBP y META FBC, si los tiene;
   - si un campo personalizado no se llenó, pídele su ID y ponlo en `campos`
     ([references/ghl-y-seguimiento.md](references/ghl-y-seguimiento.md#los-campos)).
4. ***Sites › Forms › Submissions › External Forms*:** los dos form IDs (completo y
   parcial). Solo aparecen después de este primer envío.
5. **Workflows:**
   - el disparador «External Tracking Event», filtrado por cada form ID;
   - después, otro lead para ver que corran.

Anota en `references/ghl-y-seguimiento.md` lo que se confirme (los «Por confirmar»).

### 8. El dominio

Solo con el sitio ya probado:

```bash
node <skill>/scripts/dominio.mjs <dominio>
```

- **Agrega el dominio y `www` al proyecto**, lo guarda en `config.json` y detecta quién
  maneja su DNS.
- **Imprime los dos registros que hay que cambiar** y los que no se tocan: MX, TXT y los
  subdominios de GHL como `link`.
- **Dale los pasos de su proveedor** de [references/dns-por-proveedor.md](references/dns-por-proveedor.md),
  uno por uno, y pídele una captura de sus registros antes de cambiar nada.

Después:

```bash
node <skill>/scripts/publicar.mjs                     # canonical, sitemap, www → dominio y seguimiento en el dominio
node <skill>/scripts/dominio.mjs --revisar             # cuando él diga que guardó los registros
node <skill>/scripts/probar.mjs --url https://<dominio>
```

- **Si `--revisar` falla** por propagación o certificado, espera unos minutos y repite.
- **Al final, otro lead real desde el dominio**, sin `?seguimiento=1` y con su permiso.

### 9. Publicar cambios

Cuando diga «publica los cambios» (o después de `agregar-pagina`):

```bash
cd "<builds>/<nombre>-vercel"
node <skill>/scripts/probar.mjs
node <skill>/scripts/publicar.mjs
node <skill>/scripts/probar.mjs --url <dominio o dirección de Vercel>
```

- **Un formulario nuevo:** `preparar.mjs` lo agrega a `config.json` con un form ID y lo
  avisa. Confírmalo con el alumno.
- **Si el formulario es nuevo, que envíe uno real** para que aparezca en *External Forms* y
  en sus workflows.

## config.json

| Clave | Qué es |
|---|---|
| `sitio` | la carpeta del sitio original (relativa al espacio) |
| `proyecto` | el nombre del proyecto en Vercel |
| `equipo` | el equipo de Vercel, si tiene varios (vacío: el personal) |
| `dominio` | el dominio sin `www` ni `https://`; vacío hasta el paso 8 |
| `www` | `true`: `www.<dominio>` también se agrega y redirige al dominio |
| `dominiosExtra` | otros dominios donde también debe enviar (raro) |
| `ghl.locationId`, `ghl.trackingId` | de la subcuenta (paso 1) |
| `gtm` | `GTM-XXXXXXX`, o vacío |
| `gtmRetraso` | milisegundos antes de cargar Tag Manager sin interacción (8000) |
| `telefono` | `prefijo` del país (`52`) y `digitos` del número local (`10`) |
| `formularios[]` | uno por `<form>`, ver abajo |
| `campos` | `{"clave del formulario": "ID del campo personalizado en GHL"}` |
| `redirecciones[]` | `{"desde": "/viejo", "hacia": "/nuevo"}`: las direcciones de su sitio anterior |
| `excluir[]` | archivos o carpetas del sitio que no se publican, además de los que nunca se publican: `insumos/`, `materiales/`, `lab/`, `out/`, `prompts/`, `tools/`, notas `.md` y paquetes |

Los campos de cada formulario:

| Campo | Qué es |
|---|---|
| `pagina`, `indice` | dónde está: el archivo y su número dentro de la página (desde 0) |
| `id` | el `id` del `<form>` cuando se encontró, para avisar si cambia |
| `formId`, `nombre` | su ID en GHL y Tag Manager, y su nombre en el CRM |
| `incluir` | si se conecta |
| `parcial` | si manda `<id>-parcial` |
| `destino`, `gracias` | a dónde va o qué dice al enviar, si el sitio no lo maneja |
| `abrir` | el selector del botón que lo muestra, para las pruebas |
| `modo` | `"manual"`: el código del sitio llama `window.Seguimiento.enviar(form)` |

**Las direcciones de su sitio anterior:** si tenía otro sitio en el dominio, pregúntale qué
páginas tenía (o revísalas tú en el sitio actual) y agrega una redirección por cada una que
cambie de dirección. Así no pierde lo que Google ya conoce ni los enlaces de sus anuncios.

## Si cambia de camino

- **De Vercel a AI Studio:** el sitio original está intacto. Usa `migrar-a-ai-studio` con
  **los mismos form IDs**. El dominio se mueve a AI Studio después, con sus pasos.
- **De AI Studio a Vercel:** empieza en el paso 1 con los form IDs que ya usaba en AI Studio.
  Las direcciones de sus páginas siguen iguales, así que no hacen falta redirecciones.
