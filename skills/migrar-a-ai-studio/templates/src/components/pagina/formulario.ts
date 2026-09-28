// Los formularios del sitio (marcados data-ai-studio-form en la conversión, cada uno con
// su data-form-id): al enviar, corre la validación del navegador, el contacto va al CRM
// por lead.ts con el form ID de ese formulario y se manda el evento `lead` a GTM; luego el
// visitante va al destino del formulario en la misma pestaña (Safari bloquea una ventana
// que se abre con retraso), o el formulario queda con data-estado="enviado" si no tiene
// destino.
import { LEAD_FORM_ID, LEAD_SOURCE, sendLeadToCrm } from "./lead";

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function empujar(evento: Record<string, unknown>) {
  const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(evento);
}

// Una conexión anterior al CRM puede aceptar solo los campos: el form ID va como segundo
// argumento, que esa versión ignora.
const enviarAlCrm = sendLeadToCrm as (campos: Record<string, string>, formId?: string) => unknown;

/** Espera a que salgan GTM y el envío al CRM: mínimo 1 s, nunca más de 1.8 s. */
function entregar(campos: Record<string, string>, formId: string): Promise<void> {
  const gtm = new Promise<void>((resolve) =>
    empujar({
      event: "lead",
      formId,
      source: formId === LEAD_FORM_ID ? LEAD_SOURCE : formId,
      email: campos["email"] ?? "",
      eventCallback: () => resolve(),
      eventTimeout: 1200,
    }),
  );
  let crm: Promise<unknown> = Promise.resolve();
  try {
    crm = Promise.resolve(enviarAlCrm(campos, formId)).catch(() => undefined);
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
    void entregar(campos, form.dataset["formId"] || LEAD_FORM_ID).then(() => {
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
