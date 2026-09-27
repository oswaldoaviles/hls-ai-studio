// Aquí AI Studio conecta su formulario de CRM ("Connect forms to my CRM").
// formulario.ts ya valida el formulario, manda el evento `lead` a GTM y sigue a su
// destino. Esta función solo debe enviar el contacto con la integración de
// formularios de AI Studio (postTrackingEvent de @/lib/tracking).
export function sendLeadToCrm(campos: Record<string, string>): Promise<unknown> | void {
  void campos;
}

// Identidad del formulario para el evento `lead` de GTM: los mismos valores que
// use AI Studio (FORM_ID y CONTACT_SOURCE de @/lib/tracking).
export const LEAD_FORM_ID = "__FORM_ID__";
export const LEAD_SOURCE = "__SOURCE__";
