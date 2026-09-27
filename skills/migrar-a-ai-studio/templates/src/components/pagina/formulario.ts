// Los formularios de la página (marcados data-ai-studio-form en la conversión): al
// enviar, corre la validación del navegador, el contacto va al CRM por lead.ts y se
// manda el evento `lead` a GTM; luego el visitante va al destino del formulario en la
// misma pestaña (Safari bloquea una ventana que se abre con retraso), o el formulario
// queda con data-estado="enviado" si no tiene destino.
import { LEAD_FORM_ID, LEAD_SOURCE, sendLeadToCrm } from "./lead";

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function empujar(evento: Record<string, unknown>) {
  const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(evento);
}

/** Espera a que salgan GTM y el envío al CRM: mínimo 1 s, nunca más de 1.8 s. */
function entregar(campos: Record<string, string>): Promise<void> {
  const gtm = new Promise<void>((resolve) =>
    empujar({
      event: "lead",
      formId: LEAD_FORM_ID,
      source: LEAD_SOURCE,
      email: campos["email"] ?? "",
      eventCallback: () => resolve(),
      eventTimeout: 1200,
    }),
  );
  let crm: Promise<unknown> = Promise.resolve();
  try {
    crm = Promise.resolve(sendLeadToCrm(campos)).catch(() => undefined);
  } catch {
    // un error del CRM nunca debe dejar al visitante atorado en la página
  }
  return Promise.race([Promise.all([gtm, crm, esperar(1000)]).then(() => undefined), esperar(1800)]);
}

export function instalarFormularios(): () => void {
  const alEnviar = (e: Event) => {
    const objetivo = e.target as Element | null;
    const form = objetivo?.closest?.("form[data-ai-studio-form]") as HTMLFormElement | null;
    if (!form) return;
    e.preventDefault();
    if (form.dataset["estado"] === "enviando") return;
    if (!form.reportValidity()) return;
    const campos: Record<string, string> = {};
    new FormData(form).forEach((valor, clave) => {
      if (typeof valor === "string") campos[clave] = valor.trim();
    });
    const accion = form.getAttribute("action") || "";
    const destino = form.dataset["destino"] || (/^https?:\/\//.test(accion) ? accion : "");
    form.dataset["estado"] = "enviando";
    void entregar(campos).then(() => {
      if (destino) {
        location.assign(destino);
        return;
      }
      form.dataset["estado"] = "enviado";
      form.reset();
    });
  };
  document.addEventListener("submit", alEnviar, true);
  return () => document.removeEventListener("submit", alEnviar, true);
}
