import pool from './conexion.js';

export async function actualizarFolioProveedorTransporte(req, res) {
  const { token_qr, usuario_proveedor, folio_proveedor, fecha_reservacion } = req.body;

  if (!token_qr || !usuario_proveedor || !folio_proveedor || !fecha_reservacion) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // ✅ Verificar que exista la reserva
    const consulta = await pool.query(
      'SELECT id FROM reservaciones WHERE token_qr = $1 LIMIT 1',
      [token_qr]
    );

    if (consulta.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // ✅ Actualizar la reserva
    await pool.query(
      `UPDATE reservaciones
       SET folio_proveedor = $1,
           usuario_proveedor = $2,
           fecha_reservacion = $3
       WHERE token_qr = $4`,
      [folio_proveedor, usuario_proveedor, fecha_reservacion, token_qr]
    );

    return res.status(200).json({ success: true, mensaje: 'Folio del proveedor actualizado correctamente' });
  } catch (error) {
    console.error("❌ Error al actualizar folio proveedor transporte:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}