# GHL, Tag Manager y Meta: lo que manda el sitio

Qué hace `templates/seguimiento.js`, qué está comprobado y qué falta comprobar. Si algo de
GHL cambia y una regla deja de ser cierta, actualízala aquí y en el script.

## El endpoint

Todo va a `https://backend.leadconnectorhq.com/external-tracking/events`, el mismo que usan
los formularios de AI Studio y el script oficial de External Tracking:

- `POST` con `FormData`. El campo `event` lleva el JSON del evento.
- Encabezado `version: 2021-07-28` y `keepalive: true`, para que el envío siga aunque el
  visitante cambie de página.
- Sin respuesta útil: el sitio nunca espera a GHL más de 1.8 s ni se traba si falla.

**No se pega el script oficial** (`link.msgsndr.com/js/external-tracking.js`). Se salta
los campos ocultos e invisibles, no deja mandar datos extra y no se puede apagar por
formulario: con el nuestro, cada formulario llegaría dos veces.

## Los eventos

| Cuándo | `type` | `formId` | Lleva |
|---|---|---|---|
| Al cargar cada página | `external_script_page_view` | — | `url` completa (con UTM), `referrer`, `title`, `path`, `sessionId` |
| Al salir del correo o del teléfono ya válido, una vez | `external_form_submission` | `<id>-parcial` | los campos llenos hasta ahí |
| Al enviar, si el correo o el teléfono es válido | `external_form_submission` | `<id>` | todos los campos |

Todos llevan `trackingId`, `locationId`, `userAgent` y el mismo `sessionId`. El
`sessionId` dura lo que la pestaña (`sessionStorage`).

**La visita es obligatoria.** GHL arma la *First Session Attribution* del contacto desde
la visita de la sesión. Si solo llega el registro, GHL rescata de la URL el source, el
medium y el content, pero **nunca el `utm_campaign`**. Se comprobó el 11 de octubre de 2026
en HighLevel Studio con 8 leads. Por eso la visita y el registro comparten `sessionId`.

**Los registros llevan:**

- `pageUrl` en el primer nivel (sin él, GHL responde «pageUrl is required»);
- en `properties`: `source: "vercel"`, `formName`, `contactSource` y `mediumId`, estos dos
  con el form ID.

No se mandan `projectId` ni `source: "ai_studio"`: son de AI Studio.

## Los campos

`seguimiento.js` reconoce los campos por su `name`, su `type` o su `autocomplete`, y los
manda con la clave estándar de GHL:

| Clave | Reconoce |
|---|---|
| `email` | `email`, `correo`, `mail`, `type="email"` |
| `phone` | `phone`, `tel`, `telefono`, `celular`, `whatsapp`, `type="tel"` |
| `first_name` / `last_name` | `nombre`, `name`, `nombre_completo` / `apellido`. Un nombre con espacios se parte: la primera palabra es el nombre y el resto, el apellido |
| `organization` | `empresa`, `company`, `negocio` |
| `city` | `ciudad`, `city` |
| `message` | `mensaje`, `comentarios`, `notas` |

- **El teléfono** sale en formato internacional. Con `telefono.prefijo` `52` y
  `telefono.digitos` 10, `999 123 4567` se manda como `+529991234567`. Si escriben `+…`, se
  respeta.
- **Los demás campos** van con su propio `name` y su etiqueta (el texto de su `<label>`).
  Esto también vale para las respuestas de botones, los radios y los campos ocultos.
- **Se agregan solos:**
  - los UTM con que llegó a la pestaña;
  - `meta_event_ids`, `meta_fbp`, `meta_fbc` y `meta_user_agent`;
  - `first_google_click_id`, `first_google_gbraid` y `first_google_wbraid`;
  - `pagina`, la ruta de la página.
- **Para guardar un campo en un campo personalizado del contacto**, ponlo en `campos` de
  `config.json` con el ID del campo en GHL: `"meta_fbp": "XxFteKqGb4BLiUFt0jr1"`. El ID sale
  en *Settings → Custom Fields*: abre el campo y copia su ID, o pídele al alumno el «Unique
  Key» y búscalo.
- **Por confirmar con el segundo sitio:**
  - si GHL escribe un campo personalizado cuando llega por su clave (`meta_fbp`) y no por su ID.
    En el piloto de Zynapze todo fue por ID, y así funcionó. En HighLevel Studio, con AI
    Studio, los META van por clave;
  - con un lead real, revisa qué campos llenó GHL y anótalo aquí.

## Tag Manager

Si el alumno tiene contenedor (`gtm` en `config.json`), `seguimiento.js` lo carga con la
primera interacción (mover, tocar, deslizar, una tecla) o a los 8 s de cargar.

- Cargarlo antes bajaba PageSpeed: GA4, el pixel y Clarity ocupaban el procesador justo
  mientras se medía.
- Los eventos de antes esperan en `dataLayer`.
- En la dirección `.vercel.app` y en local, Tag Manager no carga sin `?seguimiento=1`.

**Los eventos:** un solo nombre, `conversion`, con `event_name`. Es el mismo contrato que el
manual de AI Studio y el piloto de Zynapze.

| `event_name` | Cuándo | `form_id` |
|---|---|---|
| `FormStart` | la primera vez que entra a un campo del formulario | `<id>` |
| `FormPartial` | sale del correo o del teléfono ya válido | `<id>-parcial` |
| `Lead` | envía con correo o teléfono válido | `<id>` |
| `Contact` | toca un enlace de WhatsApp (`wa.me`) o de teléfono (`tel:`), o envía un formulario que va a WhatsApp | `whatsapp` / `phone` |

- **Cada evento lleva su `event_id` (`ev-…`).** Al registro de GHL va en `meta_event_ids`
  (`{"Lead":"ev-…"}`), y con eso Meta cuenta una sola conversión entre el pixel y la API de
  conversiones.
- **`Lead` y `FormPartial` llevan `user_data`** (correo en minúsculas y teléfono `+52…`) para
  la coincidencia avanzada.
- **En el contenedor del alumno**, cada etiqueta (pixel, GA4, Google Ads) se dispara con un
  activador de evento personalizado `conversion` filtrado por `event_name`. El manual de
  AI Studio ya explica cómo armarlo: es el mismo.

## La API de conversiones de Meta

El sitio solo junta y manda los datos: `meta_event_ids`, `meta_fbp`, `meta_fbc` (de la
cookie `_fbc` o armado con el `fbclid` de la URL) y `meta_user_agent`. El envío a Meta lo hace
un workflow de GHL (webhook a n8n o la acción de Meta del CRM) y lo arma el alumno, con su
manual.

- En `*.vercel.app` las cookies de Meta empiezan con `fb.2.` (es un dominio compartido). En
  el dominio propio empiezan con `fb.1.`. Las dos sirven.
- Para probar el `fbc` sin anuncio, abre el sitio con `&fbclid=PRUEBA`.
- El pixel manda el `Lead` por POST: en la consola puede no verse. Para confirmarlo, usa
  Meta Pixel Helper o «Probar eventos» en Events Manager.

## En GHL, después del primer envío real

- **Un formulario aparece en *Sites › Forms › Submissions › External Forms*, y en la lista
  del disparador del workflow, solo después de su primer envío real.** Con AI Studio se
  comprobó el 30 de septiembre de 2026. Las pruebas automáticas no lo hacen aparecer, porque
  atrapan el envío.
- **El disparador** del workflow es «External Tracking Event», filtrado por form ID (y por
  dominio, si el alumno tiene varios sitios). «AI Studio Form Submitted» es solo para AI
  Studio. **Por confirmar con el segundo sitio:** que el registro de Vercel dispare
  «External Tracking Event», y anotar aquí el nombre exacto del disparador y de sus filtros.
- **Un form ID que ya existía** (el sitio viejo del alumno, o el mismo sitio en AI Studio)
  hace que sus workflows sigan funcionando sin tocarlos. Si el ID es nuevo, hay que agregarlo
  al filtro de cada workflow.
- **El parcial** llega casi siempre junto al completo, porque el visitante sale del correo
  para tocar «Enviar». El workflow del parcial debe esperar (por ejemplo 15 minutos) y
  seguir solo si el contacto no tiene el envío completo.

## Lo que el script no hace

- **Formularios que el sitio maneja a su manera**, como los de varios pasos con su propio
  envío. Ponles `"modo": "manual"` en `config.json`; el código del sitio llama
  `window.Seguimiento.enviar(form)` cuando de verdad se envía. Eso sí toca el sitio:
  propónselo al alumno antes.
- **Archivos adjuntos.** Los `type="file"` no se mandan.
- **Formularios sin correo ni teléfono**, como las calculadoras o los que solo arman un
  mensaje de WhatsApp. No crean contacto; si van a WhatsApp, cuentan como `Contact`.
