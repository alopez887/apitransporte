import fs from 'fs';
import path from 'path';
import pool from '../conexion.js';

export default async function guardarFirma(req, res) {
  const { token_qr, folio, firma_base64 } = req.body;

  // ✅ Usar folio si no hay token_qr (chofer)
  const identificador = token_qr || folio;
  const campoIdentificador = token_qr ? 'token_qr' : 'folio';

  if (!identificador || !firma_base64) {
    return res.status(400).json({ success: false, message: 'Faltan datos' });
  }

  try {
    // Generar nombre único
    const nombreArchivo = `firma_${identificador}_${Date.now()}.png`;
    const rutaArchivo = path.join(process.cwd(), 'firmas', nombreArchivo);

    // Extraer solo base64 sin encabezado
    const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');

    // Guardar archivo en carpeta firmas
    fs.writeFileSync(rutaArchivo, base64Data, 'base64');

    // Construir URL pública
    const urlFirma = `${req.protocol}://${req.get('host')}/firmas/${nombreArchivo}`;

    // Actualizar en BD solo URL
    await pool.query(
      `UPDATE reservaciones SET firma_cliente = $1 WHERE ${campoIdentificador} = $2`,
      [urlFirma, identificador]
    );

    res.json({ success: true, url: urlFirma });
  } catch (error) {
    console.error('❌ Error al guardar firma:', error);
    res.status(500).json({ success: false, message: 'Error guardando firma' });
  }
}