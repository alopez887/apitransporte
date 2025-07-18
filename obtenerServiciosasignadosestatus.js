import pool from './conexion.js';

export async function obtenerServiciosAsignadosEstatus(req, res) {
  const { usuario, tipo_viaje } = req.query;

  if (!usuario) {
    return res.status(400).json({ success: false, message: 'Falta parámetro usuario' });
  }

  let query = '';
  let values = [];

  try {
    if (tipo_viaje === 'llegada') {
      query = `
        SELECT 
          folio, nombre_cliente, correo_cliente, telefono_cliente, nota,
          tipo_servicio, tipo_transporte, capacidad, cantidad_pasajeros,
          hotel_llegada, fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
          codigo_descuento, porcentaje_descuento, precio_servicio, zona, total_pago,
          tipo_viaje, estatus_viajellegada AS estatus_viaje, comentariosllegada AS comentarios,
          choferllegada AS chofer
        FROM reservaciones
        WHERE choferllegada = $1 AND estatus_viajellegada != 'finalizado'
      `;
      values = [usuario];
    } else if (tipo_viaje === 'salida') {
      query = `
        SELECT 
          folio, nombre_cliente, correo_cliente, telefono_cliente, nota,
          tipo_servicio, tipo_transporte, capacidad, cantidad_pasajeros,
          hotel_salida, fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
          codigo_descuento, porcentaje_descuento, precio_servicio, zona, total_pago,
          tipo_viaje, estatus_viajesalida AS estatus_viaje, comentariossalida AS comentarios,
          chofersalida AS chofer
        FROM reservaciones
        WHERE chofersalida = $1 AND estatus_viajesalida != 'finalizado'
      `;
      values = [usuario];
    } else {
      // Mostrar todos los tipos de viaje que estén asignados y no finalizados
      query = `
        SELECT 
          folio, nombre_cliente, correo_cliente, telefono_cliente, nota,
          tipo_servicio, tipo_transporte, capacidad, cantidad_pasajeros,
          hotel_llegada, fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
          hotel_salida, fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
          codigo_descuento, porcentaje_descuento, precio_servicio, zona, total_pago,
          tipo_viaje,
          estatus_viajellegada, estatus_viajesalida,
          comentariosllegada, comentariossalida,
          choferllegada, chofersalida
        FROM reservaciones
        WHERE (choferllegada = $1 AND estatus_viajellegada != 'finalizado')
           OR (chofersalida = $1 AND estatus_viajesalida != 'finalizado')
      `;
      values = [usuario];
    }

    const result = await pool.query(query, values);
    res.json({ success: true, servicios: result.rows });

  } catch (error) {
    console.error("❌ Error al obtener servicios:", error);
    res.status(500).json({ success: false, message: 'Error al obtener servicios' });
  }
}