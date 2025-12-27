// correosTransporte.js — Envío vía Google Apps Script WebApp (sin SMTP) + QR inline (cid: qrReserva)
import dotenv from 'dotenv';
dotenv.config();

const GAS_URL         = (process.env.GAS_URL || '').trim();  // https://script.google.com/macros/s/XXXX/exec
const GAS_TOKEN       = (process.env.GAS_TOKEN || '').trim(); // SECRET en Script Properties
const GAS_TIMEOUT_MS  = Number(process.env.GAS_TIMEOUT_MS || 15000);

// ⚠️ Recomendación: para COMPRA deja esto apagado (si lo enciendes, no hay confirmación real)
const MAIL_FAST_MODE  = /^(1|true|yes)$/i.test(process.env.MAIL_FAST_MODE || '');

const EMAIL_DEBUG     = /^(1|true|yes)$/i.test(process.env.EMAIL_DEBUG || '');
const EMAIL_FROMNAME  = process.env.EMAIL_FROMNAME || 'Cabo Travel Solutions';
const EMAIL_BCC       = process.env.EMAIL_BCC || 'nkcts.notyfi@gmail.com';

const DBG = (...a) => { if (EMAIL_DEBUG) console.log('[MAIL][transporte]', ...a); };

// ---------- Utilidades ----------
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

// POST JSON con timeout (fetch nativo Node 18)
// ✅ más robusto: intenta parsear JSON, si no puede guarda raw
async function postJSON(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });

    const raw = await res.text();
    let json = {};
    try { json = JSON.parse(raw); } catch { json = { ok:false, raw }; }

    return { status: res.status, json, raw };
  } finally {
    clearTimeout(id);
  }
}

// ---------- Formateos ----------
const safeToFixed = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function formatoHora12(hora){
  if(!hora) return '';
  const [h,m] = String(hora).split(':');
  const H = parseInt(h,10); if (!Number.isFinite(H)) return String(hora);
  const suf = H>=12 ? 'p.m.' : 'a.m.';
  const h12 = (H%12)||12;
  return `${h12}:${m} ${suf}`;
}

function formatCurrency(monto, moneda) {
  const val = safeToFixed(monto);
  return `$${val} ${moneda === 'MXN' ? 'MXN' : 'USD'}`;
}

function normTrip(v){
  const s = String(v || '').trim().toLowerCase();
  // tus valores reales vienen a veces como 'llegada'/'salida'/'shuttle'/'redondo'
  if (s === 'llegada') return 'llegada';
  if (s === 'salida')  return 'salida';
  if (s === 'shuttle') return 'shuttle';
  if (s === 'redondo' || s === 'roundtrip' || s === 'round trip') return 'redondo';
  return s || '';
}

// ---------- i18n (textos, SIN cambiar diseño) ----------
// ✅ Todo en unicode escapes para evitar encoding roto en Windows/Notepad++
function pickLang(idioma){
  const es = String(idioma||'').toLowerCase().startsWith('es');

  if (es) {
    return {
      code: 'es',
      header_ok: '\u2705 Reservaci\u00f3n de Transporte Confirmada',
      labels: {
        name:'Nombre', email:'Correo', phone:'Tel\u00e9fono', passengers:'Pasajeros', note:'Nota',
        folio:'Folio', transport:'Transporte', capacity:'Capacidad', total:'Total',
        tripType:'Tipo de viaje', hotel:'Hotel', date:'Fecha', time:'Hora',
        airline:'Aerol\u00ednea', flight:'Vuelo',
        arrivalInfo:'Informaci\u00f3n de Llegada', departureInfo:'Informaci\u00f3n de Salida',
        qrLegend:'Muestra este c\u00f3digo QR a tu proveedor:',
        sentTo:'Esta confirmaci\u00f3n fue enviada a:'
      },
      tripType: {
        llegada:'Llegada',
        salida:'Salida',
        redondo:'Viaje Redondo',
        shuttle:'Shuttle'
      },
      recomendaciones: `
        <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
          <strong style="color:#b00000;">\u26a0 Recomendaciones:</strong>
          <span style="color:#333;"> Por favor confirma tu reservaci\u00f3n con al menos 24 horas de anticipaci\u00f3n para evitar contratiempos.</span>
        </div>
      `,
      politicas: `
        <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
          <strong>&#128204; Pol\u00edticas de cancelaci\u00f3n:</strong><br>
          - Toda cancelaci\u00f3n o solicitud de reembolso est\u00e1 sujeta a una penalizaci\u00f3n del 10% del monto pagado.<br>
          <strong>- No hay reembolsos por cancelaciones con menos de 24 horas de anticipaci\u00f3n o por inasistencias (no-show).</strong>
        </div>
      `,
      // ✅ subject con escapes (sin depender de encoding del archivo)
      subject: (folio)=>`Confirmaci\u00f3n de Transporte - Folio ${folio || '\u2014'}`
    };
  }

  return {
    code: 'en',
    header_ok: '\u2705 Transport Reservation Confirmed',
    labels: {
      name:'Name', email:'Email', phone:'Phone', passengers:'Passengers', note:'Note',
      folio:'Folio', transport:'Transport', capacity:'Capacity', total:'Total',
      tripType:'Trip Type', hotel:'Hotel', date:'Date', time:'Time',
      airline:'Airline', flight:'Flight',
      arrivalInfo:'Arrival Information', departureInfo:'Departure Information',
      qrLegend:'Show this QR code to your provider:',
      sentTo:'This confirmation was sent to:'
    },
    tripType: {
      llegada:'Arrival',
      salida:'Departure',
      redondo:'Round Trip',
      shuttle:'Shuttle'
    },
    recomendaciones: `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">\u26a0 Recommendations:</strong>
        <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
      </div>
    `,
    politicas: `
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
        <strong>&#128204; Cancellation Policy:</strong><br>
        - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
        <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
      </div>
    `,
    subject: (folio)=>`Transport Reservation - Folio ${folio || '\u2014'}`
  };
}

// ---------- QR: normalización y adjunto ----------
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

// ===============================================================
//                       ENVÍO PRINCIPAL (diseño intacto)
// ===============================================================
async function enviarCorreoTransporte(datos){
  try{
    if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
      throw new Error('GAS_URL no configurado o inv\u00e1lido');
    }
    if (!GAS_TOKEN) throw new Error('GAS_TOKEN no configurado');

    const L = pickLang(datos.idioma);
    const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

    const img0    = sanitizeUrl(datos.imagen);
    const imgUrl  = img0 ? forceJpgIfWix(img0) : '';

    const tripNorm = normTrip(datos.tipo_viaje);
    const tripType = (L.tripType[tripNorm] || datos.tipo_viaje || '');

    const nota     = (datos.nota || datos.cliente?.nota || '').toString();
    const esShuttle= tripNorm === 'shuttle';

    // Transporte según idioma
    const catEN = String((datos.categoria ?? datos.nombreEN) || '').trim();
    const catES = String((datos.categoria_es ?? datos.nombreES) || '').trim();
    const categoria_i18n = (L.code === 'es')
      ? (catES || catEN || datos.tipo_transporte || '')
      : (catEN || catES || datos.tipo_transporte || '');

    // Moneda y monto a mostrar
    const moneda = (String(
      datos.moneda || datos.moneda_cobro_real || datos.moneda_cobro || 'USD'
    ).toUpperCase() === 'MXN') ? 'MXN' : 'USD';

    const totalMostrar = Number(
      Number.isFinite(datos.total_cobrado) ? datos.total_cobrado : datos.total_pago
    ) || 0;

    // Header (h2 izq + logo der)
    const headerHTML = `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="text-align:left;vertical-align:middle;">
            <h2 style="color:green;margin:0;font-family:Arial,Helvetica,sans-serif;">${L.header_ok}</h2>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <img src="cid:logoEmpresa" alt="Logo" style="height:45px;display:block;" />
          </td>
        </tr>
      </table>
    `.trim();

    const p = (label, value) => {
      if (value === undefined || value === null || String(value).trim() === '') return '';
      return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;"><strong>${label}:</strong> ${value}</p>`;
    };

    let cuerpoHTML = '';

    // ✅ roundtrip (redondo) = 2 columnas
    if (tripNorm === 'redondo' || String(datos.tipo_viaje || '').toLowerCase() === 'redondo') {
      cuerpoHTML += `
        <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;width:48%;padding-right:10px;">
              ${p(L.labels.name,  datos.nombre_cliente)}
              ${p(L.labels.email, datos.correo_cliente)}
              ${p(L.labels.phone, datos.telefono_cliente)}
              ${p(L.labels.passengers, datos.cantidad_pasajeros || datos.pasajeros)}
              ${nota && nota.trim() !== '' ? p(L.labels.note, nota) : ''}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p(L.labels.folio, datos.folio)}
              ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
              ${!esShuttle ? p(L.labels.capacity,  datos.capacidad) : ''}
              ${p(L.labels.tripType, tripType)}
              ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:6px;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.labels.arrivalInfo}</th>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.labels.departureInfo}</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-right:15px;width:48%;">
              ${p(L.labels.hotel,   datos.hotel_llegada)}
              ${p(L.labels.date,    datos.fecha_llegada)}
              ${p(L.labels.time,    formatoHora12(datos.hora_llegada))}
              ${p(L.labels.airline, datos.aerolinea_llegada)}
              ${p(L.labels.flight,  datos.vuelo_llegada)}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p(L.labels.hotel,   datos.hotel_salida)}
              ${p(L.labels.date,    datos.fecha_salida)}
              ${p(L.labels.time,    formatoHora12(datos.hora_salida))}
              ${p(L.labels.airline, datos.aerolinea_salida)}
              ${p(L.labels.flight,  datos.vuelo_salida)}
            </td>
          </tr>
        </table>
      `.trim();
    } else {
      // ✅ 1 columna (llegada/salida/shuttle)
      cuerpoHTML += `
        ${p(L.labels.folio, datos.folio)}
        ${p(L.labels.name,  datos.nombre_cliente)}
        ${p(L.labels.email, datos.correo_cliente)}
        ${p(L.labels.phone, datos.telefono_cliente)}
        ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
        ${!esShuttle ? p(L.labels.capacity,  datos.capacidad) : ''}
        ${(datos.cantidad_pasajeros || datos.pasajeros) ? p(L.labels.passengers, (datos.cantidad_pasajeros || datos.pasajeros)) : ''}

        ${datos.hotel_llegada ? p(L.labels.hotel,   datos.hotel_llegada) : ''}
        ${datos.fecha_llegada ? p(L.labels.date,    datos.fecha_llegada) : ''}
        ${datos.hora_llegada  ? p(L.labels.time,    formatoHora12(datos.hora_llegada)) : ''}
        ${datos.aerolinea_llegada ? p(L.labels.airline, datos.aerolinea_llegada) : ''}
        ${datos.vuelo_llegada ? p(L.labels.flight,  datos.vuelo_llegada) : ''}

        ${datos.hotel_salida ? p(L.labels.hotel,   datos.hotel_salida) : ''}
        ${datos.fecha_salida ? p(L.labels.date,    datos.fecha_salida) : ''}
        ${datos.hora_salida  ? p(L.labels.time,    formatoHora12(datos.hora_salida)) : ''}
        ${datos.aerolinea_salida ? p(L.labels.airline, datos.aerolinea_salida) : ''}
        ${datos.vuelo_salida ? p(L.labels.flight,  datos.vuelo_salida) : ''}

        ${p(L.labels.tripType, tripType)}
        ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
        ${nota && nota.trim() !== '' ? p(L.labels.note, nota) : ''}
      `.trim();
    }

    const imagenHTML = imgUrl ? `
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
            <p style="font-weight:bold;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">${L.labels.qrLegend}</p>
            <img src="cid:qrReserva" alt="QR Code" style="width:180px;display:block;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    const destinatarioHTML = `
      <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
        &#128231; ${L.labels.sentTo}
        <a href="mailto:${datos.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente}</a>
      </p>
    `;

    const mensajeInner = `
      ${headerHTML}
      <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
        ${cuerpoHTML}
        ${imagenHTML}
        ${qrHTML}
        ${L.recomendaciones}
        ${destinatarioHTML}
        ${L.politicas}
      </div>
    `.trim();

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
      { url: logoUrl, filename: 'logo.png', inline: true, cid: 'logoEmpresa' }
    ];
    if (imgUrl) attachments.push({ url: imgUrl, filename: 'transporte.jpg', inline: true, cid: 'imagenTransporte' });
    if (qrAttachment) attachments.push(qrAttachment);

    // ✅ IMPORTANTÍSIMO: manda idioma + folio al GAS para fallback/diagnóstico
    const payload = {
      token: GAS_TOKEN,
      ts: Date.now(),

      // fallback helpers del GAS
      idioma: L.code,
      folio: String(datos.folio || '').trim(),
      folio_reservacion: String(datos.folio || '').trim(),

      to: String(datos.correo_cliente || '').trim(),
      bcc: EMAIL_BCC,
      subject: L.subject(datos.folio),
      html: mensajeHTML,
      fromName: EMAIL_FROMNAME,
      attachments
    };

    DBG('POST → GAS', {
      to: payload.to,
      subject: payload.subject,
      hasQR: !!qrAttachment,
      moneda,
      totalMostrar,
      fast: MAIL_FAST_MODE
    });

    // ⚠️ Para compra, lo ideal es NO fast mode
    if (MAIL_FAST_MODE) {
      // En fast mode NO puedes afirmar "enviado" con certeza
      postJSON(GAS_URL, payload, GAS_TIMEOUT_MS)
        .then(({ status, json }) => DBG('FAST GAS resp:', status, json?.ok))
        .catch(err => console.error('Error env\u00edo async GAS:', err.message));
      return true;
    }

    const { status, json, raw } = await postJSON(GAS_URL, payload, GAS_TIMEOUT_MS);
    if (!json || json.ok !== true) {
      throw new Error(`Error al enviar correo: ${(json && (json.error || json.reason)) || raw || status}`);
    }

    DBG('\u2714 GAS ok:', json);
    return true;
  } catch (err) {
    console.error('❌ Error al enviar correo de transporte (GAS):', err.message);
    throw err;
  }
}

export { enviarCorreoTransporte };
export default enviarCorreoTransporte;
