# Marca de «<nombre del sitio>»

La guía de marca de este sitio. Claude la lee antes de crear o cambiar cualquier página, y
scroll-craft la obedece como su «brand kit». Si cambias algo de tu marca, cámbialo aquí:
las páginas nuevas lo van a seguir.

## Colores

Viven en `sitio.css`, en el bloque `:root`. Cada uno tiene un rol; no se usan colores fuera
de esta lista.

| Token | Valor | Rol |
|---|---|---|
| `--sc-canvas` | <#hex> | Fondo de las páginas |
| `--sc-surface` | <#hex> | Tarjetas, campos de formulario, bloques |
| `--sc-ink` | <#hex> | Texto principal |
| `--sc-ink-soft` | <#hex> | Texto secundario |
| `--sc-accent` | <#hex> | El único color de acento: botones y enlaces importantes |
| `--sc-accent-ink` | <#hex> | Texto sobre el acento |

## Tipografías

- **Títulos:** <familia> (`--sc-font-display`), <pesos que se usan>.
- **Texto:** <familia> (`--sc-font-text`), <pesos que se usan>.

Se cargan desde Google Fonts con el mismo `<link>` en todas las páginas.

## Voz y tono

<Cómo habla la marca, tomado del BRIEF.md del home: a quién le habla, trato de tú o de
usted, frases que sí y que no.>

## Imágenes

<El preámbulo de estilo que scroll-craft usó para las imágenes del home, copiado tal cual.
Toda imagen generada para una página nueva empieza con este texto. Si el sitio usa fotos
propias, describe cómo son: luz, encuadre, color.>

## Componentes

- **Encabezado y menú:** los del home. Todas las páginas llevan el mismo menú.
- **Pie de página:** el de las páginas internas, en `sitio.css` (clase `<clase>`).
- **Botón principal:** `.cta`, siempre con el mismo texto para la misma acción («<texto>»).
- <Otros componentes que se repiten: tarjetas, listas, citas.>

## Reglas

- <Lo que la marca sí hace.>
- <Lo que la marca nunca hace: por ejemplo, no inventar cifras ni usar fotos de stock.>
