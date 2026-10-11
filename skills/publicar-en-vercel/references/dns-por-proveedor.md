# El dominio: registros DNS por proveedor

`dominio.mjs <dominio>` agrega el dominio al proyecto, detecta quién maneja el DNS (por sus
nameservers) y dice qué registros poner. Aquí están los pasos en cada proveedor, para
dárselos al alumno uno por uno. **Él los hace en su cuenta; tú no entras.**

## Los dos registros

| Tipo | Nombre | Valor |
|---|---|---|
| `A` | `@` (el dominio solo) | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

- **Si ya existe un registro A en `@` o un CNAME en `www`, se cambia su valor.** No se agrega
  otro: dos registros A, uno viejo y uno de Vercel, hacen que el sitio aparezca y desaparezca.
- **Vercel puede mostrar valores más nuevos** en su panel (`216.198.79.1` y
  `<algo>.vercel-dns-0xx.com`). Los dos juegos funcionan.
- **Un registro `AAAA` en `@` o en `www`** (IPv6, del proveedor anterior) hay que borrarlo:
  Vercel no lo usa y algunos visitantes llegarían al sitio viejo. Pregúntale al alumno antes.

## Lo que nunca se toca

- **Los MX:** el correo del dominio. Si se borran, deja de llegar el correo.
- **Los TXT:** SPF, DKIM, DMARC y las verificaciones de Google, Meta o GHL.
- **Los demás subdominios**, sobre todo los CNAME que apuntan a GHL: `link`, `app`,
  `calendario`, `mail`… Son los dominios de sus formularios, calendarios y correos de
  HighLevel. En el piloto, `link.zynapze.ai` siguió apuntando a GHL.

**Antes de cambiar nada, que el alumno tome una captura de sus registros.** Si algo sale
mal, se regresa a los valores de antes.

## Cloudflare

1. Entra a dash.cloudflare.com, elige el dominio y abre **DNS → Records**.
2. **El registro A del dominio** (nombre igual al dominio, o `@`): **Edit**. En
   IPv4 address pon `76.76.21.21`.
3. **Proxy status en «DNS only»** (nube gris), no «Proxied» (nube naranja). Con la nube
   naranja, Vercel no puede crear el certificado y el sitio falla.
4. **Save.**
5. **El de `www`:** si es un CNAME, **Edit** y en Target pon `cname.vercel-dns.com`. Si es
   un A, bórralo y crea un CNAME con ese valor. También en «DNS only».
6. **Save.**

Suele propagar en minutos.

## GoDaddy

1. Entra a godaddy.com, abre **Mi cuenta → Mis productos → Dominios**. En tu dominio, toca
   **DNS** (o «Administrar DNS»).
2. **El registro A con nombre `@`:** el lápiz. En Valor pon `76.76.21.21`.
   - Si dice «Parked» o hay un reenvío (Forwarding) del dominio, quítalo primero.
3. **Guardar.**
4. **El CNAME `www`:** cambia el Valor a `cname.vercel-dns.com`. Si apunta a `@`, también se
   cambia.
5. **Guardar.**

Puede tardar hasta una hora.

## Hostinger

1. Entra a hpanel.hostinger.com, abre **Dominios**, elige el dominio y toca **DNS / Nameservers**.
2. **El registro A `@`:** **Editar**, Apunta a `76.76.21.21`, **Actualizar**.
   - Si hay dos registros A en `@`, deja solo ese.
3. **El CNAME `www`:** **Editar**, Apunta a `cname.vercel-dns.com`, **Actualizar**.
4. **Si el dominio tenía un sitio de Hostinger**, el panel puede volver a poner sus
   registros. Desconecta el sitio del dominio en **Sitios web**.

## Namecheap

1. Entra a namecheap.com, abre **Domain List** y toca **Manage** en el dominio.
2. En la pestaña **Advanced DNS**, busca el **A Record** con Host `@`.
   - Si no hay, **Add New Record**.
3. Value `76.76.21.21`, y la palomita verde para guardar.
4. **El CNAME Record** con Host `www`: Value `cname.vercel-dns.com`.
5. **Borra el «URL Redirect Record» de `@`**, si lo hay: choca con el registro A.

## Squarespace (antes Google Domains)

1. Entra a account.squarespace.com/domains, elige el dominio y abre **DNS → DNS Settings**.
2. **En «Custom records»**, cambia o agrega el registro A con Host `@` y Data `76.76.21.21`.
3. **El CNAME `www`** con Data `cname.vercel-dns.com`.
4. **Si hay «Squarespace Defaults»** y el dominio ya no tiene sitio de Squarespace, bórralos:
   apuntan `@` y `www` a Squarespace.

## Wix

1. Entra a wix.com, abre **Dominios**, toca los tres puntos del dominio y luego **Administrar
   registros DNS**.
2. **En «A (Host)»**, edita el de `@` (el dominio): `76.76.21.21`.
3. **En «CNAME (Aliases)»**, el de `www`: `cname.vercel-dns.com`.
4. **Si el dominio estaba conectado a un sitio de Wix**, primero desconéctalo del sitio. Si
   no, Wix vuelve a poner sus valores.

## El dominio está en GoHighLevel, o en otro proveedor

- **Si los nameservers son de un proveedor que no está aquí** (Akky, Neubox, IONOS,
  HostGator…), los nombres cambian pero los pasos son los mismos: busca «DNS», «Zona DNS» o
  «Administrar DNS», y cambia el A de `@` y el CNAME de `www`.
- **Si el alumno compró el dominio dentro de GHL**, su DNS está en *Settings → Domains*: ahí
  se editan los registros. No borres los de GHL que ya están (`link`, verificaciones).

## Revisar

`node dominio.mjs --revisar` comprueba:

- que el dominio y `www` apunten a Vercel, según los DNS de Cloudflare y Google, no los de
  la computadora;
- el certificado;
- que `www` lleve al dominio y que `http` lleve a `https`;
- que el dominio **no** lleve `noindex`.

Si el DNS ya está bien y falla el certificado, espera unos minutos y vuelve a revisar:
Vercel lo crea solo.

**Para regresar al sitio anterior**, se ponen los valores de la captura de antes.
