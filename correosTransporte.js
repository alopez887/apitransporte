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
      "Redondo": "Round Trip"
    };

    const tripTypeIngles = traduccionTripType[datos.tipo_viaje] || datos.tipo_viaje;
    const nota = datos.nota || datos.comentarios || datos.cliente?.comentarios || '';

    let mensajeHTML = "";

    if (datos.tipo_viaje === "Redondo") {
      // 🟢 Redondo con alineación limpia
      mensajeHTML = `
      <div style="max-width:650px;margin:0 auto;padding:30px 30px 40px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
        <table style="width:100%;margin-bottom:10px;">
          <tr>
            <td style="text-align:left;">
              <h2 style="color:green;margin:0;">✅ Transport Reservation Confirmed</h2>
            </td>
            <td style="text-align:right;padding-right:10px;">
              <img src="cid:logoEmpresa" alt="Logo" style="height:45px;" />
            </td>
          </tr>
        </table>

        <table style="width:100%;margin-bottom:10px;">
          <tr>
            <td style="vertical-align:top;width:48%;">
              <p><strong>Name:</strong> ${datos.nombre} ${datos.apellido}</p>
              <p><strong>Email:</strong> ${datos.correo_cliente}</p>
              <p><strong>Phone:</strong> ${datos.telefono}</p>
              <p><strong>Passengers:</strong> ${datos.cantidad_pasajeros}</p>
              ${nota && nota.trim() !== '' ? `<p><strong>Note:</strong> ${nota}</p>` : ''}
            </td>
            <td style="vertical-align:top;width:48%;">
              <p><strong>Folio:</strong> ${datos.folio}</p>
              <p><strong>Transport:</strong> ${datos.tipo_transporte}</p>
              <p><strong>Capacity:</strong> ${datos.capacidad}</p>
              <p><strong>Trip Type:</strong> ${tripTypeIngles}</p>
              <p><strong>Total:</strong> $${safeToFixed(datos.precio_total)} USD</p>
            </td>
          </tr>
        </table>

        <hr style="margin:20px 0;">

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding-bottom:5px;">Arrival Information</th>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding-bottom:5px;">Departure Information</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-right:15px;">
              <p><strong>Hotel:</strong> ${datos.hotel_llegada}</p>
              <p><strong>Date:</strong> ${datos.fecha_llegada}</p>
              <p><strong>Time:</strong> ${formatoHora12(datos.hora_llegada)}</p>
              <p><strong>Airline:</strong> ${datos.aerolinea_llegada}</p>
              <p><strong>Flight:</strong> ${datos.vuelo_llegada}</p>
            </td>
            <td style="vertical-align:top;">
              <p><strong>Hotel:</strong> ${datos.hotel_salida}</p>
              <p><strong>Date:</strong> ${datos.fecha_salida}</p>
              <p><strong>Time:</strong> ${formatoHora12(datos.hora_salida)}</p>
              <p><strong>Airline:</strong> ${datos.aerolinea_salida}</p>
              <p><strong>Flight:</strong> ${datos.vuelo_salida}</p>
            </td>
          </tr>
        </table>

        ${imagenAdjunta ? `<p><img src="cid:imagenTransporte" width="400" alt="Transport Image" style="border-radius:8px;max-width:100%;margin-top:20px;" /></p>` : ''}

        <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:10px 15px;margin-top:20px;border-radius:5px;">
          <strong style="color:#b00000;">⚠ Recommendations:</strong>
          <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
        </div>

        <p style="margin-top:20px;font-size:14px;color:#555;">
          📩 Confirmation sent to: <a href="mailto:${datos.correo_cliente}">${datos.correo_cliente}</a>
        </p>

        ${politicasHTML}
      </div>
      `;
    } else {
      // ✉️ Llegada o Salida
      mensajeHTML = `
      <div style="max-width:650px;margin:0 auto;padding:30px 30px 40px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
        <table style="width:100%;margin-bottom:10px;">
          <tr>
            <td style="text-align:left;">
              <h2 style="color:green;margin:0;">✅ Transport Reservation Confirmed</h2>
            </td>
            <td style="text-align:right;padding-right:10px;">
              <img src="cid:logoEmpresa" alt="Logo" style="height:45px;" />
            </td>
          </tr>
        </table>

        <p><strong>Folio:</strong> ${datos.folio}</p>
        <p><strong>Name:</strong> ${datos.nombre} ${datos.apellido}</p>
        <p><strong>Email:</strong> ${datos.correo_cliente}</p>
        <p><strong>Phone:</strong> ${datos.telefono}</p>
        <p><strong>Transport:</strong> ${datos.tipo_transporte}</p>
        <p><strong>Capacity:</strong> ${datos.capacidad}</p>
        <p><strong>Trip Type:</strong> ${tripTypeIngles}</p>
        ${(datos.cantidad_pasajeros || datos.pasajeros) ? `<p><strong>Passengers:</strong> ${datos.cantidad_pasajeros || datos.pasajeros}</p>` : ''}

        ${datos.hotel_llegada ? `<p><strong>Hotel:</strong> ${datos.hotel_llegada}</p>` : ''}
        ${datos.fecha_llegada ? `<p><strong>Date:</strong> ${datos.fecha_llegada}</p>` : ''}
        ${datos.hora_llegada ? `<p><strong>Time:</strong> ${formatoHora12(datos.hora_llegada)}</p>` : ''}
        ${datos.aerolinea_llegada ? `<p><strong>Airline:</strong> ${datos.aerolinea_llegada}</p>` : ''}
        ${datos.vuelo_llegada ? `<p><strong>Flight:</strong> ${datos.vuelo_llegada}</p>` : ''}

        ${datos.hotel_salida ? `<p><strong>Hotel:</strong> ${datos.hotel_salida}</p>` : ''}
        ${datos.fecha_salida ? `<p><strong>Date:</strong> ${datos.fecha_salida}</p>` : ''}
        ${datos.hora_salida ? `<p><strong>Time:</strong> ${formatoHora12(datos.hora_salida)}</p>` : ''}
        ${datos.aerolinea_salida ? `<p><strong>Airline:</strong> ${datos.aerolinea_salida}</p>` : ''}
        ${datos.vuelo_salida ? `<p><strong>Flight:</strong> ${datos.vuelo_salida}</p>` : ''}

        <p><strong>Total:</strong> $${safeToFixed(datos.precio_total)} USD</p>
        ${nota && nota.trim() !== '' ? `<p><strong>Note:</strong> ${nota}</p>` : ''}

        ${imagenAdjunta ? `<p><img src="cid:imagenTransporte" width="400" alt="Transport Image" style="border-radius:8px;max-width:100%;margin-top:20px;" /></p>` : ''}

        <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:10px 15px;margin-top:20px;border-radius:5px;">
          <strong style="color:#b00000;">⚠ Recommendations:</strong>
          <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
        </div>

        <p style="margin-top:20px;font-size:14px;color:#555;">
          📩 Confirmation sent to: <a href="mailto:${datos.correo_cliente}">${datos.correo_cliente}</a>
        </p>

        ${politicasHTML}
      </div>
      `;
    }

    console.log("📤 Enviando correo con imagen:", !!imagenAdjunta);

    await transporter.sendMail({
      from: `Cabo Travels Solutions - Transport <${process.env.EMAIL_USER}>`,
      to: datos.correo_cliente,
      bcc: 'nkmsistemas@gmail.com',
      subject: `Transport Reservation - Folio ${datos.folio}`,
      html: mensajeHTML,
      attachments: [
        ...(imagenAdjunta ? [imagenAdjunta] : []),
        logoAdjunto
      ]
    });

    console.log('📧 Correo de transportación enviado correctamente');
  } catch (err) {
    console.error('❌ Error al enviar correo de transporte:', err.message);
  }
}