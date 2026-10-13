# Manual · Fase 1: crea tu sitio con Claude y publícalo

**HighLevel Studio.** De una carpeta vacía a tu sitio publicado, en AI Studio o en Vercel.

Versión web: https://vault.thehighlevelstudio.com/mis-sitios

En esta fase:

1. instalas tu carpeta de trabajo, «Mis sitios», una sola vez;
2. le das a Claude tus materiales y tu prompt;
3. Claude te propone el sitio, tú lo apruebas y él lo construye;
4. lo revisas y pides cambios;
5. lo publicas en **GoHighLevel AI Studio** o en **Vercel**.

Tú decides y revisas. Claude corre los comandos, escribe el código y prueba el sitio en
escritorio y en celular.

---

## Checklist rápido

- [ ] Claude Pro (o superior) y la app de escritorio de Claude instalada
- [ ] Node.js, Google Chrome y ffmpeg instalados
- [ ] Carpeta «Mis sitios» en Documentos, abierta en la pestaña **Code**
- [ ] «Prepara mi carpeta» → Claude confirma que tiene las 4 skills
- [ ] (Opcional) Clave de kie.ai, si quieres que Claude genere imágenes
- [ ] Tus materiales en una carpeta: logo, manual de marca, fotos, videos
- [ ] Tu prompt (el cuestionario lleno), con datos de contacto y el código de tu calendario
- [ ] Conversación nueva: «Vamos a crear un sitio nuevo con scroll-craft…»
- [ ] Revisar la propuesta y decir «dale»
- [ ] Revisar el sitio en el navegador de Claude y pedir cambios
- [ ] Publicar: «Migra mi sitio a AI Studio» o «Publica mi sitio en Vercel»

---

## 1. Lo que necesitas

### Cuentas

| Cuenta | Para qué | Costo |
|---|---|---|
| **Claude Pro**, Max, Team o Enterprise | Claude Code (la pestaña **Code**). El plan gratis no lo incluye | De paga |
| **GoHighLevel** | Tu CRM, tu calendario y, si eliges ese camino, AI Studio | Tu plan de GHL |
| **kie.ai** (opcional) | Que Claude genere imágenes realistas cuando faltan fotos | Créditos; una imagen cuesta centavos |
| **Vercel** (solo si eliges Vercel) | Donde vive tu sitio | Hobby (gratis) para empezar |

### Programas

1. **La app de escritorio de Claude**, de [claude.ai/download](https://claude.ai/download).
   Inicia sesión y entra a la pestaña **Code**.
2. **Node.js**, la versión **LTS**, de [nodejs.org](https://nodejs.org). Instálalo con las
   opciones que trae.
3. **Google Chrome**, de [google.com/chrome](https://www.google.com/chrome). Claude lo usa
   para probar tu sitio.
4. **ffmpeg**, para comprimir videos:
   - **Mac:** abre la app **Terminal** y pega `brew install ffmpeg`. Si dice que no
     encuentra `brew`, instala primero Homebrew desde [brew.sh](https://brew.sh) y repite.
   - **Windows:** abre **PowerShell** y pega `winget install Gyan.FFmpeg`.

¿No sabes si ya los tienes? No pasa nada: en el paso 2, Claude los revisa y te dice cuál
falta.

---

## 2. Instala tu carpeta «Mis sitios» (una sola vez)

Todos tus sitios viven en una sola carpeta. Adentro, cada sitio recibe su propia
subcarpeta sola.

1. Descarga
   **[Mis-sitios.zip](https://github.com/oswaldoaviles/hls-ai-studio/releases/latest/download/Mis-sitios.zip)**.
2. Descomprímelo y mueve la carpeta **«Mis sitios»** a **Documentos**.
3. Abre la app de Claude → pestaña **Code** → elige la carpeta **«Mis sitios»**. Si te
   pregunta si confías en ella, di que **sí**.
4. Escribe:

   ```
   Prepara mi carpeta
   ```

5. Claude revisa e instala lo que falte:
   - **scroll-craft**, la skill que diseña y construye el sitio;
   - **hls-ai-studio**, con tres skills: agregar páginas, migrar a AI Studio y publicar en
     Vercel;
   - Node.js, Chrome y ffmpeg. Si falta alguno, te dice cómo instalarlo.
6. Si te pide **recargar**, escribe `/reload-plugins` o abre una conversación nueva.
   Pregúntale: «¿Ya tienes las 4 skills?».

**Las actualizaciones llegan solas.** Cuando hay una versión nueva de las skills, Claude la
descarga en segundo plano. A lo mucho te pide `/reload-plugins`.

### Si prefieres la terminal

Con Claude Code instalado en la terminal:

```bash
claude plugin marketplace add nateherkai/scroll-craft
claude plugin install nateherk-design@nateherk
claude plugin marketplace add oswaldoaviles/hls-ai-studio
claude plugin install hls-ai-studio@highlevel-studio
```

Para actualizar a mano:

```bash
claude plugin marketplace update highlevel-studio
claude plugin update hls-ai-studio@highlevel-studio
```

Para trabajar con el código fuente (por ejemplo, para revisarlo o proponer cambios):

```bash
git clone https://github.com/oswaldoaviles/hls-ai-studio.git
```

No hace falta clonarlo para usarlo: la instalación de arriba basta.

---

## 3. (Opcional) Tu clave de kie.ai

Sin clave, Claude construye el sitio solo con tus fotos y videos. Con clave, puede generar
una imagen realista cuando falta una (por ejemplo, un fondo o un detalle de producto).

1. Crea tu cuenta en [kie.ai](https://kie.ai).
2. Recarga unos créditos.
3. En tu panel, abre la sección **API Key** y copia la clave.
4. En Claude, dentro de «Mis sitios», escribe:

   ```
   Guarda mi clave de kie.ai: <pega aquí tu clave>
   ```

   Claude la guarda en el archivo `.env` de tu carpeta (`KIE_AI_API_KEY=…`). Ese archivo
   nunca se publica.

**Regla de oro:** las fotos reales de tu negocio y de tu equipo siempre ganan. Usa la IA
para lo que no puedes fotografiar, no para inventar personas que «representen» tu marca.

---

## 4. Prepara tus materiales y tu prompt

### Tus materiales

Junta todo en **una carpeta** (por ejemplo, en Descargas):

- **logo**, de preferencia en PNG con fondo transparente;
- **manual de marca** (PDF): colores, tipografías y combinaciones;
- **fotos reales**: el lugar, el equipo trabajando y los clientes (con su permiso);
- **videos**, si tienes. Los reels con subtítulos se muestran como reels, con botón de play.
  No sirven de fondo animado.

**Nombra el sitio** en minúsculas y sin espacios: `fisioglobal`, `clinica-sol`.

### Tu prompt: el cuestionario

Llénalo antes de abrir Claude. Puedes pegarlo en el chat o guardarlo como `prompt.txt`
junto a tus materiales.

```markdown
# <Negocio> · Brief para el sitio web

## Parte 1 · El negocio
1. ¿Qué es y para quién es? (ciudad, especialidad, cliente ideal)
2. ¿Qué tiene que creer el visitante al terminar de leer? (una idea y sus apoyos)
3. ¿Qué acción quieres que haga? Texto del botón:
4. ¿Qué material tienes? (logo, manual, fotos, videos)
5. Los 3 dolores principales de tu cliente antes de llegar contigo

## Parte 2 · Cómo se siente la web
6. El estilo en 3 a 5 palabras, y referencias (link + qué rescatar de cada una)
7. El recorrido, sección por sección
8. ¿Dónde va calmada y dónde intensa?
9. ¿Qué debe sentir en cada parte, y cuál es EL momento que debe recordar?
10. ¿Qué debe hacer esta web que no hayas visto en ninguna otra?
11. ¿Qué tanto te alejas de lo «premium minimalista»? (editorial, minimalista, intenso…)
12. ¿Un solo mundo continuo o escenas separadas?
13. Tipo de imagen (fotografía real, generada, ilustración)

## Parte 3 · Datos de contacto y credenciales
- Dirección, WhatsApp, teléfono, horario
- Link de tu ficha de Google Maps y redes sociales
- Código del calendario de GHL (si el botón es agendar)
- Nombres, cargos y credenciales del equipo (por ejemplo, cédulas profesionales)
- Aviso de privacidad (texto o link)
```

**Consejos que salieron de sitios reales:**

- **En la 7, describe el recorrido en tus palabras.** Claude lo respeta y lo convierte en
  secciones.
- **«Mundo continuo» suena bien, pero ojo:** una cámara que viaja sin cortes obliga a
  generar el lugar con IA, y eso choca con «fotos reales de mi negocio». Si eliges las dos
  cosas, Claude te propone dónde poner el efecto. Lo mejor suele ser **en una sola sección**:
  un elemento que se queda en toda la página termina cansando.
- **Los datos de contacto** llenan el cierre del sitio. Si todavía no los tienes, Claude
  pone marcas visibles `[pendiente]`, que reemplazas después. Nunca inventa datos.
- **El código del calendario** sale de tu calendario en GHL, en la opción de compartir o
  insertar (*Embed*). Pégalo tal cual en el chat.
- **Revisa que el texto no contradiga tu oferta.** Si tu calendario vende «paquetes», el
  sitio no puede decir «nada de paquetes».

---

## 5. Crea tu sitio

**Abre una conversación nueva** en «Mis sitios» y escribe algo así:

```
Vamos a crear un sitio nuevo con /nateherk-design:scroll-craft.
Se llama <nombre>. Mis materiales están en la carpeta "<nombre de la carpeta>" de Descargas.
Guíame paso a paso. Este es mi prompt:
<pega aquí tu cuestionario>
```

### Lo que hace Claude, y lo que haces tú

| Paso | Claude | Tú |
|---|---|---|
| 1. Materiales | Encuentra tu carpeta, la copia a `scrollcraft/builds/<nombre>/insumos/` (el original no se toca) y revisa tus fotos, videos y manual | Nada |
| 2. Preguntas | Te pregunta **solo** lo que tu prompt no contesta | Contestas |
| 3. Propuesta | Te muestra el recorrido en una tabla (sección, qué siente el visitante, qué pasa en pantalla), la idea que lo hace único y las decisiones que te tocan | Lo lees y dices **«dale»** o qué cambias |
| 4. Construcción | Prepara las imágenes, escribe la página y la prueba en escritorio, en celular (tamaño iPhone) y con movimiento reducido | Esperas. Te avisa qué está haciendo |
| 5. Entrega | Te da la dirección para verlo (`http://localhost:45xx`) en el navegador de la app | Lo recorres |

**Claude no construye nada sin tu «dale».** Si solo das una opinión o preguntas «¿cómo
ves?», te propone y espera.

### Revisar y pedir cambios

1. **Recorre el sitio** en el panel de navegador de la app, en escritorio y en celular.
2. **Pide cambios por sección**, en tus palabras. Por ejemplo:

   > No me encanta que el señor de la espalda se desplace por toda la página. Ponlo solo
   > en su sección y usa más fotos reales para humanizar la marca.

3. Claude te propone el cambio, tú dices «dale» y te muestra el resultado ya probado.

Todo queda guardado en archivos, así que puedes cerrar la conversación y seguir otro día.

### Dónde queda todo

```
Mis sitios/
  scrollcraft/
    builds/
      <nombre>/              tu sitio
        index.html           la página
        assets/              imágenes, videos y logo ya optimizados
        insumos/             la copia de tus materiales (nunca se publica)
        BRIEF.md             tu prompt y las decisiones aprobadas
      <nombre>-vercel/       si publicas en Vercel
      <nombre>-ai-studio/    si publicas en AI Studio
```

---

## 6. (Opcional) Agrega páginas

En una conversación nueva:

```
En el sitio <nombre>, crea la página de contacto.
```

- Sirve igual para «nosotros», un servicio, una página de gracias o los legales.
- La primera vez, Claude arma la guía de marca del sitio (`MARCA.md`) con lo que decidió
  tu home. Cada página nueva la sigue.
- Una página de servicio tiene la experiencia completa, como el home. Contacto o legales son
  sencillas: Claude solo te pregunta qué deben decir.

---

## 7. Publica tu sitio

Cuando digas «quiero publicar mi sitio», Claude te pregunta dónde:

| | AI Studio | Vercel |
|---|---|---|
| Dónde vive el sitio | Dentro de GoHighLevel | En Vercel, con tu dominio |
| Cómo se sube | Pegando mensajes en el chat de AI Studio | Claude lo publica con un comando |
| Formularios al CRM | Sí | Sí, con el mismo seguimiento y la API de conversiones |
| Cambios después | Otra ronda de mensajes en el chat | «Publica los cambios» |
| Costo | Incluido en tu plan de GHL | Hobby gratis para empezar |

Puedes cambiar de camino después: tu sitio original no se toca.

### 7A. Camino AI Studio

1. **Crea un proyecto en blanco** en AI Studio. No le pidas nada a su chat.
2. **Descarga su código:** *Code → Download Codebase*. Queda un ZIP en Descargas.
3. En una conversación nueva, escribe:

   ```
   Migra mi sitio <nombre> a AI Studio. El ZIP de mi proyecto en blanco está en Descargas.
   ```

4. Claude convierte el sitio a tu plantilla, lo prueba página por página y te da un **kit**
   con la guía `PASOS.md`.
5. **Pega los mensajes uno por uno.** Claude pone cada mensaje en tu portapapeles:
   - tú lo pegas en el chat de AI Studio (Cmd/Ctrl + V);
   - le dices «siguiente» y le cuentas qué contestó AI Studio.

   Las imágenes van en grupos de 5, que es el máximo que acepta su chat. Si AI Studio
   responde algo raro, cópiale la respuesta a Claude y él te dice qué contestar.
6. **Conecta tus formularios** con el mensaje que Claude te da para el CRM.
7. **Verificación:** descarga otra vez el ZIP de tu proyecto y pásale a Claude ese ZIP junto
   con la URL de la vista previa. Te dice si quedó exacto y te da las correcciones.
8. **Lead de prueba:** regístrate con tu correo y revisa en GHL que llegue a *Contactos* y a
   *Sites › Forms › Submissions › External Forms*.
9. **Publica y conecta tu dominio** desde la publicación del proyecto en AI Studio. Luego
   pide «haz el SEO final de mi sitio».

### 7B. Camino Vercel

#### Crea tu cuenta de Vercel (una sola vez)

1. Entra a [vercel.com/signup](https://vercel.com/signup).
2. Elige **Hobby** (gratis) y escribe tu nombre.
   - Vercel pide **Pro** para sitios comerciales. Puedes cambiar de plan después, en
     *Settings → Billing*, sin volver a publicar.
3. Regístrate con tu correo, con Google o con GitHub. **No necesitas GitHub.**
4. Confirma tu correo si te lo pide.

**No necesitas crear ninguna clave ni token.** Cuando Claude publique por primera vez,
corre el inicio de sesión (`vercel login`) y te da un enlace:

1. lo abres;
2. entras con tu cuenta de Vercel;
3. apruebas el acceso;
4. le dices «listo».

Esa sesión queda guardada en tu computadora para las siguientes veces.

#### Tus datos de GoHighLevel

Claude te los pide. Están en la subcuenta del sitio:

- **Location ID:** *Settings → Business Profile*, arriba, con el botón de copiar. También es
  lo que va después de `/location/` en la dirección del navegador.
- **Tracking ID:** *Settings → External Tracking*. GHL muestra un script; copia **solo** lo
  que empieza con `tk_…`.
  - **No pegues ese script en tu sitio:** cada formulario llegaría dos veces.
- **Google Tag Manager** (opcional): `GTM-XXXXXXX`. Si no tienes, el sitio funciona igual y
  lo agregas después.

#### Publica

1. En una conversación nueva, escribe:

   ```
   Publica mi sitio <nombre> en Vercel.
   ```

2. Claude arma una copia del sitio en `<nombre>-vercel/` y conecta cada formulario a GHL
   (el registro completo y un parcial con el correo o el teléfono).
   - Las citas de un calendario de GHL incrustado llegan solas al CRM.
3. **Lo prueba en tu compu** (escritorio y celular) y te enseña qué llegaría a tu CRM.
4. **Lo publica** en `https://<proyecto>.vercel.app` y lo vuelve a probar ahí.
   - Esa dirección lleva `noindex`, así que Google no la muestra.
   - Si el nombre ya estaba tomado, Vercel le agrega una palabra (por ejemplo
     `fisioglobal-flame.vercel.app`). Es normal.
5. **Ábrelo en tu celular.** Es la prueba que Claude no puede hacer por ti.
6. **Lead real de prueba, con tu permiso.** Claude te da la dirección con `?seguimiento=1`;
   tú llenas el formulario y revisas en GHL:
   - el contacto;
   - su atribución (*First Session Attribution*);
   - *External Forms*.
7. **Workflows:** usa el disparador **External Tracking Event**, filtrado por el form ID que
   te dio Claude.

#### Conecta tu dominio

Cuando el sitio ya esté probado y sin `[pendiente]`:

```
Conecta mi dominio <tudominio.com>
```

1. Claude agrega el dominio y `www` a tu proyecto.
2. Detecta quién maneja tu DNS (Cloudflare, GoDaddy, Hostinger…) y te dice:
   - los **dos registros exactos** que hay que cambiar;
   - cuáles **no se tocan**: correo (MX), TXT y los subdominios de GHL como `link`.
3. Le mandas una captura de tus registros antes de cambiar nada.
4. Cambias los registros y le dices «listo».
5. Claude revisa el certificado y las redirecciones, y prueba tu dominio.

#### Cambios después

Edita lo que quieras con Claude (en el sitio original) y luego escribe:

```
Publica los cambios
```

Claude prueba en local, publica y vuelve a probar en vivo.

---

## 8. Problemas comunes

| Lo que ves | Qué hacer |
|---|---|
| Claude dice que le falta una skill | Escribe «Prepara mi carpeta» y luego `/reload-plugins` |
| No encuentra tu carpeta de materiales | Dile el nombre exacto y dónde está (Descargas, Escritorio) |
| La espalda, el producto o el elemento animado tapa el texto en celular | Díselo con una captura: Claude ajusta la versión de celular aparte |
| Una sección se siente vacía o «se atora» al bajar | Díselo: suele ser una escena fija demasiado larga |
| El sitio muestra `[pendiente]` en rojo | Son datos que faltan. Pásaselos a Claude y «publica los cambios» |
| Vercel: «Not authorized» al publicar | Pídele a Claude que lo intente otra vez. Si sigue, que revise tu sesión de Vercel |
| Vercel: el sitio viejo sigue apareciendo en tu dominio | Espera unos minutos; Claude revisa los registros con `--revisar` |
| No llega nada a GHL desde `*.vercel.app` | Es a propósito: ahí solo envía con `?seguimiento=1` |
| El formulario no aparece en *External Forms* | Aparece después de su primer envío real |
| Pediste publicarlo como «artefacto» de Claude | Un sitio con la marca real de un negocio se publica en AI Studio o Vercel |

---

## 9. Antes de grabar o de entregar a tu cliente

- [ ] Todas las fotos son reales o, si son generadas, no muestran a personas que «son» la marca
- [ ] No hay `[pendiente]` a la vista
- [ ] El botón principal dice lo mismo en todo el sitio (por ejemplo, «Agendar cita»)
- [ ] Probado en tu iPhone, no solo en la computadora
- [ ] Lead de prueba revisado en GHL
- [ ] El aviso de privacidad lleva a una página real
