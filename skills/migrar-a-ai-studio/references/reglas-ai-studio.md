# Reglas de GoHighLevel AI Studio (aprendidas migrando un sitio real)

Todo lo de esta página se comprobó migrando la landing de HighLevel Studio a un proyecto
nuevo de AI Studio (septiembre de 2026). Cada regla trae su remedio, y el kit ya lo
aplica. Si AI Studio cambia y una regla deja de ser cierta, actualízala aquí.

## El transporte

| Regla | Remedio |
|---|---|
| AI Studio **no importa ZIP**, solo lo exporta (Code → Download Codebase, o Project Settings → Download Codebase). | El código entra por el chat (o, si el alumno tiene el botón **Code**, pegándolo en su editor). El ZIP se usa solo para leer la plantilla y para verificar al final. |
| La integración con GitHub aparecía como «planned», pero el `AGENTS.md` de la plantilla ya dice que los commits a la rama conectada se sincronizan con AI Studio. | Si el alumno ve una opción de GitHub o Git en su proyecto, esa vía es más exacta que el chat: avísale y usa `kit/archivos/`. |
| AI Studio compila solo cada vez que cambia un archivo. | No hace falta pedir «compila». La vista previa ya refleja el código… |
| …pero la URL pública `…vibepreview.app` puede quedarse en la última versión publicada. | Después de cambios importantes (sobre todo al conectar el formulario), pedir al alumno que vuelva a publicar (Publish / Update) antes de probar la URL. |

## Cómo se comporta su chat

| Regla | Remedio |
|---|---|
| Procesa bien **un archivo por mensaje**. Con varios archivos en un mensaje, crea el primero y dice que «faltan» los demás (pasó dos veces). | Un archivo (o una parte) por mensaje, siempre. Nunca agrupar. |
| Rechaza archivos de componente de más de ~450–700 líneas («divídelo en módulos más pequeños»). Aceptó un `.tsx` de 450 líneas y rechazó uno de ~700. | Ningún archivo pasa de ~350 líneas. Las partes de un archivo grande se envían por separado y se agregan al final. |
| Mensajes de ~12 KB pasan sin problema. | Límite del kit: 12 KB por mensaje. |
| Cuando falta un archivo que otro importa, **intenta arreglar el build por su cuenta**: reescribe archivos, inventa implementaciones, cambia títulos, agrega elementos que no estaban. | Orden de envío: primero las dependencias; las rutas y el root **al final**, para que nada se compile a medias. El mensaje de reglas le prohíbe implementar o borrar archivos por su cuenta. Si ofrece «impleméntalos tú», la respuesta es siempre «te los paso ahora». |
| Al crear una ruta nueva, TypeScript marca un error unos segundos (`not assignable to parameter of type "/"`) hasta que `routeTree.gen.ts` se regenera. El chat **borró la ruta** para «arreglarlo». | Usar solo `/` (la ruta que ya trae la plantilla). Si hace falta otra ruta, el mensaje avisa que ese error es normal y prohíbe borrarla. |
| Reformatea con su Prettier el CSS y el JS (el CSS compacto pasó de 1,043 a 2,760 líneas). | Normal e inofensivo. El kit entrega el TypeScript ya formateado con el `.prettierrc` de la plantilla, y la comparación final ignora el formato. El conteo de líneas de esos archivos no se usa para verificar. |
| Responde «Listo» aunque haya hecho algo distinto. **También responde «Listo» sin crear el archivo** (29 de septiembre de 2026: 39 de 85 archivos no existían en el ZIP, y 5 más en la segunda pasada). | Verificar con `verificar-lineas.md` cada 15 mensajes, no solo al final, y con el ZIP (`kit.mjs --comparar`). Pedirle en cada mensaje que copie la primera línea del archivo tal como quedó (la última en las partes que se agregan): si no coincide, no lo creó. |
| Cuando la compilación falla a medias, ofrece «Try to fix» y el chat cambia archivos por su cuenta (cambió textos de una página que no se le mandó). | Decirle al alumno que **nunca** pulse «Try to fix»: los errores a medias son normales hasta el último archivo. |

## Copiar los mensajes (del lado de Claude)

| Regla | Remedio |
|---|---|
| En macOS, `pbcopy` sin `LANG` copia el texto como MacRoman: al pegarlo, cada `·`, acento, `ñ` y `¿` llega dañado (`·` → `¬∑`, «Política» → «Pol√≠tica»), dentro del código. | Copiar siempre con `LANG=en_US.UTF-8 pbcopy < mensaje.md` (fuera del sandbox) y comprobar con `LANG=en_US.UTF-8 pbpaste \| cmp - mensaje.md` antes de decirle al alumno que pegue. |

## La plantilla de un proyecto nuevo (`.vibe/project.json` → `tanstack_start_ts`)

| Regla | Remedio |
|---|---|
| TanStack Start 1.168, React 19.2, Tailwind 4.2, Vite 8, build con `@leadconnector/vite-tanstack-config` (worker de Cloudflare por medio de nitro), gestor `bun`. | El kit genera exactamente eso. Para validar en local: `npm install --legacy-peer-deps` (npm es más estricto que bun con las dependencias entre pares). |
| Alias `@/*` → `src/*`. | Imports con `@/` o relativos. |
| `tsconfig` estricto: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noImplicitOverride`. | El código del kit pasa ese `tsconfig`. Detalles: `dataset['x']` con corchetes; accesos a arreglos con respaldo (`arr[i] ?? 0`); variables de entorno declaradas en `ImportMetaEnv`. |
| `.prettierrc`: `printWidth 100`, `semi`, comillas dobles, `trailingComma all`. | El kit formatea el TypeScript con esa configuración (la lee del ZIP). |
| El root (`src/routes/__root.tsx`) trae `lang="en"`, `QueryClientProvider` y reporte de errores a AI Studio. **Cambia entre versiones de la plantilla** (una traía toasters y tooltips, la siguiente no). | Nunca suponer el root: se lee del ZIP en blanco y solo se le cambian `lang` y `viewport-fit`. Todo lo demás de la página va en su ruta. |
| `src/styles.css` trae Tailwind 4 con su **preflight** y el tema de la plantilla en `@layer base`: quita los márgenes de `p` y `figure`, las viñetas de las listas y la negrita de `h3`, pone `img` y `video` en `display: block` y cambia el `line-height`. En una página de scroll-craft eso movió un acto 64 px y cambió un 10 % de la pantalla. (En la landing de HighLevel Studio no se notó porque estaba hecha sobre Tailwind.) | La página convertida trae su CSS en el `<head>` de su ruta, después de la del motor, más una regla que deshace esa capa solo en esa ruta: `@layer base { html, html *, … { all: revert-layer; } }`. Comprobado: 75/75 elementos con la misma caja y estilos, y 0.0 % de píxeles distintos. |
| Tailwind escanea `src/` en busca de clases, así que las palabras del HTML y del CSS de la página generan utilidades (`.container`, `.hidden`, `.grid`…). | Solo afectan a elementos con esa clase, y solo en propiedades que la página no fija (la hoja de la página va fuera de capa y gana). `validar.mjs` compara cada elemento con el original y lo detectaría. |
| El `index.tsx` de la plantilla no trae `head()`, para que AI Studio inyecte su captura como imagen para redes. | Si la página original tenía `og:image`, la ruta la declara (con su URL de AI Studio). Si no, se deja que AI Studio ponga la suya. |
| `src/routes/index.tsx` trae un marcador `data-vibe-blank-page-placeholder`. | La ruta `/` del kit lo reemplaza completo. |

## Sitios de varias páginas

| Regla | Remedio |
|---|---|
| Un dominio apunta a **un solo proyecto** de AI Studio, que no reparte rutas entre proyectos. | Todo el sitio vive en un proyecto: cada página es una ruta (`src/routes/contacto.tsx` → `/contacto`). |
| El chat de AI Studio crea páginas si se le pide, pero con su propio diseño. | Las páginas entran como archivos exactos, igual que el home, para que conserven la marca del sitio. |
| En TanStack, `servicios.tsx` es el *layout* de `servicios/web.tsx`: sin `<Outlet />`, taparía la página hija. | Una página que tiene hijas va en `servicios/index.tsx` (ruta `/servicios/`). El convertidor lo hace solo. |
| El selector de páginas del editor navega dentro de la app, sin recargar. | `Pagina.tsx` monta el motor de scroll una vez por cada página que entra en pantalla. |
| Una ruta nueva marca un error de TypeScript unos segundos, hasta que se regenera `routeTree.gen.ts`. | El mensaje de cada ruta nueva avisa que es normal y prohíbe borrarla. |
| Al actualizar un sitio, reenviar todo cuesta muchos mensajes y arriesga lo que ya funciona (las URLs de las imágenes, la conexión al CRM). | `kit.mjs --desde <ZIP actual>` manda solo lo nuevo o cambiado: conserva las URLs y nunca reenvía un `lead.ts` conectado. |
| Cada formulario del sitio necesita su propio form ID. | `sendLeadToCrm(campos, formId)` recibe el de cada formulario. Si la conexión existente usaba uno fijo, el kit incremental pide actualizarla. |

## Los scripts de la página

| Regla | Remedio |
|---|---|
| En AI Studio la página es una app: su HTML llega del servidor y los scripts propios corren después de montar el motor, cuando `DOMContentLoaded` y `load` ya pasaron. Un `addEventListener('DOMContentLoaded', …)` nunca correría. | `Pagina.tsx` llama esas funciones en cuanto se registran (como `$(fn)` de jQuery). La página de prueba lo comprueba. |
| Un `<script type="application/ld+json">` (datos, no código) no se puede ejecutar. | Va al `<head>` con su `type`. |

## Imágenes y videos

| Regla | Remedio |
|---|---|
| El chat acepta **máximo 5 adjuntos por mensaje**. | Grupos de 5 imágenes, cada uno en su carpeta (`imagenes/grupo-N/`). Cada grupo llena solo sus claves de `image-urls.ts`, y un mensaje final muestra el archivo completo para revisar. |
| Las imágenes subidas se alojan en `https://vibe.filesafe.space/<id>/attachments/<uuid>.<ext>`, con `Access-Control-Allow-Origin: *`, rangos de bytes y caché de un año. | Sirven para `<img>` y para el `fetch()` del motor de scroll. Al final se descarga cada URL y se compara byte por byte con la local. |
| JPG y PNG se aceptan. AVIF y WebP no se probaron. | Si un formato no se acepta, convertirlo a JPG/PNG. |
| **El chat NO acepta MP4** (comprobado el 29 de septiembre de 2026, con los videos del Home de HighLevel Studio). | **Los videos van siempre por la Media Storage de GoHighLevel** (Sites › Media Storage), nunca como adjunto del chat. El alumno los sube sin cambiarles el nombre y te da el enlace público de cada uno; `kit/videos/` los trae y el mensaje `NN-videos-media-storage.md` pone esas URL en sus claves (reemplaza cada `PEGA_AQUI_LA_URL_DE_…` antes de dárselo). |
| Media Storage sirve el MP4 en `https://assets.cdn.filesafe.space/<location>/media/<id>.mp4` con `Access-Control-Allow-Origin: *`, rangos de bytes (206) y caché de un año, byte por byte igual al subido. | Sirve para el `fetch()` del scrub del motor. Antes de dar el mensaje, compruébalo con cada enlace: `curl -s <url> \| shasum -a 256` igual al archivo local, `curl -sI -H "Origin: https://<dominio>" <url>` con `access-control-allow-origin`, y `curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-99" <url>` = 206. Los nombres de Media Storage no dicen cuál es cuál: identifícalos por el `shasum`. |
| Los nombres de archivo son lo único que el chat usa para saber qué URL va en qué clave. | No renombrar las imágenes; las claves del mapa son el nombre de archivo completo. |

## Formularios (los nativos de AI Studio)

| Regla | Remedio |
|---|---|
| El formulario se conecta con «Connect forms to my CRM» (o el botón **Connect** del chat). AI Studio genera `src/lib/tracking.ts` con `postTrackingEvent()` y las constantes `TRACKING_ID`, `LOCATION_ID`, `MEDIUM_ID`, `FORM_ID` y `CONTACT_SOURCE`. | La página manda el contacto por un solo punto (`lead.ts` → `sendLeadToCrm`). En el kit esa función va vacía, y el último mensaje le pide a AI Studio que la conecte **solo ahí**. |
| El envío es un `external form_submission` a `backend.leadconnectorhq.com/external-tracking/events`, y `postTrackingEvent` no devuelve promesa. | Antes de salir de la página, el diálogo espera mínimo 1 s (y máximo 1.8 s) a que salgan GTM y el CRM. |
| Las respuestas llegan a Contactos, a *Sites › Forms › Submissions › External Forms* y a los disparadores de workflow «AI Studio Form Submitted» / «External Tracking Event», que se pueden filtrar por proyecto, formulario, ruta y dominio. | Un solo ID para el formulario, que también es su nombre en el CRM, la fuente y el medio: el genérico `registro`, o el que el alumno pida. **Evergreen**: sin «landing», «nueva», versiones ni fechas. Revisar que los workflows del alumno incluyan el formulario en su filtro. |
| `window.open` después de una espera lo bloquea Safari (solo deja pasar popups dentro de ~1 s del toque). | Redirigir en la misma pestaña con `location.assign()` después del envío. |

## SEO

| Regla | Remedio |
|---|---|
| El root de la plantilla declara `author` «AI Studio», `og:title` «AI Studio App» y «AI Studio Generated Project» como descripción. Una página que no declara los suyos los hereda, y Google y las redes los muestran. | La ruta declara siempre sus propios metadatos: autor, descripción, `og:*` y `twitter:*`. Una etiqueta de la ruta gana a la del root con el mismo `name` o `property`. |
| El `public/robots.txt` de la plantilla permite todo, pero no anuncia un sitemap. No trae `sitemap.xml` ni URL canónica. | El SEO final, con el dominio, agrega la URL canónica, `og:url`, datos estructurados, `robots.txt` con `Sitemap:` y `sitemap.xml`. |
| Cuando el dominio queda como URL principal, `…vibepreview.app` redirige a él con un 301, así que no hay contenido duplicado. | `probar-preview.mjs` sigue la redirección y revisa el SEO en el dominio. |
| Al mover un dominio que ya tenía otro proyecto, sus rutas viejas dan 404. En HighLevel Studio, `/nueva-version` y otras dos quedaron así. | Preguntar las rutas viejas y redirigirlas a `/` con un 301. |
| La página llega armada desde el servidor (SSR de TanStack Start), con todo el texto en el HTML. | Bien para buscadores: no hay que hacer nada. `validar.mjs` lo comprueba. |

## Probar sin crear contactos

- En la vista previa (`…vibepreview.app`), el formulario conectado **sí envía** al CRM:
  AI Studio no filtra por dominio. Las pruebas automáticas interceptan y abortan esa
  petición. El lead real de prueba lo hace el alumno, con su correo.
- GTM solo debe cargar en el dominio definitivo, para que la vista previa no ensucie la
  analítica.
- Publicar importa: el 27 de septiembre de 2026, la vista previa de la landing de HighLevel
  Studio seguía con la versión anterior al formulario conectado (el evento de GTM aún
  decía `landing_hls_30d` y no salía ninguna petición al CRM). `probar-preview.mjs` lo
  detecta.
