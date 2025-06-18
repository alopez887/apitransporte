import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';

export default async function guardarTransporte(req, res) {
  const datos = req.body;

  if (!datos || !datos.nombre || !datos.apellido || !datos.telefono || !datos.precio_total) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    const result = await pool.query("SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1");
    const ultimoFolio = result.rows[0]?.folio || 'TR-000000';
    const numero = parseInt(ultimoFolio.replace('TR-', '')) + 1;
    const nuevoFolio = `TR-${numero.toString().padStart(6, '0')}`;

    // 🟢 Logs para ver qué llega
    console.log("📦 porcentaje_descuento recibido:", datos.porcentaje_descuento);
    console.log("📦 precio_servicio recibido:", datos.precio_servicio);

    // Corrección de campos que podrían venir como string vacío
    const porcentaje_descuento = (datos.porcentaje_descuento && !isNaN(Number(datos.porcentaje_descuento)))
      ? Number(datos.porcentaje_descuento)
      : 0;

    const precio_servicio = (datos.precio_servicio && !isNaN(Number(datos.precio_servicio)))
      ? Number(datos.precio_servicio)
      : 0;

    const hora_llegada = datos.hora_llegada && datos.hora_llegada.trim() !== '' ? datos.hora_llegada : null;
    const hora_salida = datos.hora_salida && datos.hora_salida.trim() !== '' ? datos.hora_salida : null;

    const query = `
      INSERT INTO reservaciones (
        folio, tipo_servicio, tipo_transporte, proveedor, estatus, zona,
        capacidad, cantidad_pasajeros, hotel_llegada, hotel_salida,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        nombre, apellido, comentarios, telefono, codigo_descuento,
        porcentaje_descuento, precio_servicio, precio_total,
        fecha
      ) VALUES (
        $1, 'transportacion', $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21, $22,
        $23, $24, $25,
        NOW()
      )
    `;

    const valores = [
      nuevoFolio,
      datos.tipo_transporte || '',
      datos.proveedor || '',
      1, // Estatus 1 = Activo (ya pagado)
      datos.zona || '',
      datos.capacidad || '',
      datos.cantidad_pasajeros || 0,
      datos.hotel_llegada || '',
      datos.hotel_salida || '',
      datos.fecha_llegada || null,
      hora_llegada,
      datos.aerolinea_llegada || '',
      datos.vuelo_llegada || '',
      datos.fecha_salida || null,
      hora_salida,
      datos.aerolinea_salida || '',
      datos.vuelo_salida || '',
      datos.nombre || '',
      datos.apellido || '',
      datos.comentarios || '',
      datos.telefono || '',
      datos.codigo_descuento || '',
      porcentaje_descuento,
      precio_servicio,
      Number(datos.precio_total) || 0
    ];

    await pool.query(query, valores);
    await enviarCorreoTransporte({ folio: nuevoFolio, ...datos });

    res.status(200).json({
      exito: true,
      folio: nuevoFolio,
      mensaje: `Reservación registrada correctamente con folio ${nuevoFolio}.`
    });
  } catch (error) {
    console.error("❌ Error al guardar transporte:", error);
    res.status(500).json({ error: "Error interno al guardar transporte." });
  }
}