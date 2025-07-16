import pool from './conexion.js';

export async function obtenerServiciosAsignadosEstatus(req, res) {
  const { usuario, estatus = 'asignado' } = req.query;

  if (!usuario) {
    return res.status(400).json({ success: false, message: 'Falta parámetro usuario' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT folio, nombre_cliente, tipo_viaje, hotel_llegada, fecha_llegada, hora_llegada,
              cantidad_pasajeros, total_pago, estatus
         FROM reservas_transporte
         WHERE usuario_chofer = ? AND estatus = ?`,
      [usuario, estatus]
    );

    res.json({ success: true, servicios: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener servicios' });
  }
}