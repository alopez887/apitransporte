// enviarCorreo.js — Transporte (diseño alineado con Tours, Outlook-safe)
import nodemailer from 'nodemailer';
import axios from 'axios';

const politicasHTML = `
  <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
    <strong>📌 Cancellation Policy:</strong><br>
    - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
    <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
  </div>
`;

export async function enviarCorreoTransporte(datos) {
  try {
    console.log("📥 Datos recibidos para el correo:", datos);

    let imagenAdjunta = null;
    let qrAdjunto = null;

    // Imagen principal (opcional)
    if (datos.imagen && datos.imagen.startsWith('http')) {
      try {
        const imagenRes = await axios.get(datos.imagen, { responseType: 'arraybuffer' });
        imagenAdjunta = {
          filename: 'transporte.jpg',
          content: imagenRes.data,
          cid: 'imagenTransporte',
          contentType: 'image/jpeg'
        };
      } catch (err) {
        console.warn('⚠️ No se pudo descargar la imagen:', err.message);
      }
    }

    // QR opcional (data URL)
    if (datos.qr && datos.qr.startsWith('data:image')) {
      const qrBase64 = datos.qr.split(',')[1];
      qrAdjunto = {
        filename: 'qr.png',
        content: Buffer.from(qrBase64, 'base64'),
        cid: 'qrReserva',
        contentType: 'image/png'
      };
    }

    // Logo
    const logoBuffer = await axios.get(
      'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png',
      { responseType: 'arraybuffer' }
    );
    const logoAdjunto = {
      filename: 'logo.png',
      content: logoBuffer.data,
      cid: 'logoEmpresa',
      contentType: 'image/png'
    };

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    const safeToFixed = (valor) => {
      const num = Number(valor);
      return isNaN(num) ? '0.00' : num.toFixed(2);
    };

    const formatoHora12 = (hora) => {
      if (!hora) return '';
      const [h, m] = hora.split(':');
      const horaNum = parseInt(h, 10);
      const sufijo = horaNum >= 12 ? 'p.m.' : 'a.m.';
      const hora12 = (horaNum % 12) || 12;
      return `${hora12}:${m} ${sufijo}`;
    };

    const traduccionTripType = {
      "Llegada": "Arrival",
      "Salida": "Departure",
      "Redondo": "Round Trip",
      "Shuttle": "Shuttle"
    };

    const tripTypeIngles = traduccionTripType[datos.tipo_viaje] || datos.tipo_viaje;
    const nota = datos.nota || datos.cliente?.nota || '';
    const esShuttle = datos.tipo_viaje === "Shuttle";

    // ====== PLANTILLA OUTLOOK-SAFE (igual que Tours) ======
    // Header (h2 izquierda + logo derecha), 600px, border 2px, radius 10, padding 24/26/32
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

    // Bloque “clave: valor” (p con margin 2px 0; inline styles)
    const p = (label, value) => {
      if (value === undefined || value === null || String(value).trim() === '') return '';
      return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
        <strong>${label}:</strong> ${value}
      </p>`;
    };

    // Sección cliente y totales (lado a lado para Redondo; lineal para otros)
    let cuerpoHTML = '';

    if (datos.tipo_viaje === "Redondo") {
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
              ${p('Trip Type', tripTypeIngles)}
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
        ${p('Trip Type', tripTypeIngles)}
        ${p('Total', `$${safeToFixed(datos.total_pago)} USD`)}
        ${nota && nota.trim() !== '' ? p('Note', nota) : ''}
      `.trim();
    }

    // Imagen principal (igual que Tours: tabla + img CID width=400, responsive)
    const imagenHTML = imagenAdjunta ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
        <tr>
          <td>
            <img src="cid:imagenTransporte" width="400" alt="Transport Image"
                 style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    // Bloque recomendaciones (amarillo) — mismos colores y estilos
    const recomendacionesHTML = `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">⚠ Recommendations:</strong>
        <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
      </div>
    `;

    // Línea de destinatario
    const destinatarioHTML = `
      <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
        &#128231; This confirmation was sent to:
        <a href="mailto:${datos.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente}</a>
      </p>
    `;

    // QR opcional
    const qrHTML = qrAdjunto ? `
      <div style="text-align:center;margin-top:30px;">
        <p style="font-weight:bold;font-family:Arial,Helvetica,sans-serif;margin:0 0 8px 0;">Show this QR code to your provider:</p>
        <img src="cid:qrReserva" alt="QR Code" style="width:180px;height:auto;display:inline-block;" />
      </div>
    ` : '';

    // Mensaje Inner (header + cuerpo + imagen + bloques)
    const mensajeInner = `
      ${headerHTML}
      <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
        ${cuerpoHTML}
        ${imagenHTML}
        ${recomendacionesHTML}
        ${destinatarioHTML}
        ${qrHTML}
        ${politicasHTML}
      </div>
    `.trim();

    // Wrapper 600px en tabla (idéntico a Tours)
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

    await transporter.sendMail({
      from: `Cabo Travels Solutions - Transport <${process.env.EMAIL_USER}>`,
      to: datos.correo_cliente,
      bcc: 'nkmsistemas@gmail.com',
      subject: `Transport Reservation - Folio ${datos.folio}`,
      html: mensajeHTML,
      attachments: [
        ...(imagenAdjunta ? [imagenAdjunta] : []),
        logoAdjunto,
        ...(qrAdjunto ? [qrAdjunto] : [])
      ]
    });

    console.log('📧 Correo de transportación enviado correctamente');
  } catch (err) {
    console.error('❌ Error al enviar correo de transporte:', err.message);
  }
}