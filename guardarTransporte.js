import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';

console.log("🟢 guardando transporte — versión ACTUAL ejecutándose");

export default async function guardarTransporte(req, res) {
  const datos = req.body;

  if (!datos || !datos.nombre || !datos.apellido || !datos.telefono || !datos.precio_total) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    console.log("📥 Datos recibidos:", datos);

    const result = await pool.query("SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1");
    const ultimoFolio = result.rows[0]?.folio || 'TR-000000';
    const numero = parseInt(ultimoFolio.replace('TR-', '')) + 1;
    const nuevoFolio = `TR-${numero.toString().padStart(6, '0')}`;

    console.log("🆕 Nuevo folio generado:", nuevoFolio);

    const porcentaje_descuento = (datos.porcentaje_descuento && !isNaN(Number(datos.porcentaje_descuento)))
      ? Number(datos.porcentaje_descuento)
      : 0;

    const precio_servicio = (datos.precio_servicio && !isNaN(Number(datos.precio_servicio)))
      ? Number(datos.precio_servicio)
      : 0;

    console.log("✅ porcentaje_descuento:", porcentaje_descuento);
    console.log("✅ precio_servicio:", precio_servicio);
    console.log("⏰ hora_llegada cruda:", datos.hora_llegada);

    let hora_llegada = null;
    if (typeof datos.hora_llegada === 'string' && datos.hora_llegada.trim() !== '') {
      const cruda = datos.hora_llegada.trim();
      const formato24 = cruda.match(/^(\d{1,2}):(\d{2})$/);
      const formato12 = cruda.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);

      if (formato24) {
        const horas = formato24[1].padStart(2, '0');
        const minutos = formato24[2];
        hora_llegada = `${horas}:${minutos}`;
      } else if (formato12) {
        let horas = parseInt(formato12[1], 10);
        const minutos = formato12[2];
        const periodo = formato12[3].toLowerCase();
        if (periodo === 'p.m.' && horas < 12) horas += 12;
        if (periodo === 'a.m.' && horas === 12) horas = 0;
        hora_llegada = `${horas.toString().padStart(2, '0')}:${minutos}`;
      }
    }

    console.log("⏳ hora_llegada final:", hora_llegada);

    const hora_salida = datos.hora_salida?.trim() || null;

    let zonaBD = '';
    if (datos.hotel_llegada) {
      const zonaResult = await pool.query(
        "SELECT zona FROM hoteles_zona WHERE UPPER(hotel) LIKE UPPER($1)",
        [`%${datos.hotel_llegada}%`]
      );
      console.log("📊 Resultado query zona:", zonaResult.rows);
      zonaBD = zonaResult.rows[0]?.zona || '';
      console.log("📍 Zona obtenida desde DB:", zonaBD);
    }

    // 🔎 LOG para confirmar base de datos activa
    const poolClient = await pool.connect();
    const dbInfo = await poolClient.query('SELECT current_database()');
    console.log("🧷 Conectado a base de datos:", dbInfo.rows[0]);
    poolClient.release();

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
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26,
        NOW() AT TIME ZONE 'America/Mazatlan'
      )
    `;

    const valores = [
      nuevoFolio,
      'transportacion',
      datos.tipo_transporte || '',
      datos.proveedor || '',
      1,
      zonaBD,
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

    console.log("🧾 QUERY:", query);
    console.log("📦 VALORES:", valores);

    await pool.query(query, valores);
    await enviarCorreoTransporte({ folio: nuevoFolio, ...datos, zona: zonaBD });

    res.status(200).json({
      exito: true,
      folio: nuevoFolio,
      mensaje: `Reservación registrada correctamente con folio ${nuevoFolio}.`
    });

  } catch (error) {
    console.error("❌ Error al guardar transporte:");
    console.error("📛 Mensaje:", error.message);
    console.error("📄 Detalle:", error.detail);
    console.error("📌 Código:", error.code);
    console.error("📍 Stack:", error.stack);
    res.status(500).json({ error: "Error interno al guardar transporte." });
  }
}