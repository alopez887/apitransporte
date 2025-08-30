// correosTransporte.js — Envío vía Google Apps Script WebApp (sin SMTP), **CON QR**
import dotenv from 'dotenv';
dotenv.config();

const GAS_URL = process.env.GAS_URL;                 // https://script.google.com/macros/s/XXXX/exec
const GAS_TOKEN = process.env.GAS_TOKEN;             // SECRET en Script Properties
const GAS_TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 15000);
const MAIL_FAST_MODE = /^(1|true|yes)$/i.test(process.env.MAIL_FAST_MODE || '');
const EMAIL_DEBUG = /^(1|true|yes)$/i.test(process.env.EMAIL_DEBUG || '');
const EMAIL_FROMNAME = process.env.EMAIL_FROMNAME || 'Cabo Travel Solutions';
const EMAIL_BCC = process.env.EMAIL_BCC || 'nkmsistemas@gmail.com';
const DBG = (...a) => { if (EMAIL_DEBUG) console.log('[MAIL]', ...a); };

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
// POST JSON con timeout
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
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally { clearTimeout(id); }
}

// ---------- Formateos ----------
const traduccionTripType = { "Llegada":"Arrival","Salida":"Departure","Redondo":"Round Trip","Shuttle":"Shuttle" };
const safeToFixed = (v)=>{ const n=Number(v); return isNaN(n)?'0.00':n.toFixed(2); };
function formatoHora12(hora){
  if(!hora) return '';
  const [h,m] = String(hora).split(':');
  const H = parseInt(h,10); const suf = H>=12?'p.m.':'a.m.'; const h12 = (H%12)||12;
  return `${h12}:${m} ${suf}`;
}

// ---------- Bloques de texto ----------
const politicasHTML = `
  <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
    <strong>&#128204; Cancellation Policy:</strong><br>
    - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
    <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
  </div>
`;

async function enviarCorreoTransporte(datos){
  try{
    if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
      throw new Error('GAS_URL no configurado o inválido');
    }
    if (!GAS_TOKEN) throw new Error('GAS_TOKEN no configurado');

    const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';
    const img0 = sanitizeUrl(datos.imagen);
    const imgUrl = img0 ? forceJpgIfWix(img0) : '';

    // ⬇️ QR desde data URL (igual proceso que tu código viejo)
    let qrAttachment = null;
    if (typeof datos.qr === 'string' && datos.qr.startsWith('data:image')) {
      const [meta, b64] = datos.qr.split(',');
      const mime = meta.substring(5, meta.indexOf(';')) || 'image/png';
      qrAttachment = {
        base64: b64,
        filename: 'qr.png',
        inline: true,
        cid: 'qrReserva',          // 👈 mantiene el mismo CID
        contentType: mime
      };
    }

    const tripType = traduccionTripType[datos.tipo_viaje] || datos.tipo_viaje;
    const nota = datos.nota || datos.cliente?.nota || '';
    const esShuttle = datos.tipo_viaje === 'Shuttle';

    // Header (h2 izq + logo der)
    const headerHTML = `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="text-align:left;vertical-align:middle;">
            <h2 style="color:green;margin:0;font-family:Arial,Helvetica,sans-serif;">✅ Transport Reservation Confirmed</h2>
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
    if (datos.tipo_viaje === 'Redondo') {
      cuerpoHTML += `
        <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;width:48%;padding-right:10px;">
              ${p('Name', datos.nombre_cliente)}
              ${p('Email', datos.correo_cliente)}
              ${p('Phone', datos.telefono_cliente)}
              ${p('Passengers', datos.cantidad_pasajeros)}
              ${nota && nota.trim() !== '' ? p('Note', nota) : ''}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p('Folio', datos.folio)}
              ${!esShuttle ? p('Transport', datos.tipo_transporte) : ''}
              ${!esShuttle ? p('Capacity', datos.capacidad) : ''}
              ${p('Trip Type', tripType)}
              ${p('Total', `$${safeToFixed(datos.total_pago)} USD`)}
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:6px;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">Arrival Information</th>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">Departure Information</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-right:15px;width:48%;">
              ${p('Hotel', datos.hotel_llegada)}
              ${p('Date', datos.fecha_llegada)}
              ${p('Time', formatoHora12(datos.hora_llegada))}
              ${p('Airline', datos.aerolinea_llegada)}
              ${p('Flight', datos.vuelo_llegada)}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p('Hotel', datos.hotel_salida)}
              ${p('Date', datos.fecha_salida)}
              ${p('Time', formatoHora12(datos.hora_salida))}
              ${p('Airline', datos.aerolinea_salida)}
              ${p('Flight', datos.vuelo_salida)}
            </td>
          </tr>
        </table>
      `.trim();
    } else {
      cuerpoHTML += `
        ${p('Folio', datos.folio)}
        ${p('Name', datos.nombre_cliente)}
        ${p('Email', datos.correo_cliente)}
        ${p('Phone', datos.telefono_cliente)}
        ${!esShuttle ? p('Transport', datos.tipo_transporte) : ''}
        ${!esShuttle ? p('Capacity', datos.capacidad) : ''}
        ${(datos.cantidad_pasajeros || datos.pasajeros) ? p('Passengers', (datos.cantidad_pasajeros || datos.pasajeros)) : ''}
        ${datos.hotel_llegada ? p('Hotel', datos.hotel_llegada) : ''}
        ${datos.fecha_llegada ? p('Date', datos.fecha_llegada) : ''}
        ${datos.hora_llegada ? p('Time', formatoHora12(datos.hora_llegada)) : ''}
        ${datos.aerolinea_llegada ? p('Airline', datos.aerolinea_llegada) : ''}
        ${datos.vuelo_llegada ? p('Flight', datos.vuelo_llegada) : ''}
        ${p('Trip Type', tripType)}
        ${p('Total', `$${safeToFixed(datos.total_pago)} USD`)}
        ${nota && nota.trim() !== '' ? p('Note', nota) : ''}
      `.trim();
    }

    // Imagen principal (igual que tenías) …
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

    // ⬇️ QR debajo de la imagen, centrado, ancho 180px (igual que el viejo)
    const qrHTML = qrAttachment ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">
        <tr>
          <td align="center">
            <p style="font-weight:bold;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">Show this QR code to your provider:</p>
            <img src="cid:qrReserva" alt="QR Code" style="width:180px;display:block;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    const recomendacionesHTML = `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">⚠ Recommendations:</strong>
        <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
      </div>
    `;

    const destinatarioHTML = `
      <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
        &#128231; This confirmation was sent to:
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
        ${politicasHTML}
      </div>
    `.trim();

    // Wrapper 600px centrado (igual)
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

    // Adjuntos (inline por CID) — GAS debe aceptar url/base64
    const attachments = [
      { url: logoUrl, filename: 'logo.png', inline: true, cid: 'logoEmpresa' }
    ];
    if (imgUrl) {
      attachments.push({ url: imgUrl, filename: 'transporte.jpg', inline: true, cid: 'imagenTransporte' });
    }
    if (qrAttachment) {
      attachments.push(qrAttachment); // { base64, filename, inline:true, cid:'qrReserva', contentType }
    }

    const payload = {
      token: GAS_TOKEN,
      ts: Date.now(),
      to: datos.correo_cliente,
      bcc: EMAIL_BCC,
      subject: `Transport Reservation - Folio ${datos.folio}`,
      html: mensajeHTML,
      fromName: EMAIL_FROMNAME,
      attachments
    };

    DBG('POST → GAS', { to: datos.correo_cliente, subject: payload.subject });

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