# <Nombre del cliente> · sitio web

Sitio de **<cliente>**, hecho con Claude y scroll-craft. Lo publica **<dueño>**; el equipo
colabora con ramas y *pull requests*.

- **Publicado en:** <dirección del sitio>
- **Manual completo** (instalar «Mis sitios», crear y publicar):
  https://vault.thehighlevelstudio.com/mis-sitios

## Si vas a colaborar: la primera vez

1. **Acepta la invitación** a este repositorio, que te llegó por correo (o en
   github.com/notifications).
2. **Instala tu carpeta «Mis sitios»** con el manual, hasta «Prepara mi carpeta». **Primero la
   carpeta, después este repositorio.**
3. **(Opcional) Tu clave de kie.ai**, la tuya: «Guarda mi clave de kie.ai: …».
4. **Clona el sitio.** En la app de Claude, pestaña **Code**, en una conversación nueva dentro de
   «Mis sitios»:

   > Clona el repositorio <dueño>/<repositorio> en scrollcraft/builds/<nombre> y ábrelo.

   - En Mac puede pedir instalar las **herramientas de desarrollador de Apple** (traen git):
     da **Instalar** y espera.
   - Para entrar a GitHub, Claude te muestra un **código de 8 caracteres**: abre
     **github.com/login/device**, entra con tu cuenta, pega el código y da **Authorize**.
   - **No uses un token ni tu contraseña:** un token «fine-grained» solo abre los repositorios
     de tu cuenta y da el error 403.
5. **Mira el sitio:**

   > Abre la vista previa del sitio.

   Lo ves en el panel de navegador de la app (`http://localhost:4550`).

## Cada cambio

1. **Arranca al día:** «Actualiza mi copia de <nombre> desde main.»
2. **Tu rama:** «Crea mi rama para "cambiar los textos de servicios".»
3. **El cambio:** pídelo con tus palabras. Claude propone y cambia con tu «dale». Revísalo en
   escritorio y en celular.
4. **Súbelo:** «Sube mis cambios y abre el pull request para <dueño>.» Mándale el enlace.

**Nunca trabajes en `main` ni publiques.** Eso lo hace <dueño>.

## Si eres el dueño

1. **Revisa y une:** «Revisa el pull request de <nombre> en <repositorio> y, si está bien,
   únelo.»
2. **Publica:**
   - **Vercel:** «Actualiza mi copia de <nombre> y publica los cambios».
   - **AI Studio:** pásale a quien colabora el ZIP del proyecto en blanco para que prepare el kit
     en su rama. Tú lo traes y pegas los mensajes.
3. **Revisa** en la dirección publicada.

## Si algo falla

| Lo que ves | Qué hacer |
|---|---|
| 404 al clonar | Falta iniciar sesión en GitHub: entra con GitHub CLI (paso 4) |
| 403 «Write access to repository not granted» | Git guardó un token o una contraseña que no sirve: pídele a Claude que la borre del llavero y entre con GitHub CLI |
| No llega la invitación | Revisa github.com/notifications o pide que la reenvíen |
| Claude habla de un «conflicto» | Dos personas cambiaron lo mismo: «resuelve el conflicto con main» |
