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

    // Descargar QR
    let qrAdjunto = null;
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
    const esRoundtrip = datos.tipo_viaje === "Redondo";

    let mensajeHTML = `
    <div style="max-width:600px;margin:0 auto;padding:20px 20px 40px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
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

      <p><strong>Folio:</strong> ${datos.folio}</p>
      <p><strong>Name:</strong> ${datos.nombre_cliente}</p>
      <p><strong>Email:</strong> ${datos.correo_cliente}</p>
      <p><strong>Phone:</strong> ${datos.telefono_cliente}</p>
      <p><strong>Trip Type:</strong> ${tripTypeIngles}</p>
      ${(datos.cantidad_pasajeros || datos.pasajeros) ? `<p><strong>Passengers:</strong> ${datos.cantidad_pasajeros || datos.pasajeros}</p>` : ''}
    `;

    if (esRoundtrip) {
      mensajeHTML += `
      <table style="width:100%;margin-top:15px;">
        <tr>
          <td style="vertical-align:top;padding-right:10px;">
            <h3 style="margin-bottom:5px;">Arrival</h3>
            ${datos.hotel_llegada ? `<p><strong>Hotel:</strong> ${datos.hotel_llegada}</p>` : ''}
            ${datos.fecha_llegada ? `<p><strong>Date:</strong> ${datos.fecha_llegada}</p>` : ''}
            ${datos.hora_llegada ? `<p><strong>Time:</strong> ${formatoHora12(datos.hora_llegada)}</p>` : ''}
            ${datos.aerolinea_llegada ? `<p><strong>Airline:</strong> ${datos.aerolinea_llegada}</p>` : ''}
            ${datos.vuelo_llegada ? `<p><strong>Flight:</strong> ${datos.vuelo_llegada}</p>` : ''}
          </td>
          <td style="vertical-align:top;padding-left:10px;">
            <h3 style="margin-bottom:5px;">Departure</h3>
            ${datos.hotel_salida ? `<p><strong>Hotel:</strong> ${datos.hotel_salida}</p>` : ''}
            ${datos.fecha_salida ? `<p><strong>Date:</strong> ${datos.fecha_salida}</p>` : ''}
            ${datos.hora_salida ? `<p><strong>Time:</strong> ${formatoHora12(datos.hora_salida)}</p>` : ''}
            ${datos.aerolinea_salida ? `<p><strong>Airline:</strong> ${datos.aerolinea_salida}</p>` : ''}
            ${datos.vuelo_salida ? `<p><strong>Flight:</strong> ${datos.vuelo_salida}</p>` : ''}
          </td>
        </tr>
      </table>
      `;
    } else {
      mensajeHTML += `
        ${datos.hotel_llegada ? `<p><strong>Hotel:</strong> ${datos.hotel_llegada}</p>` : ''}
        ${datos.fecha_llegada ? `<p><strong>Date:</strong> ${datos.fecha_llegada}</p>` : ''}
        ${datos.hora_llegada ? `<p><strong>Time:</strong> ${formatoHora12(datos.hora_llegada)}</p>` : ''}
        ${datos.aerolinea_llegada ? `<p><strong>Airline:</strong> ${datos.aerolinea_llegada}</p>` : ''}
        ${datos.vuelo_llegada ? `<p><strong>Flight:</strong> ${datos.vuelo_llegada}</p>` : ''}
      `;
    }

    mensajeHTML += `
      <p><strong>Total:</strong> $${safeToFixed(datos.total_pago)} USD</p>
      ${nota && nota.trim() !== '' ? `<p><strong>Note:</strong> ${nota}</p>` : ''}
      ${imagenAdjunta ? `<p><img src="cid:imagenTransporte" width="400" alt="Transport Image" style="border-radius:8px;max-width:100%;margin-top:20px;" /></p>` : ''}
      <p style="margin-top:20px;font-size:14px;color:#555;">
        📩 Confirmation sent to: <a href="mailto:${datos.correo_cliente}">${datos.correo_cliente}</a>
      </p>
      ${politicasHTML}
    `;

    if (qrAdjunto) {
      mensajeHTML += `
        <div style="text-align:center;margin-top:20px;">
          <p style="font-weight:bold;">Show this QR code to your provider:</p>
          <img src="cid:qrReserva" alt="QR Code" style="width:180px;" />
        </div>
      `;
    }

    mensajeHTML += `</div>`;

    console.log("📤 Enviando correo con QR y adjuntos");

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