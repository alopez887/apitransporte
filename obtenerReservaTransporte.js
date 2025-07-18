import pool from './conexion.js';

export async function obtenerReservaTransporte(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token requerido' });
  }

  try {
    const query = `
      SELECT 
        folio, tipo_viaje, tipo_transporte, zona, capacidad,
        cantidad_pasajeros, codigo_descuento, total_pago, nombre_cliente, correo_cliente, 
        telefono_cliente, nota, fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida, tipo_servicio, 
        porcentaje_descuento, precio_servicio, fecha, estatus, proveedor, folio_proveedor, 
        fecha_reservacion,

        -- Llegada
        usuario_proveedorllegada, fecha_inicioviajellegada, fecha_finalviajellegada, 
        comentariosllegada, firma_clientellegada, choferllegada, numero_unidadllegada, 
        estatus_viajellegada, cantidad_pasajerosokllegada,

        -- Salida
        usuario_proveedorsalida, fecha_inicioviajesalida, fecha_finalviajesalida, 
        comentariossalida, firma_clientesalida, chofersalida, numero_unidadsalida, 
        estatus_viajesalida, cantidad_pasajerosoksalida

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