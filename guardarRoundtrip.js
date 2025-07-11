import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';
import { generarQRTransporte } from './generarQRTransporte.js';
import crypto from 'crypto';

export default async function guardarRoundtrip(req, res) {
  const datos = req.body;

  console.log("📥 Datos recibidos en guardarRoundtrip:", datos);

  if (!datos || !datos.tipo_viaje || !datos.hotel_llegada || !datos.capacidad || !datos.cantidad_pasajeros || !datos.total_pago) {
    console.warn("⚠️ Datos incompletos:", datos);
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const nombre = datos.nombre || '';
  const apellido = datos.apellido || '';
  const nombre_cliente = `${nombre} ${apellido}`.trim();
  const telefono_cliente = datos.telefono_cliente || '';
  const correo_cliente = datos.correo_cliente || '';
  const nota = datos.nota || '';

  if (!nombre_cliente || !correo_cliente) {
    console.warn("⚠️ Datos del cliente incompletos:", datos);
    return res.status(400).json({ error: 'Datos del cliente incompletos' });
  }

  if (!datos.fecha_llegada || !datos.hora_llegada || !datos.aerolinea_llegada || !datos.vuelo_llegada) {
    console.warn("⚠️ Faltan datos de llegada:", datos);
    return res.status(400).json({ error: 'Faltan datos de llegada' });
  }

  if (!datos.fecha_salida || !datos.hora_salida || !datos.aerolinea_salida || !datos.vuelo_salida) {
    console.warn("⚠️ Faltan datos de salida:", datos);
    return res.status(400).json({ error: 'Faltan datos de salida' });
  }

  try {
    const result = await pool.query("SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1");
    const ultimoFolio = result.rows[0]?.folio || 'TR-000000';
    const numero = parseInt(ultimoFolio.replace('TR-', '')) + 1;
    const nuevoFolio = `TR-${numero.toString().padStart(6, '0')}`;

    console.log("🧾 Nuevo folio generado:", nuevoFolio);
    
    const token_qr = crypto.randomBytes(20).toString('hex');
    console.log("🔑 Token QR generado:", token_qr);

    const qr = await generarQRTransporte(token_qr);
    console.log("📄 QR generado (para el correo):", qr);

    const zonaQuery = await pool.query("SELECT zona_id AS zona FROM hoteles_zona WHERE nombre_hotel = $1", [datos.hotel_llegada]);
    const zona = zonaQuery.rows[0]?.zona || '';

    console.log(`📍 Zona detectada para hotel '${datos.hotel_llegada}':`, zona);

    await pool.query(
      `INSERT INTO reservaciones (
        folio, tipo_viaje, tipo_transporte, hotel_llegada, hotel_salida, zona, capacidad,
        cantidad_pasajeros, codigo_descuento, total_pago, nombre_cliente,
        correo_cliente, telefono_cliente, nota,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        tipo_servicio, porcentaje_descuento, precio_servicio, fecha, estatus, token_qr
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, NOW() AT TIME ZONE 'America/Mazatlan', $26, $27
      )`,
      [
        nuevoFolio,
        datos.tipo_viaje,
        datos.tipo_transporte || '',
        datos.hotel_llegada,
        datos.hotel_salida,
        zona,
        datos.capacidad,
        datos.cantidad_pasajeros,
        datos.codigo_descuento || '',
        datos.total_pago,
        nombre_cliente,
        correo_cliente,
        telefono_cliente,
        nota,
        datos.fecha_llegada,
        datos.hora_llegada,
        datos.aerolinea_llegada,
        datos.vuelo_llegada,
        datos.fecha_salida,
        datos.hora_salida,
        datos.aerolinea_salida,
        datos.vuelo_salida,
        'Transportacion',
        datos.porcentaje_descuento || 0,
        datos.precio_servicio || 0,
        '1',
        token_qr
      ]
    );

    console.log("✅ Registro insertado correctamente");

    try {
      console.log("📧 Enviando correo de confirmación...");
      await enviarCorreoTransporte({
        ...datos,
        nombre_cliente,
        folio: nuevoFolio,
        zona,
        qr
      });
      console.log("✅ Correo enviado con éxito");
    } catch (emailError) {
      console.error("❌ Error al enviar el correo:", emailError);
    }

    return res.status(200).json({ exito: true, folio: nuevoFolio });

  } catch (err) {
    console.error('❌ Error en guardarRoundtrip:', err);
    console.trace();
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}