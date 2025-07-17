import pool from './conexion.js';

export async function obtenerServiciosAsignadosEstatus(req, res) {
  const { usuario, estatus = 'asignado' } = req.query;

  if (!usuario) {
    return res.status(400).json({ success: false, message: 'Falta parámetro usuario' });
  }

  try {
    const query = `
      SELECT 
        folio, 
        nombre_cliente, 
        correo_cliente, 
        telefono_cliente, 
        nota,
        tipo_servicio, 
        tipo_transporte, 
        capacidad, 
        cantidad_pasajeros,
        hotel_llegada, 
        hotel_salida,
        fecha_llegada, 
        hora_llegada, 
        aerolinea_llegada, 
        vuelo_llegada,
        fecha_salida, 
        hora_salida, 
        aerolinea_salida, 
        vuelo_salida,
        codigo_descuento, 
        porcentaje_descuento, 
        precio_servicio, 
        zona, 
        total_pago,
        tipo_viaje, 
        estatus_viaje,
        comentarios
      FROM reservaciones
      WHERE chofer = $1 AND estatus_viaje = $2
    `;

    const values = [usuario, estatus];
    const result = await pool.query(query, values);

    res.json({ success: true, servicios: result.rows });
  } catch (error) {
    console.error("❌ Error al obtener servicios:", error);
    res.status(500).json({ success: false, message: 'Error al obtener servicios' });
  }
}