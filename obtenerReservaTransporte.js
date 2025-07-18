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
        usuario_proveedor, fecha_reservacion,
        fecha_inicioviaje, fecha_finalviaje,
        comentariosllegada, comentariossalida,
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

    // Normalizar campos según tipo_viaje
    let chofer = null;
    let estatus_viaje = null;
    let comentarios = null;
    let firma_cliente = null;

    if (reserva.tipo_viaje === 'llegada') {
      chofer = reserva.choferllegada;
      estatus_viaje = reserva.estatus_viaje_llegada;
      comentarios = reserva.comentariosllegada;
      firma_cliente = reserva.firma_cliente_llegada;
    } else if (reserva.tipo_viaje === 'salida') {
      chofer = reserva.chofersalida;
      estatus_viaje = reserva.estatus_viajesalida;
      comentarios = reserva.comentariossalida;
      firma_cliente = reserva.firma_cliente_salida;
    } else if (reserva.tipo_viaje === 'redondo') {
      // En viajes redondos puedes incluir ambos campos si lo deseas
      chofer = {
        llegada: reserva.choferllegada,
        salida: reserva.chofersalida
      };
      estatus_viaje = {
        llegada: reserva.estatus_viaje_llegada,
        salida: reserva.estatus_viajesalida
      };
      comentarios = {
        llegada: reserva.comentariosllegada,
        salida: reserva.comentariossalida
      };
      firma_cliente = {
        llegada: reserva.firma_cliente_llegada,
        salida: reserva.firma_cliente_salida
      };
    }

    return res.json({
      success: true,
      reserva: {
        ...reserva,
        chofer,
        estatus_viaje,
        comentarios,
        firma_cliente
      }
    });

  } catch (error) {
    console.error("❌ Error al obtener reserva por token:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}