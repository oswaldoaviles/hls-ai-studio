// Cada página del sitio original (hecho con scroll-craft), tal cual: su HTML entra como
// texto, el motor de scroll se monta al cargar y los <script> propios de la página corren
// después, en su orden. Las piezas de cada página están en su contenido.ts; su CSS va en
// el <head> (head.ts). La página principal usa las de esta carpeta; las demás, las de
// src/components/paginas/<pagina>/.
import { useEffect, useRef } from "react";
import * as principal from "./contenido";
import { resolver } from "./assets";
import { instalarFormularios } from "./formulario";

export type Contenido = {
  HTML: string[];
  SCRIPTS: { codigo: string; modulo: boolean }[];
  OPCIONES_MOTOR: Record<string, unknown> | undefined;
  ATRIBUTOS_BODY: Record<string, string>;
};

// En el original, los scripts de la página corrían mientras cargaba; aquí corren
// cuando ya cargó, así que DOMContentLoaded y load ya pasaron. Una función que
// espere esos eventos se llama en cuanto se registra, como hace $(fn) en jQuery.
let tardiosListos = false;
function eventosTardios() {
  if (tardiosListos) return;
  tardiosListos = true;
  const yaPaso = (tipo: string) =>
    (tipo === "DOMContentLoaded" && document.readyState !== "loading") ||
    (tipo === "load" && document.readyState === "complete");
  for (const objetivo of [document, window] as EventTarget[]) {
    const original = objetivo.addEventListener.bind(objetivo);
    objetivo.addEventListener = (
      tipo: string,
      fn: EventListenerOrEventListenerObject | null,
      opciones?: boolean | AddEventListenerOptions,
    ) => {
      if (fn && yaPaso(tipo)) {
        const evento = new Event(tipo);
        queueMicrotask(() => (typeof fn === "function" ? fn.call(objetivo, evento) : fn.handleEvent(evento)));
        return;
      }
      original(tipo, fn, opciones);
    };
  }
}

export function crearPagina(contenido: Contenido) {
  const html = resolver(contenido.HTML.join(""));
  let scriptsCorridos = false;

  function correrScripts() {
    if (scriptsCorridos) return;
    scriptsCorridos = true;
    if (contenido.SCRIPTS.length) eventosTardios();
    for (const { codigo, modulo } of contenido.SCRIPTS) {
      const s = document.createElement("script");
      if (modulo) s.type = "module";
      s.textContent = resolver(codigo);
      document.body.appendChild(s);
    }
  }

  return function Pagina() {
    const raiz = useRef<HTMLDivElement>(null);
    useEffect(() => {
      let cancelado = false;
      for (const [nombre, valor] of Object.entries(contenido.ATRIBUTOS_BODY)) {
        if (nombre === "class") document.body.classList.add(...valor.split(/\s+/).filter(Boolean));
        else document.body.setAttribute(nombre, valor);
      }
      const quitarFormularios = instalarFormularios();
      void import("@/lib/scrollcraft.js").then(() => {
        if (cancelado) return;
        const motor = window.ScrollCraft;
        // El motor se monta una vez por página en pantalla. Al cambiar de página dentro de la
        // app (el selector de páginas del editor de AI Studio), la nueva se monta también.
        if (motor && raiz.current && !raiz.current.hasAttribute("data-motor")) {
          motor.mount(document.body, contenido.OPCIONES_MOTOR);
          raiz.current.setAttribute("data-motor", "1");
        }
        correrScripts();
      });
      return () => {
        cancelado = true;
        quitarFormularios();
      };
    }, []);

    return (
      <div
        ref={raiz}
        className="ai-pagina"
        style={{ display: "contents" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };
}

// La página principal (/).
export const Pagina = crearPagina(principal);
