import fs from 'fs';
import path from 'path';
import pool from '../conexion.js';

export default async function guardarFirma(req, res) {
  const { token_qr, folio, firma_base64, tipo_viaje } = req.body;

  const identificador = token_qr || folio;
  const campoIdentificador = token_qr ? 'token_qr' : 'folio';

  if (!identificador || !firma_base64 || !tipo_viaje) {
    return res.status(400).json({ success: false, message: 'Faltan datos' });
  }

  try {
    const nombreArchivo = `firma_${identificador}_${Date.now()}.png`;
    const rutaArchivo = path.join(process.cwd(), 'firmas', nombreArchivo);
    const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');

    fs.writeFileSync(rutaArchivo, base64Data, 'base64');

    const urlFirma = `${req.protocol}://${req.get('host')}/firmas/${nombreArchivo}`;

    // ✅ TRATAMIENTO CORRECTO Y SEPARADO
    let campoFirma = '';
    if (
      tipo_viaje === 'llegada' ||
      tipo_viaje === 'redondo_llegada' ||
      tipo_viaje === 'shuttle' // ✅ Shuttle va aquí, tratado como llegada
    ) {
      campoFirma = 'firma_clientellegada';
    } else if (
      tipo_viaje === 'salida' ||
      tipo_viaje === 'redondo_salida'
    ) {
      campoFirma = 'firma_clientesalida';
    } else {
      return res.status(400).json({ success: false, message: 'Tipo de viaje inválido' });
    }

    const query = `UPDATE reservaciones SET ${campoFirma} = $1 WHERE ${campoIdentificador} = $2`;
    await pool.query(query, [urlFirma, identificador]);

    res.json({ success: true, url: urlFirma });
  } catch (error) {
    console.error('❌ Error al guardar firma:', error);
    res.status(500).json({ success: false, message: 'Error guardando firma' });
  }
}