import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';

console.log("🟢 guardando transporte — versión ACTUAL ejecutándose");

export default async function guardarTransporte(req, res) {
  const datos = req.body;
  
  console.log("🧩 Validación inicial:");
  console.log("Nombre:", datos.nombre);
  console.log("Apellido:", datos.apellido);
  console.log("Teléfono:", datos.telefono);
  console.log("Total:", datos.precio_total);

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

    // 🔁 Compatibilidad: hora_llegada (conformateo si aplica)
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

    // ⏰ Datos de salida o redondo
    const fecha_salida = datos.tipo_viaje === "Salida" || datos.tipo_viaje === "Redondo" ? datos.fecha : null;
    const hora_salida = datos.tipo_viaje === "Salida" || datos.tipo_viaje === "Redondo" ? datos.hora?.trim() || null : null;
    const aerolinea_salida = datos.tipo_viaje === "Salida" || datos.tipo_viaje === "Redondo" ? datos.aerolinea || '' : '';
    const vuelo_salida = datos.tipo_viaje === "Salida" || datos.tipo_viaje === "Redondo" ? datos.numero_vuelo || '' : '';

    // 🧭 Zona
let zonaBD = '';
if (datos.zona && datos.zona.trim() !== '') {
  zonaBD = datos.zona.trim();
  console.log("📍 Zona obtenida desde frontend:", zonaBD);
} else if (datos.hotel_llegada) {
  const zonaResult = await pool.query(
    "SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1)",
    [`%${datos.hotel_llegada}%`]
  );
  console.log("📊 Resultado query zona (por hotel_llegada):", zonaResult.rows);
  zonaBD = zonaResult.rows[0]?.zona_id || '';
  console.log("📍 Zona obtenida desde DB:", zonaBD);
} else if (datos.hotel_salida) {
  const zonaResult = await pool.query(
    "SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1)",
    [`%${datos.hotel_salida}%`]
  );
  console.log("📊 Resultado query zona (por hotel_salida):", zonaResult.rows);
  zonaBD = zonaResult.rows[0]?.zona_id || '';
  console.log("📍 Zona obtenida desde DB:", zonaBD);
}

    const query = `
      INSERT INTO reservaciones (
        folio, tipo_servicio, tipo_transporte, proveedor, estatus, zona,
        capacidad, cantidad_pasajeros, hotel_llegada, hotel_salida,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        nombre, apellido, correo_cliente, comentarios, telefono, codigo_descuento,
        porcentaje_descuento, precio_servicio, precio_total, fecha
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24,
        $25, $26, $27,
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
      fecha_salida,
      hora_salida,
      aerolinea_salida,
      vuelo_salida,
      datos.nombre || '',
      datos.apellido || '',
      datos.correo_cliente || '',
      datos.comentarios || '',
      datos.telefono || '',
      datos.codigo_descuento || '',
      porcentaje_descuento,
      precio_servicio,
      Number(datos.precio_total) || 0
    ];

    console.log("🧾 QUERY:", query);
    console.log("📦 VALORES:", valores);
    console.log("🖼️ Enviando imagen al correo:", datos.imagen);

    await pool.query(query, valores);

    await enviarCorreoTransporte({
      ...datos,
      folio: nuevoFolio,
      zona: zonaBD,
      precio_total: Number(datos.precio_total || 0),
      imagen: datos.imagen || ''
    });

    res.status(200).json({
      exito: true,
      folio: nuevoFolio,
      correo: datos.correo_cliente,
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