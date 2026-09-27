// Dónde vive cada archivo del sitio original: su URL en AI Studio cuando ya se subió
// por el chat (image-urls.ts), y /assets/<nombre> mientras tanto.
import { IMAGE_URLS } from "./image-urls";

export const asset = (nombre: string): string => IMAGE_URLS[nombre] || `/assets/${nombre}`;

/** Cambia cada @@asset:<nombre>@@ del HTML, el CSS y los scripts por su URL. */
export const resolver = (texto: string): string =>
  texto.replace(/@@asset:([^@]+)@@/g, (_m, nombre: string) => asset(nombre));
