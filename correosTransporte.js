//correosTransporte.js
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

    const mensajeHTML = `
  <div style="max-width:600px;margin:0 auto;padding:30px 30px 40px;border:2px solid #ccc;border-radius:10px;font-family:Arial,sans-serif;">
    <table style="width:100%;margin-bottom:10px;">
      <tr>
        <td style="text-align:left;"><h2 style="color:green;margin:0;">✅ Transport Reservation Confirmed</h2></td>
        <td style="text-align:right;"><img src="cid:logoEmpresa" alt="Logo" style="height:45px;" /></td>
      </tr>
    </table>
    <p><strong>Folio:</strong> ${datos.folio}</p>
    <p><strong>Name:</strong> ${datos.nombre}</p>
    <p><strong>Email:</strong> ${datos.correo_cliente}</p>
    <p><strong>Phone:</strong> ${datos.telefono}</p>
    <p><strong>Transport:</strong> ${datos.tipo_transporte}</p>
    ${datos.tipo_viaje ? `<p><strong>Trip Type:</strong> ${datos.tipo_viaje}</p>` : ''}
    ${datos.pasajeros ? `<p><strong>Passengers:</strong> ${datos.pasajeros}</p>` : ''}
    ${datos.total_pago ? `<p><strong>Total:</strong> $${datos.total_pago.toFixed(2)} ${datos.moneda}</p>` : ''}
    ${datos.nota && datos.nota.trim() !== '' ? `<p><strong>Note:</strong> ${datos.nota}</p>` : ''}
    ${imagenAdjunta ? `<p><img src="cid:imagenTransporte" width="400" alt="Imagen del transporte" style="border-radius:8px;max-width:100%;margin-top:20px;" /></p>` : ''}
    <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:10px 15px;margin-top:20px;border-radius:5px;">
      <strong style="color:#b00000;">⚠ Recommendations:</strong>
      <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
    </div>
    <p style="margin-top:20px;font-size:14px;color:#555;">📩 Confirmation sent to: <a href="mailto:${datos.correo_cliente}">${datos.correo_cliente}</a></p>
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
