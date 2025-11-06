// correosTransporte.js — Envío vía Google Apps Script WebApp (sin SMTP) + QR inline (cid: qrReserva)
// i18n ES/EN según datos.idioma ('es'|'en'); default 'en'

import dotenv from 'dotenv';
dotenv.config();

const GAS_URL        = process.env.GAS_URL;                 // https://script.google.com/macros/s/XXXX/exec
const GAS_TOKEN      = process.env.GAS_TOKEN;               // SECRET en Script Properties
const GAS_TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 15000);
const MAIL_FAST_MODE = /^(1|true|yes)$/i.test(process.env.MAIL_FAST_MODE || '');
const EMAIL_DEBUG    = /^(1|true|yes)$/i.test(process.env.EMAIL_DEBUG || '');
const EMAIL_FROMNAME = process.env.EMAIL_FROMNAME || 'Cabo Travel Solutions';
const EMAIL_BCC      = process.env.EMAIL_BCC || 'nkmsistemas@gmail.com';
const DBG = (...a) => { if (EMAIL_DEBUG) console.log('[MAIL]', ...a); };

/* =========================
 * Utilidades
 * ========================= */
function sanitizeUrl(u = '') {
  try {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch { return ''; }
}
// Forzar JPG en Wix para evitar WEBP en clientes (Outlook, etc.)
function forceJpgIfWix(url='') {
  try {
    const u = new URL(url);
    if (/wixstatic\.com$/i.test(u.hostname)) {
      if (!u.searchParams.has('format')) u.searchParams.set('format','jpg');
      if (!u.searchParams.has('width'))  u.searchParams.set('width','1200');
      return u.toString();
    }
  } catch {}
  return url;
}
// POST JSON con timeout
async function postJSON(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }, // 👈 fuerza UTF-8
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally { clearTimeout(id); }
}
const safeToFixed = (v)=>{ const n=Number(v); return isNaN(n)?'0.00':n.toFixed(2); };
function formatoHora12(hora){
  if(!hora) return '';
  const [h,m] = String(hora).split(':');
  const H = parseInt(h,10); const suf = H>=12?'p.m.':'a.m.'; const h12 = (H%12)||12;
  return `${h12}:${m} ${suf}`;
}

/* =========================
 * i18n
 * ========================= */
const TXT = {
  en: {
    subject:     (folio)=>`Transport Reservation - Folio ${folio}`,
    header_ok:   '✅ Transport Reservation Confirmed',
    labels: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      passengers: 'Passengers',
      note: 'Note',
      folio: 'Folio',
      transport: 'Transport',
      capacity: 'Capacity',
      total: 'Total',
      tripType: 'Trip Type',
      hotel: 'Hotel',
      date: 'Date',
      time: 'Time',
      airline: 'Airline',
      flight: 'Flight',
      arrivalInfo: 'Arrival Information',
      departureInfo: 'Departure Information',
      qrLegend: 'Show this QR code to your provider:',
      sentTo: 'This confirmation was sent to:',
      recommendationsTitle: '⚠ Recommendations:',
      recommendationsText: ' Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.'
    },
    policiesHTML: `
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
        <strong>&#128204; Cancellation Policy:</strong><br>
        - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
        <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
      </div>
    `,
    tripType: { Llegada:'Arrival', Salida:'Departure', Redondo:'Round Trip', Shuttle:'Shuttle' }
  },
  es: {
    subject:     (folio)=>`Confirmación de Transporte - Folio ${folio}`,
    header_ok:   '✅ Reservación de Transporte Confirmada',
    labels: {
      name: 'Nombre',
      email: 'Correo',
      phone: 'Teléfono',
      passengers: 'Pasajeros',
      note: 'Nota',
      folio: 'Folio',
      transport: 'Transporte',
      capacity: 'Capacidad',
      total: 'Total',
      tripType: 'Tipo de viaje',
      hotel: 'Hotel',
      date: 'Fecha',
      time: 'Hora',
      airline: 'Aerolínea',
      flight: 'Vuelo',
      arrivalInfo: 'Información de Llegada',
      departureInfo: 'Información de Salida',
      qrLegend: 'Muestra este código QR a tu proveedor:',
      sentTo: 'Esta confirmación fue enviada a:',
      recommendationsTitle: '⚠ Recomendaciones:',
      recommendationsText: ' Por favor confirma tu reservación con al menos 24 horas de anticipación para evitar contratiempos.'
    },
    policiesHTML: `
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
        <strong>&#128204; Políticas de cancelación:</strong><br>
        - Toda cancelación o solicitud de reembolso está sujeta a una penalización del 10% del monto pagado.<br>
        <strong>- No hay reembolsos por cancelaciones con menos de 24 horas de anticipación o por inasistencias (no-show).</strong>
      </div>
    `,
    tripType: { Llegada:'Llegada', Salida:'Salida', Redondo:'Viaje Redondo', Shuttle:'Shuttle' }
  }
};
function pickLang(idioma){
  const code = (String(idioma||'en').toLowerCase().startsWith('es')) ? 'es' : 'en';
  return { code, T: TXT[code] };
}

/* =========================
 * QR helpers
 * ========================= */
/** Devuelve solo BASE64 canónico (sin encabezado data URL, sin espacios). */
function normalizeQrBase64(qr) {
  if (!qr) return '';
  let s = String(qr).trim();
  if (s.startsWith('data:')) {
    const idx = s.indexOf(',');
    if (idx >= 0) s = s.slice(idx + 1);
  }
  s = s.replace(/\s+/g,'').replace(/[^A-Za-z0-9+/=]/g,'');
  const mod = s.length % 4;
  if (mod === 1) return '';
  if (mod === 2) s += '==';
  else if (mod === 3) s += '=';
  return s;
}
function buildQrAttachmentTransporte(qr) {
  const base64 = normalizeQrBase64(qr);
  if (!base64) return null;
  return {
    data: base64,               // 👈 SOLO base64 (sin "data:image/...;base64,")
    filename: 'qr.png',
    inline: true,
    cid: 'qrReserva',           // 👈 CID que usa el HTML
    mimeType: 'image/png'
  };
}

/* ===============================================================
 *                       ENVÍO PRINCIPAL
 * =============================================================== */
async function enviarCorreoTransporte(datos){
  try{
    if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
      throw new Error('GAS_URL no configurado o inválido');
    }
    if (!GAS_TOKEN) throw new Error('GAS_TOKEN no configurado');

    // Idioma
    const { code:lang, T } = pickLang(datos.idioma);

    const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';
    const img0    = sanitizeUrl(datos.imagen);
    const imgUrl  = img0 ? forceJpgIfWix(img0) : '';

    const tripTypeMap = T.tripType; // por idioma
    const tripType    = tripTypeMap[datos.tipo_viaje] || datos.tipo_viaje;
    const nota        = datos.nota || datos.cliente?.nota || '';
    const esShuttle   = datos.tipo_viaje === 'Shuttle';

    // Header (h2 izq + logo der)
    const headerHTML = `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="text-align:left;vertical-align:middle;">
            <h2 style="color:green;margin:0;font-family:Arial,Helvetica,sans-serif;">${T.header_ok}</h2>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <img src="cid:logoEmpresa" alt="Logo" style="height:45px;display:block;" />
          </td>
        </tr>
      </table>
    `.trim();

    const L = T.labels;
    const p = (label, value) => {
      if (value === undefined || value === null || String(value).trim() === '') return '';
      return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;"><strong>${label}:</strong> ${value}</p>`;
    };

    let cuerpoHTML = '';
    if (datos.tipo_viaje === 'Redondo') {
      cuerpoHTML += `
        <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;width:48%;padding-right:10px;">
              ${p(L.name,  datos.nombre_cliente)}
              ${p(L.email, datos.correo_cliente)}
              ${p(L.phone, datos.telefono_cliente)}
              ${p(L.passengers, datos.cantidad_pasajeros)}
              ${nota && nota.trim() !== '' ? p(L.note, nota) : ''}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p(L.folio, datos.folio)}
              ${!esShuttle ? p(L.transport, datos.tipo_transporte) : ''}
              ${!esShuttle ? p(L.capacity,  datos.capacidad) : ''}
              ${p(L.tripType, tripType)}
              ${p(L.total, `$${safeToFixed(datos.total_pago)} USD`)}
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:6px;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.arrivalInfo}</th>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.departureInfo}</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-right:15px;width:48%;">
              ${p(L.hotel,   datos.hotel_llegada)}
              ${p(L.date,    datos.fecha_llegada)}
              ${p(L.time,    formatoHora12(datos.hora_llegada))}
              ${p(L.airline, datos.aerolinea_llegada)}
              ${p(L.flight,  datos.vuelo_llegada)}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p(L.hotel,   datos.hotel_salida)}
              ${p(L.date,    datos.fecha_salida)}
              ${p(L.time,    formatoHora12(datos.hora_salida))}
              ${p(L.airline, datos.aerolinea_salida)}
              ${p(L.flight,  datos.vuelo_salida)}
            </td>
          </tr>
        </table>
      `.trim();
    } else {
      cuerpoHTML += `
        ${p(L.folio, datos.folio)}
        ${p(L.name,  datos.nombre_cliente)}
        ${p(L.email, datos.correo_cliente)}
        ${p(L.phone, datos.telefono_cliente)}
        ${!esShuttle ? p(L.transport, datos.tipo_transporte) : ''}
        ${!esShuttle ? p(L.capacity,  datos.capacidad) : ''}
        ${(datos.cantidad_pasajeros || datos.pasajeros) ? p(L.passengers, (datos.cantidad_pasajeros || datos.pasajeros)) : ''}
        ${datos.hotel_llegada   ? p(L.hotel, datos.hotel_llegada) : ''}
        ${datos.fecha_llegada   ? p(L.date,  datos.fecha_llegada) : ''}
        ${datos.hora_llegada    ? p(L.time,  formatoHora12(datos.hora_llegada)) : ''}
        ${datos.aerolinea_llegada ? p(L.airline, datos.aerolinea_llegada) : ''}
        ${datos.vuelo_llegada   ? p(L.flight, datos.vuelo_llegada) : ''}
        ${p(L.tripType, tripType)}
        ${p(L.total, `$${safeToFixed(datos.total_pago)} USD`)}
        ${nota && nota.trim() !== '' ? p(L.note, nota) : ''}
      `.trim();
    }

    const imagenHTML = imgUrl ? `
      <!-- Imagen principal -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
        <tr>
          <td>
            <img src="cid:imagenTransporte" width="400" alt="Transport image"
                 style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    const qrAttachment = buildQrAttachmentTransporte(datos.qr);
    const qrHTML = qrAttachment ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">
        <tr>
          <td align="center">
            <p style="font-weight:bold;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">${L.qrLegend}</p>
            <img src="cid:qrReserva" alt="QR Code" style="width:180px;display:block;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    const recomendacionesHTML = `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">${T.labels.recommendationsTitle}</strong>
        <span style="color:#333;">${T.labels.recommendationsText}</span>
      </div>
    `;

    const destinatarioHTML = `
      <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
        &#128231; ${T.labels.sentTo}
        <a href="mailto:${datos.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente}</a>
      </p>
    `;

    const mensajeInner = `
      ${headerHTML}
      <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
        ${cuerpoHTML}
        ${imagenHTML}
        ${qrHTML}
        ${recomendacionesHTML}
        ${destinatarioHTML}
        ${T.policiesHTML}
      </div>
    `.trim();

    // Wrapper 600px centrado (tabla), borde 2px, radius 10, padding 24/26/32 (calcado)
    const mensajeHTML = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:0;margin:0;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                   style="width:600px;max-width:600px;border:2px solid #ccc;border-radius:10px;border-collapse:separate;">
              <tr>
                <td style="padding:24px 26px 32px;border-radius:10px;">
                  ${mensajeInner}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `.trim();

    // Adjuntos (inline por CID)
    const attachments = [
      { url: 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png', filename: 'logo.png', inline: true, cid: 'logoEmpresa' }
    ];
    if (imgUrl) attachments.push({ url: imgUrl, filename: 'transporte.jpg', inline: true, cid: 'imagenTransporte' });
    if (qrAttachment) attachments.push(qrAttachment);

    const payload = {
      token: GAS_TOKEN,
      ts: Date.now(),
      to: datos.correo_cliente,
      bcc: EMAIL_BCC,
      subject: T.subject(datos.folio || ''),
      html: mensajeHTML,
      fromName: EMAIL_FROMNAME,
      attachments
    };

    DBG('POST → GAS', { to: datos.correo_cliente, subject: payload.subject, hasQR: !!qrAttachment, lang });

    if (MAIL_FAST_MODE) {
      postJSON(GAS_URL, payload, GAS_TIMEOUT_MS).catch(err => console.error('Error envío async GAS:', err.message));
      return true;
    }

    const { status, json } = await postJSON(GAS_URL, payload, GAS_TIMEOUT_MS);
    if (!json || json.ok !== true) {
      throw new Error(`Error al enviar correo: ${(json && json.error) || status}`);
    }

    DBG('✔ GAS ok:', json);
    return true;
  } catch (err) {
    console.error('❌ Error al enviar correo de transporte (GAS):', err.message);
    throw err;
  }
}

export { enviarCorreoTransporte };
export default enviarCorreoTransporte;
