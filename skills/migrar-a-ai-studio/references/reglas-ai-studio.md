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
| Responde «Listo» aunque haya hecho algo distinto. | Verificar con `verificar-lineas.md` durante el proceso y con el ZIP al final (`kit.mjs --comparar`). |

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

## Los scripts de la página

| Regla | Remedio |
|---|---|
| En AI Studio la página es una app: su HTML llega del servidor y los scripts propios corren después de montar el motor, cuando `DOMContentLoaded` y `load` ya pasaron. Un `addEventListener('DOMContentLoaded', …)` nunca correría. | `Pagina.tsx` llama esas funciones en cuanto se registran (como `$(fn)` de jQuery). La página de prueba lo comprueba. |
| Un `<script type="application/ld+json">` (datos, no código) no se puede ejecutar. | Va al `<head>` con su `type`. |

## Imágenes y videos

| Regla | Remedio |
|---|---|
| El chat acepta **máximo 5 adjuntos por mensaje**. | Grupos de 5, cada uno en su carpeta (`imagenes/grupo-N/`), con los videos en grupos aparte. Cada grupo llena solo sus claves de `image-urls.ts`, y un mensaje final muestra el archivo completo para revisar. |
| Las imágenes subidas se alojan en `https://vibe.filesafe.space/<id>/attachments/<uuid>.<ext>`, con `Access-Control-Allow-Origin: *`, rangos de bytes y caché de un año. | Sirven para `<img>` y para el `fetch()` del motor de scroll. Al final se descarga cada URL y se compara byte por byte con la local. |
| JPG y PNG se aceptan. AVIF y WebP no se probaron; MP4 tampoco. | Si un formato no se acepta, convertirlo a JPG/PNG. Para MP4 (scrub): probar en la primera migración; si no se acepta, subirlo a la Media Library de GHL y pegar la URL, o dejar el poster fijo avisando qué efecto se pierde. |
| Los nombres de archivo son lo único que el chat usa para saber qué URL va en qué clave. | No renombrar las imágenes; las claves del mapa son el nombre de archivo completo. |

## Formularios (los nativos de AI Studio)

| Regla | Remedio |
|---|---|
| El formulario se conecta con «Connect forms to my CRM» (o el botón **Connect** del chat). AI Studio genera `src/lib/tracking.ts` con `postTrackingEvent()` y las constantes `TRACKING_ID`, `LOCATION_ID`, `MEDIUM_ID`, `FORM_ID` y `CONTACT_SOURCE`. | La página manda el contacto por un solo punto (`lead.ts` → `sendLeadToCrm`). En el kit esa función va vacía, y el último mensaje le pide a AI Studio que la conecte **solo ahí**. |
| El envío es un `external form_submission` a `backend.leadconnectorhq.com/external-tracking/events`, y `postTrackingEvent` no devuelve promesa. | Antes de salir de la página, el diálogo espera mínimo 1 s (y máximo 1.8 s) a que salgan GTM y el CRM. |
| Las respuestas llegan a Contactos, a *Sites › Forms › Submissions › External Forms* y a los disparadores de workflow «AI Studio Form Submitted» / «External Tracking Event», que se pueden filtrar por proyecto, formulario, ruta y dominio. | Darle al formulario un nombre descriptivo y un `FORM_ID` propio. Revisar que los workflows del alumno incluyan el formulario nuevo en su filtro. |
| `window.open` después de una espera lo bloquea Safari (solo deja pasar popups dentro de ~1 s del toque). | Redirigir en la misma pestaña con `location.assign()` después del envío. |

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
