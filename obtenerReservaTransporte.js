import pool from './conexion.js';

export async function obtenerReservaTransporte(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token requerido' });
  }

  try {
    const query = `
      SELECT 
        folio, tipo_viaje, tipo_transporte, hotel_llegada, hotel_salida, zona, capacidad,
        cantidad_pasajeros, codigo_descuento, total_pago, nombre_cliente, correo_cliente, 
        telefono_cliente, nota, fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida, tipo_servicio, 
        porcentaje_descuento, precio_servicio, fecha, estatus, proveedor, folio_proveedor, 
        usuario_proveedorllegada, usuario_proveedorsalida, fecha_reservacionllegada, fecha_reservacionsalida,
        fecha_inicioviajellegada, fecha_finalviajellegada, comentariosllegada, comentariossalida,
        firma_cliente_llegada, firma_cliente_salida,
        choferllegada, chofersalida,
        estatus_viaje_llegada, estatus_viajesalida
      FROM reservaciones
      WHERE token_qr = $1
      LIMIT 1
    `;
    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const reserva = result.rows[0];

    return res.json({
      success: true,
      reserva
    });

  } catch (error) {
    console.error("❌ Error al obtener reserva por token:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}