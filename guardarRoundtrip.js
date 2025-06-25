// guardarRoundtrip.js
import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';

export default async function guardarRoundtrip(req, res) {
  const datos = req.body;

  console.log("📥 Datos recibidos en guardarRoundtrip:", datos);

  if (!datos || !datos.tipo_viaje || !datos.hotel || !datos.capacidad || !datos.pasajeros || !datos.total) {
    console.warn("⚠️ Datos incompletos:", datos);
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // Obtener folio consecutivo tipo TR-XXXXXX
    const result = await pool.query("SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1");
    const ultimoFolio = result.rows[0]?.folio || 'TR-000000';
    const numero = parseInt(ultimoFolio.replace('TR-', '')) + 1;
    const nuevoFolio = `TR-${numero.toString().padStart(6, '0')}`;

    console.log("🧾 Nuevo folio generado:", nuevoFolio);

    // Obtener zona automáticamente desde el hotel
    const zonaQuery = await pool.query("SELECT zona_id AS zona FROM hoteles_zona WHERE nombre_hotel = $1", [datos.hotel]);
    const zona = zonaQuery.rows[0]?.zona || '';

    console.log(`📍 Zona detectada para hotel '${datos.hotel}':`, zona);

    // Validar cliente
    if (!datos.cliente || !datos.cliente.nombre || !datos.cliente.email) {
      console.warn("⚠️ Datos del cliente incompletos:", datos.cliente);
      return res.status(400).json({ error: 'Datos del cliente incompletos' });
    }

    // Validar llegada y salida
    if (!datos.fecha_llegada || !datos.hora_llegada || !datos.aerolinea_llegada || !datos.vuelo_llegada) {
  console.warn("⚠️ Faltan datos de llegada:", datos);
  return res.status(400).json({ error: 'Faltan datos de llegada' });
}

if (!datos.fecha_salida || !datos.hora_salida || !datos.aerolinea_salida || !datos.vuelo_salida) {
  console.warn("⚠️ Faltan datos de salida:", datos);
  return res.status(400).json({ error: 'Faltan datos de salida' });
}

    // Insertar en base de datos
    await pool.query(
      `INSERT INTO reservaciones (
        folio, tipo_viaje, tipo_transporte, hotel_llegada, hotel_salida, zona, capacidad,
        cantidad_pasajeros, codigo_descuento, precio_total, nombre, apellido,
        correo_cliente, telefono, comentarios,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        tipo_servicio, porcentaje_descuento, precio_servicio, fecha, estatus
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26, $27, $28
      )`,
      [
        nuevoFolio,
        datos.tipo_viaje,
        datos.tipo_transporte || '',
        datos.hotel,
        datos.hotel,
        zona,
        datos.capacidad,
        datos.pasajeros,
        datos.codigo_descuento || '',
        datos.total,
        datos.cliente.nombre,
        datos.cliente.apellido || '',
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
        datos.salida.vuelo,
        'transportacion',
        datos.porcentaje_descuento || 0,
        datos.precio_servicio || 0,
        new Date().toISOString().split("T")[0],
        '1'
      ]
    );

    console.log("✅ Registro insertado correctamente");

    try {
      console.log("📧 Enviando correo de confirmación...");
      await enviarCorreoTransporte({
        ...datos,
        folio: nuevoFolio,
        zona
      });
      console.log("✅ Correo enviado con éxito");
    } catch (emailError) {
      console.error("❌ Error al enviar el correo:", emailError);
      // NO detenemos el flujo si falla el correo
    }

    return res.status(200).json({ ok: true, folio: nuevoFolio });

  } catch (err) {
    console.error('❌ Error en guardarRoundtrip:', err);
    console.trace();
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}