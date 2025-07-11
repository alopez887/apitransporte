import QRCode from 'qrcode';

export async function generarQRTransporte(token) {
  try {
    // URL que se usará en el QR
    const url = `https://nkmsistemas.wixsite.com/cabo-travel-activiti/validar-qr?token=${token}`;

    // Generar el QR en formato data URL
    const qrDataUrl = await QRCode.toDataURL(url);

    return qrDataUrl;
  } catch (error) {
    console.error("❌ Error generando QR Transporte:", error);
    throw new Error("Error generando QR Transporte");
  }
}