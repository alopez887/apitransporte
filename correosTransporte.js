import nodemailer from 'nodemailer';
import axios from 'axios';

export async function enviarCorreoTransporte(datos) {
  try {
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

    // 🔐 toFixed seguro
    const safeToFixed = (valor) => {
      const num = Number(valor);
      return isNaN(num) ? '0.00' : num.toFixed(2);
    };

    // ⏰ Convertir a formato AM/PM si viene como 24h
    const formatoHora12 = (hora) => {
      if (!hora) return '';
      const [h, m] = hora.split(':');
      const horaNum = parseInt(h, 10);
      const sufijo = horaNum >= 12 ? 'p.m.' : 'a.m.';
      const hora12 = (horaNum % 12) || 12;
      return `${hora12}:${m} ${sufijo}`;
    };

    const mensajeHTML = `
  <div style="max-width:600px;margin:0 auto;padding:30px 30px 40px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
    <!-- Header -->
    <table style="width:100%;margin-bottom:10px;">
      <tr>
        <td style="text-align:left;"><h2 style="color:green;margin:0;">✅ Transport Reservation Confirmed</h2></td>
        <td style="text-align:right;"><img src="cid:logoEmpresa" alt="Logo" style="height:45px;" /></td>
      </tr>
    </table>

    <!-- Client Info -->
    <p><strong>Folio:</strong> ${datos.folio}</p>
    <p><strong>Name:</strong> ${datos.nombre}</p>
    <p><strong>Email:</strong> ${datos.correo_cliente}</p>
    <p><strong>Phone:</strong> ${datos.telefono}</p>

    <!-- Transport Details -->
    <p><strong>Transport:</strong> ${datos.tipo_transporte}</p>
    <p><strong>Capacity:</strong> ${datos.capacidad}</p>
    <p><strong>Trip Type:</strong> ${datos.tipo_viaje}</p>
    <p><strong>Passengers:</strong> ${datos.pasajeros}</p>

    <!-- Arrival Specific -->
    ${datos.hotel_llegada ? `<p><strong>Arrival Hotel:</strong> ${datos.hotel_llegada}</p>` : ''}
    ${datos.fecha_llegada ? `<p><strong>Arrival Date:</strong> ${datos.fecha_llegada}</p>` : ''}
    ${datos.hora_llegada ? `<p><strong>Arrival Time:</strong> ${formatoHora12(datos.hora_llegada)}</p>` : ''}
    ${datos.aerolinea_llegada ? `<p><strong>Arrival Airline:</strong> ${datos.aerolinea_llegada}</p>` : ''}
    ${datos.vuelo_llegada ? `<p><strong>Arrival Flight:</strong> ${datos.vuelo_llegada}</p>` : ''}

    <!-- Total & Note -->
    <p><strong>Total:</strong> $${safeToFixed(datos.precio_total)} USD</p>
    ${datos.nota && datos.nota.trim() !== '' ? `<p><strong>Note:</strong> ${datos.nota}</p>` : ''}

    <!-- Transport Image -->
    ${imagenAdjunta ? `<p><img src="cid:imagenTransporte" width="400" alt="Transport Image" style="border-radius:8px;max-width:100%;margin-top:20px;" /></p>` : ''}

    <!-- Recommendations -->
    <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:10px 15px;margin-top:20px;border-radius:5px;">
      <strong style="color:#b00000;">⚠ Recommendations:</strong>
      <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
    </div>

    <!-- Footer -->
    <p style="margin-top:20px;font-size:14px;color:#555;">
      📩 Confirmation sent to: <a href="mailto:${datos.correo_cliente}">${datos.correo_cliente}</a>
    </p>
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
        logoAdjunto
      ]
    });

    console.log('📧 Correo de transportación enviado correctamente');
  } catch (err) {
    console.error('❌ Error al enviar correo de transporte:', err.message);
  }
}