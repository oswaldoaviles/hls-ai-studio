/* Seguimiento del sitio en Vercel (skill publicar-en-vercel de HighLevel Studio).
   Hace sin AI Studio lo que hace un sitio de AI Studio conectado a GoHighLevel:
   - manda la visita de cada página a GHL (External Tracking), con la URL completa y una
     sesión por pestaña. Sin la visita, GHL pierde el utm_campaign del contacto;
   - manda cada formulario marcado con data-form-id a GHL, con la misma sesión: el
     registro completo al enviar y uno parcial (form ID «<id>-parcial») en cuanto el
     correo o el teléfono son válidos, por si no termina;
   - junta los datos de Meta para la API de conversiones (meta_event_ids, meta_fbp,
     meta_fbc, meta_user_agent) y los clics de Google (gclid, gbraid, wbraid);
   - manda a Tag Manager el evento `conversion` (event_name FormStart, FormPartial, Lead o
     Contact, con su event_id, el mismo que llega a GHL para deduplicar con el pixel);
   - carga Tag Manager, si hay contenedor, con la primera interacción o a los 8 s.
   Solo envía en el dominio del sitio. En la vista previa y en local se enciende con
   ?seguimiento=1 (dura lo que la pestaña; ?seguimiento=0 lo apaga). Apagado, cada envío
   se anota en la consola y en window.__seguimiento.
   La configuración (window.SEGUIMIENTO) la escribe preparar.mjs arriba de este archivo. */
(function () {
  "use strict";

  var C = window.SEGUIMIENTO || {};
  var ENDPOINT = "https://backend.leadconnectorhq.com/external-tracking/events";
  var FORMS = C.formularios || {};
  var CAMPOS = C.campos || {};
  var registro = (window.__seguimiento = window.__seguimiento || []);

  // ---- ¿Se envía? Siempre en el dominio; en la vista previa y en local, con ?seguimiento=1.
  var host = location.hostname;
  var enDominio = (C.dominios || []).some(function (d) {
    return d && (host === d || host.slice(-(d.length + 1)) === "." + d);
  });
  var params = new URLSearchParams(location.search);
  var bandera = params.get("seguimiento");
  try {
    if (bandera === "1") sessionStorage.setItem("seguimiento", "1");
    if (bandera === "0") sessionStorage.removeItem("seguimiento");
    bandera = sessionStorage.getItem("seguimiento");
  } catch (e) {
    bandera = bandera === "1" ? "1" : null;
  }
  var activo = enDominio || bandera === "1";
  var conGhl = !!(C.trackingId && C.locationId);

  // ---- Memoria de la pestaña: la sesión de GHL y los UTM con que llegó.
  function guardado(clave, crear) {
    try {
      var v = sessionStorage.getItem(clave);
      if (v) return v;
      v = crear();
      if (v) sessionStorage.setItem(clave, v);
      return v;
    } catch (e) {
      return (guardado.memoria = guardado.memoria || {})[clave] || (guardado.memoria[clave] = crear());
    }
  }
  function uuid() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }
  var sesion = guardado("ghl_sid", uuid);
  var UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var utms = {};
  try {
    utms = JSON.parse(
      guardado("seguimiento_utm", function () {
        var u = {};
        UTM.forEach(function (k) { if (params.get(k)) u[k] = params.get(k); });
        return Object.keys(u).length ? JSON.stringify(u) : "";
      }) || "{}",
    );
  } catch (e) {}

  // ---- Cookies: los clics de Google duran 90 días.
  function leerCookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m && m[1] ? decodeURIComponent(m[1]) : "";
  }
  ["gclid", "gbraid", "wbraid"].forEach(function (k) {
    if (!params.get(k)) return;
    var vence = new Date(Date.now() + 90 * 864e5).toUTCString();
    document.cookie = "google_" + k + "=" + encodeURIComponent(params.get(k)) + "; expires=" + vence + "; path=/; SameSite=Lax";
  });

  // ---- Tag Manager, después de pintar: los eventos de antes esperan en dataLayer.
  window.dataLayer = window.dataLayer || [];
  function cargarGTM() {
    if (cargarGTM.hecho) return;
    cargarGTM.hecho = true;
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtm.js?id=" + C.gtm;
    document.head.appendChild(s);
  }
  if (activo && C.gtm) {
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach(function (t) {
      window.addEventListener(t, cargarGTM, { capture: true, passive: true, once: true });
    });
    var luego = function () { setTimeout(cargarGTM, C.gtmRetraso || 8000); };
    if (document.readyState === "complete") luego(); else window.addEventListener("load", luego);
  }

  // ---- Un event_id por conversión, compartido entre el pixel y la API de conversiones.
  // Solo en memoria: al recargar, la conversión es otra.
  var ids = {};
  function eventId(nombre) { return ids[nombre] || (ids[nombre] = "ev-" + uuid()); }
  var fbcDeUrl = params.get("fbclid") ? "fb.1." + Date.now() + "." + params.get("fbclid") : "";
  function datosMeta() {
    return {
      meta_event_ids: JSON.stringify(ids),
      meta_fbp: leerCookie("_fbp"),
      meta_fbc: leerCookie("_fbc") || fbcDeUrl,
      meta_user_agent: navigator.userAgent,
    };
  }
  function conversion(nombre, formId, extra) {
    var ev = { event: "conversion", event_name: nombre, event_id: eventId(nombre), form_id: formId, form_name: formId };
    for (var k in extra || {}) if (extra[k] !== undefined && extra[k] !== "") ev[k] = extra[k];
    window.dataLayer.push(ev);
    return ev;
  }

  // ---- GHL: la visita y los registros van al mismo endpoint, con la misma sesión.
  function dispositivo() { return /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop"; }
  function mandar(evento) {
    registro.push(evento);
    if (!activo || !conGhl) {
      console.info("[seguimiento] " + (conGhl ? "apagado aquí (agrega ?seguimiento=1 para probar)" : "falta el Tracking ID o el Location ID") + ": " + (evento.formId || evento.type), evento);
      return Promise.resolve();
    }
    var cuerpo = new FormData();
    cuerpo.append("event", JSON.stringify(evento));
    return fetch(ENDPOINT, { method: "POST", headers: { version: "2021-07-28" }, body: cuerpo, keepalive: true })
      .then(function () {}, function () {});
  }
  function base(tipo) {
    return {
      type: tipo, timestamp: Date.now(), title: document.title,
      url: location.href, pageUrl: location.href, path: location.pathname, referrer: document.referrer,
      userAgent: navigator.userAgent, trackingId: C.trackingId, locationId: C.locationId, sessionId: sesion,
    };
  }
  if (activo) {
    var visita = base("external_script_page_view");
    visita.properties = { deviceType: dispositivo() };
    mandar(visita);
  }

  // ---- Los campos del formulario, con las claves que GHL reconoce.
  var ESTANDAR = [
    ["email", /^(e-?mail|correo|correo_?electronico|mail)$/i, /email/],
    ["phone", /^(phone|tel|telefono|teléfono|celular|movil|móvil|whatsapp|wa)$/i, /tel/],
    ["last_name", /^(last_?name|apellidos?)$/i, /family-name/],
    ["first_name", /^(first_?name|nombres?|name|full_?name|nombre_?completo|tu_?nombre)$/i, /given-name|^name$/],
    ["organization", /^(organization|company|company_?name|empresa|negocio|razon_?social)$/i, /organization/],
    ["city", /^(city|ciudad)$/i, /address-level2/],
    ["message", /^(message|mensaje|comentarios?|notas?)$/i, null],
  ];
  function claveEstandar(el) {
    var n = (el.name || "").replace(/[\s-]+/g, "_");
    var ac = el.getAttribute("autocomplete") || "";
    for (var i = 0; i < ESTANDAR.length; i++) {
      var e = ESTANDAR[i];
      if (e[1].test(n)) return e[0];
      if (e[2] && e[2].test(e[0] === "email" || e[0] === "phone" ? el.type + " " + ac : ac)) return e[0];
    }
    return "";
  }
  function limpio(t) { return String(t || "").replace(/\s*\((opcional|optional)\)/i, "").replace(/\s+/g, " ").trim().slice(0, 80); }
  function etiquetaDe(el) {
    var l = el.id && document.querySelector('label[for="' + el.id + '"]');
    if (!l && (el.type === "radio" || el.type === "checkbox")) {
      var fs = el.closest("fieldset");
      l = fs && fs.querySelector("legend");
    }
    if (!l) l = el.closest("label");
    return limpio((l && l.textContent) || el.getAttribute("aria-label") || el.placeholder || el.name);
  }
  function telefono(v) {
    var t = String(v || "").trim();
    var d = t.replace(/\D/g, "");
    var tel = C.telefono || { prefijo: "52", digitos: 10 };
    if (!d) return "";
    if (t.charAt(0) === "+") return d.length >= 8 ? "+" + d : "";
    if (d.length === tel.digitos) return "+" + tel.prefijo + d;
    if (d.length === tel.digitos + String(tel.prefijo).length && d.indexOf(tel.prefijo) === 0) return "+" + d;
    return d.length > tel.digitos ? "+" + d : "";
  }
  function correoValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim()); }

  function leer(form) {
    var datos = {}, etiquetas = {}, estandar = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || /^(submit|button|reset|file|password|image)$/.test(el.type)) return;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
      var v = typeof el.value === "string" ? el.value.trim() : "";
      if (!v) return;
      var k = claveEstandar(el) || el.name;
      if (claveEstandar(el)) estandar[k] = true;
      datos[k] = datos[k] ? datos[k] + ", " + v : v;
      if (!etiquetas[k]) etiquetas[k] = etiquetaDe(el);
    });
    // Un solo campo de nombre: la primera palabra es el nombre y el resto el apellido.
    if (datos.first_name && !datos.last_name && datos.first_name.indexOf(" ") > 0) {
      var partes = datos.first_name.split(/\s+/);
      datos.first_name = partes.shift();
      datos.last_name = partes.join(" ");
      etiquetas.last_name = "Apellido";
    }
    if (datos.phone) datos.phone = telefono(datos.phone);
    if (datos.email && !correoValido(datos.email)) delete datos.email;
    return { datos: datos, etiquetas: etiquetas, contacto: !!(datos.email || datos.phone) };
  }

  function registroDe(form, formId, nombre, leido) {
    var formData = {}, formLabels = {};
    function poner(k, v, etiqueta) {
      if (v === undefined || v === null || v === "") return;
      var clave = CAMPOS[k] || k;
      formData[clave] = v;
      formLabels[clave] = etiqueta || k;
    }
    Object.keys(leido.datos).forEach(function (k) { poner(k, leido.datos[k], leido.etiquetas[k]); });
    Object.keys(utms).forEach(function (k) { if (!leido.datos[k]) poner(k, utms[k], k); });
    var meta = datosMeta();
    Object.keys(meta).forEach(function (k) { poner(k, meta[k], k); });
    poner("first_google_click_id", params.get("gclid") || leerCookie("google_gclid"), "First Google Click ID");
    poner("first_google_gbraid", params.get("gbraid") || leerCookie("google_gbraid"), "First Google gbraid");
    poner("first_google_wbraid", params.get("wbraid") || leerCookie("google_wbraid"), "First Google wbraid");
    poner("pagina", location.pathname, "Página");
    var ev = base("external_form_submission");
    ev.formId = formId;
    ev.formData = formData;
    ev.formLabels = formLabels;
    ev.properties = { deviceType: dispositivo(), source: "vercel", formName: nombre, contactSource: formId, mediumId: formId };
    return ev;
  }
  function userData(d) {
    var u = {};
    if (d.email) u.email = d.email.toLowerCase();
    if (d.phone) u.phone_number = d.phone;
    return Object.keys(u).length ? u : undefined;
  }

  function infoDe(form) {
    var id = form.getAttribute("data-form-id");
    var f = FORMS[id] || {};
    return { id: id, nombre: f.nombre || id, parcial: f.parcial !== false, destino: form.getAttribute("data-destino") || f.destino || "", gracias: f.gracias };
  }

  // FormStart: la primera vez que alguien entra a un campo del formulario.
  document.addEventListener("focusin", function (e) {
    var form = e.target.closest && e.target.closest("form[data-form-id]");
    if (!form || form.__inicio) return;
    form.__inicio = true;
    conversion("FormStart", infoDe(form).id);
    delete ids.FormStart;
  }, true);

  // Parcial: al salir del correo o del teléfono ya válido, una vez por formulario.
  document.addEventListener("focusout", function (e) {
    var el = e.target;
    var form = el.closest && el.closest("form[data-form-id]");
    if (!form || form.__parcial || form.__enviado) return;
    var f = infoDe(form);
    if (!f.parcial) return;
    var k = claveEstandar(el);
    if (k !== "email" && k !== "phone") return;
    var leido = leer(form);
    if (!leido.contacto) return;
    form.__parcial = true;
    var idParcial = f.id + "-parcial";
    conversion("FormPartial", idParcial, { method: "form", pagina: location.pathname, user_data: userData(leido.datos) });
    mandar(registroDe(form, idParcial, f.nombre + " (parcial)", leido));
    delete ids.FormPartial;
  }, true);

  function esWhatsapp(u) { return /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\b|^whatsapp:/i.test(u || ""); }
  function esLocal(form) {
    var a = (form.getAttribute("action") || "").trim();
    if (!a || a === "#" || a.charAt(0) === "?") return true;
    try { var u = new URL(a, location.href); return u.origin === location.origin && u.pathname === location.pathname; } catch (e) { return false; }
  }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function gracias(form, texto) {
    form.setAttribute("data-estado", "enviado");
    form.reset();
    var p = form.querySelector(".seguimiento-gracias");
    if (!p) {
      p = document.createElement("p");
      p.className = "seguimiento-gracias";
      p.setAttribute("role", "status");
      p.setAttribute("tabindex", "-1");
      form.appendChild(p);
    }
    p.textContent = texto || "¡Gracias! Recibimos tus datos y te contactamos pronto.";
    p.focus();
  }

  // Envía el registro completo. Devuelve una promesa que nunca falla.
  function enviar(form, formIdForzado) {
    var f = infoDe(form);
    var id = formIdForzado || f.id;
    var leido = leer(form);
    if (!leido.contacto) return Promise.resolve(false);
    form.__enviado = true;
    conversion("Lead", id, { method: "form", pagina: location.pathname, user_data: userData(leido.datos) });
    var envio = mandar(registroDe(form, id, f.nombre, leido));
    delete ids.Lead;
    return envio.then(function () { return true; });
  }

  // Al enviar. Escucha después de los scripts del sitio: si el sitio ya se encarga
  // (preventDefault), solo se manda el registro; si no, este script lleva al destino o
  // deja el formulario en «enviado».
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;
    var accion = form.getAttribute("action") || "";
    if (esWhatsapp(accion)) {
      conversion("Contact", "whatsapp", { method: "whatsapp", pagina: location.pathname });
      delete ids.Contact;
    }
    if (!form.hasAttribute("data-form-id") || form.getAttribute("data-seguimiento") === "manual") return;
    var f = infoDe(form);
    // Un action externo con GET es un destino (se va sin los datos en la URL); con POST es
    // otro servicio que también recibe el formulario, y se deja ir.
    var externoGet = /^https?:\/\//i.test(accion) && !esLocal(form) && (form.getAttribute("method") || "get").toLowerCase() === "get";
    var propio = !e.defaultPrevented && !esWhatsapp(accion) && (esLocal(form) || externoGet || !!f.destino);
    if (propio) e.preventDefault();
    var valido = form.checkValidity() && !form.querySelector('[aria-invalid="true"]');
    if (!valido) { if (propio) form.reportValidity(); return; }
    if (form.__enviando) return;
    form.__enviando = true;
    setTimeout(function () { form.__enviando = false; }, 2000);
    var envio = enviar(form);
    if (!propio) return;
    // Destino: data-destino, el de la configuración o un action externo (sin los datos en la URL).
    var destino = f.destino || (externoGet ? accion : "");
    Promise.race([Promise.all([envio, esperar(600)]), esperar(1800)]).then(function () {
      if (destino) location.assign(destino);
      else gracias(form, f.gracias);
    });
  });

  // WhatsApp y teléfono: el evento Contact (para el pixel y GA4).
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    var metodo = esWhatsapp(href) ? "whatsapp" : /^tel:/i.test(href) ? "phone" : "";
    if (!metodo) return;
    conversion("Contact", metodo, { method: metodo, pagina: location.pathname });
    delete ids.Contact;
  }, true);

  // Para formularios que el sitio maneja a su manera (data-seguimiento="manual").
  window.Seguimiento = {
    activo: activo,
    sesion: sesion,
    enviar: function (form, formId) { return enviar(form, formId); },
    conversion: function (nombre, formId, extra) { var ev = conversion(nombre, formId, extra); delete ids[nombre]; return ev; },
  };
})();
