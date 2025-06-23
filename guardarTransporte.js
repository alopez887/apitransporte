// 🛠️ Backup para llegada/salida - 100% funcional
import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';

console.log("🟢 guardando transporte — versión ACTUAL ejecutándose");

export default async function guardarTransporte(req, res) {
  const datos = req.body;

  console.log("🧩 Validación inicial:");
  console.log("Nombre:", datos.nombre || datos.cliente?.nombre);
  console.log("Apellido:", datos.apellido || datos.cliente?.apellido);
  console.log("Teléfono:", datos.telefono || datos.cliente?.telefono);
  console.log("Total:", datos.precio_total || datos.total);

  const cantidadPasajeros = parseInt(datos.pasajeros, 10) || parseInt(datos.cantidad_pasajeros, 10) || 0;
  const nombre = datos.nombre || datos.cliente?.nombre || '';
  const apellido = datos.apellido || datos.cliente?.apellido || '';
  const telefono = datos.telefono || datos.cliente?.telefono || '';
  const correo_cliente = datos.correo_cliente || datos.cliente?.email || '';
  const comentarios = datos.comentarios || datos.nota || datos.cliente?.comentarios || '';
  const precio_total = Number(datos.precio_total || datos.total || 0);

  if (!nombre || !apellido || !telefono || !precio_total) {
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

    // 🧳 Variables de llegada y salida
    let fecha_llegada = null;
    let hora_llegada = null;
    let aerolinea_llegada = '';
    let vuelo_llegada = '';
    let hotel_llegada = '';

    let fecha_salida = null;
    let hora_salida = null;
    let aerolinea_salida = '';
    let vuelo_salida = '';
    let hotel_salida = '';

    if (datos.tipo_viaje === "Ida y vuelta") {
      // 🧩 Soporte para estructura plana o anidada
      fecha_llegada = datos.fecha_llegada || datos.llegada?.fecha || null;
      hora_llegada = datos.hora_llegada?.trim() || datos.llegada?.hora || null;
      aerolinea_llegada = datos.aerolinea_llegada || datos.llegada?.aerolinea || '';
      vuelo_llegada = datos.vuelo_llegada || datos.llegada?.vuelo || '';
      hotel_llegada = datos.hotel_llegada || datos.hotel || '';

      fecha_salida = datos.fecha_salida || datos.salida?.fecha || null;
      hora_salida = datos.hora_salida?.trim() || datos.salida?.hora || null;
      aerolinea_salida = datos.aerolinea || datos.salida?.aerolinea || '';
      vuelo_salida = datos.numero_vuelo || datos.salida?.vuelo || '';
      hotel_salida = datos.hotel_salida || datos.hotel || '';
    } else if (datos.tipo_viaje === "Llegada") {
	 fecha_llegada = datos.fecha_llegada || datos.fecha || null;
	 hora_llegada = datos.hora_llegada?.trim() || datos.hora || null;
	 aerolinea_llegada = datos.aerolinea_llegada || datos.aerolinea || '';
	 vuelo_llegada = datos.vuelo_llegada || datos.numero_vuelo || '';
	 hotel_llegada = datos.hotel_llegada || datos.hotel || '';

    } else if (datos.tipo_viaje === "Salida") {
      fecha_salida = datos.fecha || null;
      hora_salida = datos.hora?.trim() || null;
      aerolinea_salida = datos.aerolinea || '';
      vuelo_salida = datos.numero_vuelo || '';
      hotel_salida = datos.hotel_salida || datos.hotel || '';
    }

    // 🔁 Normalizar hora_llegada
    if (typeof hora_llegada === 'string' && hora_llegada.trim() !== '') {
      const cruda = hora_llegada.trim();
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

    // 🧭 Zona
    let zonaBD = '';
    if (datos.zona && datos.zona.trim() !== '') {
      zonaBD = datos.zona.trim();
      console.log("📍 Zona obtenida desde frontend:", zonaBD);
    } else if (hotel_llegada) {
      const zonaResult = await pool.query(
        "SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1)",
        [`%${hotel_llegada}%`]
      );
      console.log("📊 Resultado query zona (por hotel_llegada):", zonaResult.rows);
      zonaBD = zonaResult.rows[0]?.zona_id || '';
      console.log("📍 Zona obtenida desde DB:", zonaBD);
    } else if (hotel_salida) {
      const zonaResult = await pool.query(
        "SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1)",
        [`%${hotel_salida}%`]
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
      '', // proveedor vacío
      1,
      zonaBD,
      datos.capacidad || '',
      cantidadPasajeros,
      hotel_llegada,
      hotel_salida,
      fecha_llegada,
      hora_llegada,
      aerolinea_llegada,
      vuelo_llegada,
      fecha_salida,
      hora_salida,
      aerolinea_salida,
      vuelo_salida,
      nombre,
      apellido,
      correo_cliente,
      comentarios,
      telefono,
      datos.codigo_descuento || '',
      porcentaje_descuento,
      precio_servicio,
      precio_total
    ];

    console.log("🧾 QUERY:", query);
    console.log("📦 VALORES:", valores);
    console.log("🖼️ Enviando imagen al correo:", datos.imagen);

    await pool.query(query, valores);

    await enviarCorreoTransporte({
      ...datos,
      folio: nuevoFolio,
      zona: zonaBD,
      precio_total,
      imagen: datos.imagen || ''
    });

    res.status(200).json({
      exito: true,
      folio: nuevoFolio,
      correo: correo_cliente,
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