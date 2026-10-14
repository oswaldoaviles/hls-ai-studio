# <Nombre del cliente> · sitio web · instrucciones para Claude

Sitio de <cliente>, hecho con **scroll-craft**. Lo trabaja un equipo: **<dueño>** (dueño del
repositorio, el único que publica) y quien colabora. Habla en español, en pasos cortos.
La guía para colaborar está en `README.md`.

## Qué es cada archivo

- `index.html` y las demás páginas, `pagina.css`, `pagina.js` (o `sitio.css`): el sitio.
  `scrollcraft.js` y `scrollcraft.css` son el motor de scroll-craft: **no se editan**.
- `assets/`: fotos, videos y logo ya optimizados.
- `BRIEF.md` y `MARCA.md`, si existen: el brief del cliente y su marca. Léelos antes de proponer
  cambios de diseño o de texto.
- `insumos/` (materiales originales) no está en Git. Si hace falta un original, pídeselo al dueño.

## Cómo se trabaja

1. **Nunca en `main`.** Al empezar, revisa la rama actual (`git branch --show-current`). Si estás
   en `main`, primero actualízala (`git pull`) y crea una rama con un nombre corto de lo que vas
   a hacer (`git switch -c textos-servicios`).
2. **Propón antes de cambiar.** Cada cambio de diseño o de texto se propone primero y se hace
   solo con el «dale» de quien te lo pidió.
3. **Mira el cambio en el panel de navegador** con la configuración de `.claude/launch.json`
   (`http://localhost:4550`), en escritorio y en celular (390 × 664).
4. **Commits pequeños**, subidos a la rama: `git push -u origin <rama>`.
5. **Al terminar**, abre un pull request hacia `main` (`gh pr create`) con lo que cambió y
   capturas. El dueño lo revisa, lo une y lo publica.

## GitHub

- **Para entrar a GitHub usa GitHub CLI:** `gh auth login --web` y luego `gh auth setup-git`.
  Nunca le pidas a la persona un token ni su contraseña: un token «fine-grained» solo abre los
  repositorios de su propia cuenta y da 403 «Write access to repository not granted».
- **Si git ya guardó una credencial que no sirve**, bórrala del llavero antes de entrar:
  `printf "protocol=https\nhost=github.com\n\n" | git credential-osxkeychain erase` (Mac).
- **Un 404 al clonar** casi siempre es falta de sesión: con un repositorio privado, GitHub
  responde «no existe».

## Lo que no se hace aquí

- **No publiques.** Ni Vercel, ni dominio, ni mensajes en AI Studio: eso lo hace el dueño. Para
  AI Studio, quien colabora puede **preparar el kit** (`migrar-a-ai-studio`) con el ZIP en blanco
  que le pase el dueño, y subirlo a su rama.
- **No inventes datos del cliente.** Lo que falte va marcado como `[pendiente]`.
- **Claves personales.** Cada quien usa su propia clave de kie.ai, en el `.env` de su carpeta
  «Mis sitios». Nunca pidas ni uses la de otra persona, y nunca subas un `.env`.
