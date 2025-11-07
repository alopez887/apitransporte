import fetch from 'node-fetch';

// === ENV ===
const GAS_URL   = process.env.GAS_URL || '';
const GAS_TOKEN = process.env.GAS_TOKEN || '';
const EMAIL_DEBUG = String(process.env.EMAIL_DEBUG || '0') === '1';
const BCC_FALLBACK = process.env.EMAIL_BCC || 'nkmsistemas@gmail.com';
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
 * Adjuntos / inline
 * ========================= */
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
    data: base64,
    filename: 'qr.png',
    inline: true,
    cid: 'qrReserva',
    mimeType: 'image/png'
  };
}

/* =========================
 * Email principal
 * ========================= */
export async function enviarCorreoTransporte(datos){
  if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
    throw new Error('GAS_URL no configurado o inválido');
  }
  if (!GAS_TOKEN) throw new Error('GAS_TOKEN no configurado');

  const { code:lang, T } = pickLang(datos.idioma);
  const L = T.labels;

  const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';
  const img0    = sanitizeUrl(datos.imagen);
  const imgUrl  = img0 ? forceJpgIfWix(img0) : '';

  const tripType = (T.tripType[datos.tipo_viaje] || datos.tipo_viaje);
  const nota     = datos.nota || datos.cliente?.nota || '';
  const esShuttle= datos.tipo_viaje === 'Shuttle';

  const p = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;"><strong>${label}:</strong> ${value}</p>`;
  };

  const headerHTML = `
    <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation">
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

  // Bloque superior (datos generales)
  const blockTop = `
    <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation">
      <tr>
        <td style="vertical-align:top;width:48%;padding-right:10px;">
          ${p(L.name,  datos.nombre_cliente)}
          ${p(L.email, datos.correo_cliente)}
          ${p(L.phone, datos.telefono_cliente)}
          ${p(L.passengers, datos.cantidad_pasajeros || datos.pasajeros)}
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
  `.trim();

  // Llegada/Salida
  const sectionArrival = `
    ${p(L.hotel,   datos.hotel_llegada)}
    ${p(L.date,    datos.fecha_llegada)}
    ${p(L.time,    formatoHora12(datos.hora_llegada))}
    ${p(L.airline, datos.aerolinea_llegada)}
    ${p(L.flight,  datos.vuelo_llegada)}
  `.trim();

  const sectionDeparture = `
    ${p(L.hotel,   datos.hotel_salida)}
    ${p(L.date,    datos.fecha_salida)}
    ${p(L.time,    formatoHora12(datos.hora_salida))}
    ${p(L.airline, datos.aerolinea_salida)}
    ${p(L.flight,  datos.vuelo_salida)}
  `.trim();

  let infoBlock = '';
  if (datos.tipo_viaje === 'Redondo') {
    infoBlock = `
      <table style="width:100%;border-collapse:collapse;margin-top:6px;" role="presentation">
        <tr>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.arrivalInfo}</th>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.departureInfo}</th>
        </tr>
        <tr>
          <td style="vertical-align:top;padding-right:15px;width:48%;">${sectionArrival}</td>
          <td style="vertical-align:top;width:48%;">${sectionDeparture}</td>
        </tr>
      </table>
    `.trim();
  } else if (datos.tipo_viaje === 'Llegada' || datos.tipo_viaje === 'Shuttle') {
    infoBlock = `
      <div style="margin-top:8px;">${p(L.arrivalInfo, '')}</div>
      <div>${sectionArrival}</div>
    `.trim();
  } else if (datos.tipo_viaje === 'Salida') {
    infoBlock = `
      <div style="margin-top:8px;">${p(L.departureInfo, '')}</div>
      <div>${sectionDeparture}</div>
    `.trim();
  }

  const qrLegend = `
    <div style="margin-top:18px;">
      <p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;"><strong>${L.qrLegend}</strong></p>
      <img src="cid:qrReserva" alt="QR" style="height:140px;width:140px;display:block;border:1px solid #ddd;border-radius:8px;padding:6px;background:#fff"/>
    </div>
  `.trim();

  const imageBlock = imgUrl
    ? `<div style="margin-top:18px;"><img src="${imgUrl}" alt="Transport" style="max-width:100%;border-radius:8px;display:block"/></div>`
    : '';

  const sentTo = `
    <p style="margin-top:12px;color:#555;font-size:13px;font-family:Arial,Helvetica,sans-serif;">
      ${L.sentTo} <strong>${datos.correo_cliente}</strong>
    </p>
  `.trim();

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.45;">
      ${headerHTML}
      ${blockTop}
      ${infoBlock}
      ${qrLegend}
      ${imageBlock}
      ${T.policiesHTML}
      ${sentTo}
    </div>
  `.trim();

  const subject = T.subject(datos.folio);

  const atts = [];
  const qrAtt = buildQrAttachmentTransporte(datos.qr);
  if (qrAtt) atts.push(qrAtt);

  // Logo como inline
  atts.push({
    url: logoUrl,
    filename: 'logo.png',
    inline: true,
    cid: 'logoEmpresa'
  });

  const payload = {
    token:  GAS_TOKEN,
    ts:     Date.now(),
    subject,
    html,
    text: '',                 // lo genera el GAS si va vacío (de html)
    to:   [datos.correo_cliente],
    cc:   [],
    bcc:  [BCC_FALLBACK],
    fromName: 'Cabo Travel Solutions',
    replyTo:  '',
    attachments: atts
  };

  DBG('→ GAS payload (min) idioma=', datos.idioma, 'to=', datos.correo_cliente);

  const { status, json } = await postJSON(GAS_URL, payload, 15000);
  if (status >= 400 || json?.ok === false) {
    const code = json?.code || status;
    const msg  = json?.error || `GAS error ${status}`;
    throw Object.assign(new Error(`Error al enviar correo: ${msg}`), { code, detail: json });
  }

  DBG('✔ correo enviado, quotaRemaining=', json?.quotaRemaining);
  return true;
}
