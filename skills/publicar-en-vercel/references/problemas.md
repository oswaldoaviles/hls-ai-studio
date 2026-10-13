# Problemas conocidos y qué hacer

Lo que pasó en el piloto (zynapze.ai, octubre de 2026) y cómo se resolvió. Busca aquí el
mensaje antes de cambiar nada.

## Vercel

| Lo que ves | Qué es | Qué hacer |
|---|---|---|
| `whoami` falla o dice que no hay sesión | El alumno no ha iniciado sesión en Vercel en esta computadora | SKILL.md, «Vercel: iniciar sesión» |
| «Not authorized» al publicar, con `whoami` bien | Un fallo pasajero de Vercel. Pasó dos veces en el piloto | Vuelve a correr `publicar.mjs` una vez antes de cambiar nada |
| La publicación queda **Blocked** («commit author doesn't have permission») | Vercel revisa el autor del último commit cuando la carpeta está dentro de un repositorio git | `publicar.mjs` ya publica desde una copia sin git. Si aun así pasa, revisa que el proyecto no esté conectado a un repositorio de GitHub de otra cuenta |
| La CLI se queda en «Building…» mucho tiempo | La CLI a veces no se entera de que Vercel ya terminó | `publicar.mjs` espera 5 minutos y luego pregunta el estado con `vercel inspect`. A mano: `npx vercel@latest inspect <url>` |
| La dirección es `<proyecto>-algo.vercel.app` y no `<proyecto>.vercel.app` | Otro usuario de Vercel ya tiene ese nombre | Es normal: `publicar.mjs` guarda la dirección real en `estado.json`. Si el alumno quiere otra, cambia `proyecto` en `config.json` **antes** de la primera publicación |
| `domains add` dice que el dominio ya está en otro proyecto o cuenta | El dominio se agregó antes en otro proyecto de Vercel (o de otra persona) | Si es del alumno, que lo quite de ese proyecto en vercel.com (Settings → Domains). Si es de otra cuenta, Vercel pide verificarlo con un registro TXT: dale el que muestre `npx vercel@latest domains inspect <dominio>` |
| `Error: Project names can be up to 100 characters long and must be lowercase` | Nombre de proyecto con mayúsculas o espacios | Cámbialo en `config.json` (letras minúsculas, números y guiones) |
| `preparar.mjs` avisa que un archivo pesa más de 25 MB | Casi siempre es material original que no es parte del sitio (un video sin comprimir, un PDF de marca). Antes de 0.4.1 la carpeta `insumos/` se publicaba completa (Fisioglobal, 200 MB) | Si no es del sitio, ponlo en `excluir`. Si sí, comprímelo con `ffmpeg` |
| Archivos de más de 100 MB | Vercel no acepta archivos tan grandes en un sitio estático | Comprime el video (`ffmpeg`), o ponlo en `excluir` y súbelo a otro lado (Media Storage de GHL) |

## El sitio

| Lo que ves | Qué es | Qué hacer |
|---|---|---|
| Una página abre en local y da 404 en Vercel | Mayúsculas: Vercel distingue `Contacto.html` de `contacto.html` y la Mac no | Usa el mismo nombre exacto en el archivo y en los enlaces |
| Las imágenes de una página dentro de una carpeta no cargan | Rutas absolutas (`/assets/…`) que en local apuntaban a otro lado, o relativas mal contadas | `probar.mjs` las lista como 404. Corrige la ruta en el sitio original |
| El sitio viejo sigue apareciendo en algunos teléfonos | El DNS todavía no se propaga en su red, o quedó un registro AAAA o un segundo A viejo | `dominio.mjs --revisar`; borra el AAAA o el A sobrante (con permiso del alumno) |
| «Too many redirects» en el dominio | Cloudflare en «Proxied» con SSL «Flexible» | Pon los registros en «DNS only» (nube gris) |
| Al compartir en WhatsApp o Facebook sale la vista previa vieja | Guardan la vista previa | Pega la dirección en developers.facebook.com/tools/debug y da «Volver a extraer» |
| PageSpeed marca «Total Blocking Time» alto, y en terceros aparecen googletagmanager, facebook o clarity | Tag Manager carga demasiado pronto | Ya entra con la primera interacción o a los 8 s. No quites etiquetas: sube `gtmRetraso` si hace falta |
| En el celular «se atora» | Casi nunca es lentitud: son escenas fijas (`data-sc-span`) demasiado largas, donde el dedo avanza y la pantalla casi no cambia | Mídelo antes de tocar: captura cada medio deslizamiento y cuenta cuántas veces casi no cambia |

## Los formularios

| Lo que ves | Qué es | Qué hacer |
|---|---|---|
| El formulario no aparece en *External Forms* ni en el disparador | Solo aparece después de su primer envío real | Que el alumno envíe cada formulario una vez, desde el dominio o con `?seguimiento=1` |
| El contacto llega sin `utm_campaign` en la atribución | No llegó la visita de página con la misma sesión | Revisa con `probar.mjs` que salga «visita con UTM». Si el sitio carga `seguimiento.js` después de enviar (por ejemplo, una página de gracias externa), no hay visita |
| Llega el parcial pero no el completo | El visitante dejó su correo o teléfono y no envió | Es lo esperado: el parcial existe para eso. El workflow del parcial espera y sigue solo si no llegó el completo |
| Llegan dos completos del mismo contacto | El sitio rechazó el primer envío por algo que `seguimiento.js` no ve (por ejemplo, Marcotrade sin productos en el carrito) y el visitante envió otra vez | Si molesta en los workflows, pasa el formulario a `"modo": "manual"` y llama `Seguimiento.enviar(form)` desde el código del sitio, en el momento del envío bueno |
| En la vista `.vercel.app` no llega nada a GHL | Es a propósito: ahí solo envía con `?seguimiento=1` | Para el lead real de prueba, abre la página con `?seguimiento=1` |
| El formulario sigue diciendo «todavía no está conectado» | Es texto del sitio, de antes de conectarlo | Cambia ese texto en el sitio original (con permiso del alumno) y vuelve a publicar |
