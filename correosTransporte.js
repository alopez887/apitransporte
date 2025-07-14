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

    if (datos.qr && datos.qr.startsWith('data:image')) {
      const qrBase64 = datos.qr.split(',')[1];
      qrAdjunto = {
        filename: 'qr.png',
        content: Buffer.from(qrBase64, 'base64'),
        cid: 'qrReserva',
        contentType: 'image/png'
      };
    }

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
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
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

    let mensajeHTML = `
      <style>
        div.linea { margin: 0; padding: 2px 0; line-height: 1.4; }
      </style>
    `;

    if (datos.tipo_viaje === "Redondo") {
      mensajeHTML += `
      <div style="max-width:600px;margin:0 auto;padding:20px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
        <table style="width:100%;margin-bottom:5px;">
          <tr>
            <td style="text-align:right;">
              <img src="cid:logoEmpresa" alt="Logo" style="height:45px;" />
            </td>
          </tr>
          <tr>
            <td style="text-align:left;">
              <h2 style="color:green;margin:0;">✅ Transport Reservation Confirmed</h2>
            </td>
          </tr>
        </table>

        <table style="width:100%;margin-bottom:10px;">
          <tr>
            <td style="vertical-align:top;width:48%;">
              <div class="linea"><strong>Name:</strong> ${datos.nombre_cliente}</div>
              <div class="linea"><strong>Email:</strong> ${datos.correo_cliente}</div>
              <div class="linea"><strong>Phone:</strong> ${datos.telefono_cliente}</div>
              <div class="linea"><strong>Passengers:</strong> ${datos.cantidad_pasajeros}</div>
              ${nota && nota.trim() !== '' ? `<div class="linea"><strong>Note:</strong> ${nota}</div>` : ''}
            </td>
            <td style="vertical-align:top;width:48%;">
              <div class="linea"><strong>Folio:</strong> ${datos.folio}</div>
              ${!esShuttle ? `<div class="linea"><strong>Transport:</strong> ${datos.tipo_transporte}</div>` : ''}
              ${!esShuttle ? `<div class="linea"><strong>Capacity:</strong> ${datos.capacidad}</div>` : ''}
              <div class="linea"><strong>Trip Type:</strong> ${tripTypeIngles}</div>
              <div class="linea"><strong>Total:</strong> $${safeToFixed(datos.total_pago)} USD</div>
            </td>
          </tr>
        </table>

        <hr style="margin:20px 0;">

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding-bottom:5px;width:48%;">Arrival Information</th>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding-bottom:5px;width:48%;">Departure Information</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-right:15px;width:48%;">
              <div class="linea"><strong>Hotel:</strong> ${datos.hotel_llegada}</div>
              <div class="linea"><strong>Date:</strong> ${datos.fecha_llegada}</div>
              <div class="linea"><strong>Time:</strong> ${formatoHora12(datos.hora_llegada)}</div>
              <div class="linea"><strong>Airline:</strong> ${datos.aerolinea_llegada}</div>
              <div class="linea"><strong>Flight:</strong> ${datos.vuelo_llegada}</div>
            </td>
            <td style="vertical-align:top;width:48%;">
              <div class="linea"><strong>Hotel:</strong> ${datos.hotel_salida}</div>
              <div class="linea"><strong>Date:</strong> ${datos.fecha_salida}</div>
              <div class="linea"><strong>Time:</strong> ${formatoHora12(datos.hora_salida)}</div>
              <div class="linea"><strong>Airline:</strong> ${datos.aerolinea_salida}</div>
              <div class="linea"><strong>Flight:</strong> ${datos.vuelo_salida}</div>
            </td>
          </tr>
        </table>
      `;
    } else {
      mensajeHTML += `
      <div style="max-width:600px;margin:0 auto;padding:20px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
        <table style="width:100%;margin-bottom:5px;">
          <tr>
            <td style="text-align:right;">
              <img src="cid:logoEmpresa" alt="Logo" style="height:45px;" />
            </td>
          </tr>
          <tr>
            <td style="text-align:left;">
              <h2 style="color:green;margin:0;">✅ Transport Reservation Confirmed</h2>
            </td>
          </tr>
        </table>

        <div class="linea"><strong>Folio:</strong> ${datos.folio}</div>
        <div class="linea"><strong>Name:</strong> ${datos.nombre_cliente}</div>
        <div class="linea"><strong>Email:</strong> ${datos.correo_cliente}</div>
        <div class="linea"><strong>Phone:</strong> ${datos.telefono_cliente}</div>
        ${!esShuttle ? `<div class="linea"><strong>Transport:</strong> ${datos.tipo_transporte}</div>` : ''}
        ${!esShuttle ? `<div class="linea"><strong>Capacity:</strong> ${datos.capacidad}</div>` : ''}
        <div class="linea"><strong>Trip Type:</strong> ${tripTypeIngles}</div>
        ${(datos.cantidad_pasajeros || datos.pasajeros) ? `<div class="linea"><strong>Passengers:</strong> ${datos.cantidad_pasajeros || datos.pasajeros}</div>` : ''}
        ${datos.hotel_llegada ? `<div class="linea"><strong>Hotel:</strong> ${datos.hotel_llegada}</div>` : ''}
        ${datos.fecha_llegada ? `<div class="linea"><strong>Date:</strong> ${datos.fecha_llegada}</div>` : ''}
        ${datos.hora_llegada ? `<div class="linea"><strong>Time:</strong> ${formatoHora12(datos.hora_llegada)}</div>` : ''}
        ${datos.aerolinea_llegada ? `<div class="linea"><strong>Airline:</strong> ${datos.aerolinea_llegada}</div>` : ''}
        ${datos.vuelo_llegada ? `<div class="linea"><strong>Flight:</strong> ${datos.vuelo_llegada}</div>` : ''}
      `;
    }

    mensajeHTML += `
        <div class="linea"><strong>Total:</strong> $${safeToFixed(datos.total_pago)} USD</div>
        ${nota && nota.trim() !== '' ? `<div class="linea"><strong>Note:</strong> ${nota}</div>` : ''}
        ${imagenAdjunta ? `<div><img src="cid:imagenTransporte" width="400" alt="Transport Image" style="border-radius:8px;max-width:100%;margin-top:20px;" /></div>` : ''}

        <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:10px 15px;margin-top:20px;border-radius:5px;">
          <strong style="color:#b00000;">⚠ Recommendations:</strong>
          <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
        </div>

        <div style="margin-top:20px;font-size:14px;color:#555;">
          📩 Confirmation sent to: <a href="mailto:${datos.correo_cliente}">${datos.correo_cliente}</a>
        </div>

        ${qrAdjunto ? `<div style="text-align:center;margin-top:30px;">
          <p style="font-weight:bold;">Show this QR code to your provider:</p>
          <img src="cid:qrReserva" alt="QR Code" style="width:180px;"/>
        </div>` : ''}

        ${politicasHTML}
      </div>
    `;

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