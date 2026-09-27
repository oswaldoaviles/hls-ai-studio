// Tipos del motor de scroll-craft (scrollcraft.js, copiado sin cambios). El motor es
// un script del navegador que define window.ScrollCraft: se importa de forma dinámica
// en el cliente, nunca al principio de un módulo.
export {};

export interface ScrollCraftApi {
  layout(): void;
  read(): void;
  acts: unknown[];
}

declare global {
  interface Window {
    ScrollCraft?: {
      mount(root?: Element | Document | string | null, opts?: Record<string, unknown>): ScrollCraftApi;
      reduce: boolean;
      instances: ScrollCraftApi[];
    };
  }
}
