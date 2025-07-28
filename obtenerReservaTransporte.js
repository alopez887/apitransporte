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
        porcentaje_descuento, precio_servicio, fecha, estatus, proveedor,
        -- folio_proveedor eliminado

        hotel_llegada, hotel_salida,

        -- Llegada
        representante_llegada, fecha_inicioviajellegada, fecha_finalviajellegada, 
        comentariosllegada, firma_clientellegada, choferllegada, numero_unidadllegada, 
        estatus_viajellegada, cantidad_pasajerosokllegada,

        -- Salida
        representante_salida, fecha_inicioviajesalida, fecha_finalviajesalida, 
        comentariossalida, firma_clientesalida, chofersalida, numero_unidadsalida, 
        estatus_viajesalida, cantidad_pasajerosoksalida,

        -- Chofer externo
        chofer_externonombre, choferexterno_tel, chofer_empresaext

      FROM reservaciones
      WHERE token_qr = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const reserva = result.rows[0];

    const tipoViaje = reserva.tipo_viaje?.toLowerCase();
    const respuesta = { success: true, reserva };

    if (tipoViaje === 'llegada' && reserva.estatus_viajellegada === 'finalizado') {
      respuesta.finalizado = true;
      respuesta.detalle_finalizado = {
        representante: reserva.representante_llegada,
        fecha_inicio: reserva.fecha_inicioviajellegada,
        chofer: reserva.choferllegada,
        fecha_final: reserva.fecha_finalviajellegada
      };
    } else if (tipoViaje === 'salida' && reserva.estatus_viajesalida === 'finalizado') {
      respuesta.finalizado = true;
      respuesta.detalle_finalizado = {
        representante: reserva.representante_salida,
        fecha_inicio: reserva.fecha_inicioviajesalida,
        chofer: reserva.chofersalida,
        fecha_final: reserva.fecha_finalviajesalida
      };
    }

    return res.json(respuesta);

  } catch (error) {
    console.error("❌ Error al obtener reserva por token:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}