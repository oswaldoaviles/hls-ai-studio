// La página original (hecha con scroll-craft), tal cual: su HTML entra como texto,
// el motor de scroll se monta al cargar y los <script> propios de la página corren
// después, en su orden. Las piezas están en contenido.ts; su CSS va en el <head>
// (head.ts).
import { useEffect } from "react";
import { ATRIBUTOS_BODY, HTML, OPCIONES_MOTOR, SCRIPTS } from "./contenido";
import { resolver } from "./assets";
import { instalarFormularios } from "./formulario";

const html = resolver(HTML.join(""));
let scriptsCorridos = false;

// En el original, los scripts de la página corrían mientras cargaba; aquí corren
// cuando ya cargó, así que DOMContentLoaded y load ya pasaron. Una función que
// espere esos eventos se llama en cuanto se registra, como hace $(fn) en jQuery.
function eventosTardios() {
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

function correrScripts() {
  if (scriptsCorridos) return;
  scriptsCorridos = true;
  if (SCRIPTS.length) eventosTardios();
  for (const { codigo, modulo } of SCRIPTS) {
    const s = document.createElement("script");
    if (modulo) s.type = "module";
    s.textContent = resolver(codigo);
    document.body.appendChild(s);
  }
}

export function Pagina() {
  useEffect(() => {
    let cancelado = false;
    for (const [nombre, valor] of Object.entries(ATRIBUTOS_BODY)) {
      if (nombre === "class") document.body.classList.add(...valor.split(/\s+/).filter(Boolean));
      else document.body.setAttribute(nombre, valor);
    }
    const quitarFormularios = instalarFormularios();
    void import("@/lib/scrollcraft.js").then(() => {
      if (cancelado) return;
      const motor = window.ScrollCraft;
      if (motor && !motor.instances.length) motor.mount(document.body, OPCIONES_MOTOR);
      correrScripts();
    });
    return () => {
      cancelado = true;
      quitarFormularios();
    };
  }, []);

  return (
    <div
      className="ai-pagina"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
