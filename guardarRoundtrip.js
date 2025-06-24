// guardarRoundtrip.js
import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';

export default async function guardarRoundtrip(req, res) {
  const datos = req.body;

  if (!datos || !datos.tipo_viaje || !datos.hotel || !datos.capacidad || !datos.pasajeros || !datos.total) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // Obtener folio consecutivo tipo TR-XXXXXX
    const result = await pool.query("SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1");
    const ultimoFolio = result.rows[0]?.folio || 'TR-000000';
    const numero = parseInt(ultimoFolio.replace('TR-', '')) + 1;
    const nuevoFolio = `TR-${numero.toString().padStart(6, '0')}`;

    // Obtener zona automáticamente desde el hotel
    const zonaQuery = await pool.query("SELECT zona_id AS zona FROM hoteles_zona WHERE nombre_hotel = $1", [datos.hotel]);
    const zona = zonaQuery.rows[0]?.zona || '';

    // Insertar en la tabla de reservaciones
    await pool.query(
      `INSERT INTO reservaciones (
        folio, tipo_viaje, tipo_transporte, hotel_llegada, hotel_salida, zona, capacidad,
        cantidad_pasajeros, codigo_descuento, precio_total, nombre, apellido,
        correo, telefono, nota,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23
      )`,
      [
        nuevoFolio,
        datos.tipo_viaje,
        datos.tipo_transporte || '',
        datos.hotel,         // hotel_llegada
        datos.hotel,         // hotel_salida (igual por ahora)
        zona,
        datos.capacidad,
        datos.pasajeros,
        datos.codigo_descuento || '',
        datos.total,
        datos.cliente.nombre,
        datos.cliente.apellido,
        datos.cliente.email,
        datos.cliente.telefono,
        datos.cliente.comentarios || '',
        datos.llegada.fecha,
        datos.llegada.hora,
        datos.llegada.aerolinea,
        datos.llegada.vuelo,
        datos.salida.fecha,
        datos.salida.hora,
        datos.salida.aerolinea,
        datos.salida.vuelo
      ]
    );

    // Enviar correo de confirmación
    await enviarCorreoTransporte({
      ...datos,
      folio: nuevoFolio,
      zona
    });

    res.json({ ok: true, folio: nuevoFolio });
  } catch (err) {
    console.error('❌ Error en guardarRoundtrip:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}