import pool from './conexion.js';

export async function actualizarFolioProveedorTransporte(req, res) {
  const { token, usuario, folio_proveedor } = req.body;

  if (!token || !usuario || !folio_proveedor) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // ✅ Verificar que exista la reserva con el token_qr
    const consulta = await pool.query(
      'SELECT id FROM reservaciones WHERE token_qr = $1 LIMIT 1',
      [token]
    );

    if (consulta.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // ✅ Actualizar la reserva con el folio interno y datos de proveedor
    await pool.query(
      `UPDATE reservaciones
       SET folio_proveedor = $1,
           usuario_proveedor = $2,
           fecha_actualizacion_proveedor = NOW() AT TIME ZONE 'America/Mazatlan'
       WHERE token_qr = $3`,
      [folio_proveedor, usuario, token]
    );

    return res.status(200).json({ success: true, mensaje: 'Folio del proveedor actualizado correctamente' });
  } catch (error) {
    console.error("❌ Error al actualizar folio proveedor transporte:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}