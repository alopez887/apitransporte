import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';
import { generarQRTransporte } from './generarQRTransporte.js';
import crypto from 'crypto';

console.log("🟢 guardando transporte — llegada, salida y shuttle — versión con idioma");

export default async function guardarTransporte(req, res) {
  const datos = req.body;

  // === idioma (nuevo) ===
  const idioma = (String(datos?.idioma || '').toLowerCase().startsWith('es')) ? 'es' : 'en';

  // Validación básica (igual)
  const cantidadPasajeros = parseInt(datos.pasajeros, 10) || parseInt(datos.cantidad_pasajeros, 10) || 0;
  const nombre   = datos.nombre   || datos.cliente?.nombre   || '';
  const apellido = datos.apellido || datos.cliente?.apellido || '';
  const nombre_cliente   = `${nombre} ${apellido}`.trim();
  const telefono_cliente = datos.telefono_cliente || datos.cliente?.telefono || '';
  const correo_cliente   = datos.correo_cliente   || datos.cliente?.email    || '';
  const nota             = datos.nota || datos.cliente?.nota || '';
  const total_pago       = Number(datos.total_pago || datos.total || 0);

  if (!nombre_cliente || !telefono_cliente || !total_pago) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    const result = await pool.query("SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1");
    const ultimoFolio = result.rows[0]?.folio || 'TR-000000';
    const numero      = parseInt(ultimoFolio.replace('TR-', '')) + 1;
    const nuevoFolio  = `TR-${numero.toString().padStart(6, '0')}`;

    const token_qr = crypto.randomBytes(20).toString('hex');
    const qr = await generarQRTransporte(token_qr);

    const porcentaje_descuento = (datos.porcentaje_descuento && !isNaN(Number(datos.porcentaje_descuento)))
      ? Number(datos.porcentaje_descuento) : 0;

    const precio_servicio = (datos.precio_servicio && !isNaN(Number(datos.precio_servicio)))
      ? Number(datos.precio_servicio) : 0;

    // 🧳 Variables de llegada y salida (sin cambios funcionales)
    let fecha_llegada = null, hora_llegada = null, aerolinea_llegada = '', vuelo_llegada = '', hotel_llegada = '';
    let fecha_salida  = datos.fecha_salida || null;
    let hora_salida   = datos.hora_salida?.trim() || null;
    let aerolinea_salida = datos.aerolinea_salida || '';
    let vuelo_salida     = datos.vuelo_salida || '';
    let hotel_salida     = datos.hotel_salida || '';

    const esShuttle = datos.tipo_viaje === "Shuttle";
    if (datos.tipo_viaje === "Llegada" || esShuttle) {
      fecha_llegada      = datos.fecha_llegada || datos.fecha || null;
      hora_llegada       = datos.hora_llegada?.trim() || datos.hora || null;
      aerolinea_llegada  = datos.aerolinea_llegada || datos.aerolinea || '';
      vuelo_llegada      = datos.vuelo_llegada || datos.numero_vuelo || '';
      hotel_llegada      = datos.hotel_llegada || datos.hotel || '';
    }

    // Normalización de hora (igual)
    if (typeof hora_llegada === 'string' && hora_llegada.trim() !== '') {
      const cruda = hora_llegada.trim();
      const formato24 = cruda.match(/^(\d{1,2}):(\d{2})$/);
      const formato12 = cruda.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
      if (formato24) {
        const horas = formato24[1].padStart(2,'0'); const minutos = formato24[2];
        hora_llegada = `${horas}:${minutos}`;
      } else if (formato12) {
        let horas = parseInt(formato12[1],10); const minutos = formato12[2];
        const periodo = formato12[3].toLowerCase();
        if (periodo === 'p.m.' && horas < 12) horas += 12;
        if (periodo === 'a.m.' && horas === 12) horas = 0;
        hora_llegada = `${horas.toString().padStart(2,'0')}:${minutos}`;
      }
    }

    // Zona (igual)
    let zonaBD = '';
    if (datos.zona && String(datos.zona).trim() !== '') {
      zonaBD = String(datos.zona).trim();
    } else if (hotel_llegada) {
      const r = await pool.query("SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1)", [`%${hotel_llegada}%`]);
      zonaBD = r.rows[0]?.zona_id || '';
    } else if (hotel_salida) {
      const r = await pool.query("SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1)", [`%${hotel_salida}%`]);
      zonaBD = r.rows[0]?.zona_id || '';
    }

    // === INSERT con columna idioma (NUEVO) ===
    const query = `
      INSERT INTO reservaciones (
        folio, tipo_servicio, tipo_transporte, proveedor, estatus, zona,
        capacidad, cantidad_pasajeros, hotel_llegada, hotel_salida,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        nombre_cliente, correo_cliente, nota, telefono_cliente, codigo_descuento,
        porcentaje_descuento, precio_servicio, total_pago, fecha, tipo_viaje, token_qr,
        idioma
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26,
        NOW() AT TIME ZONE 'America/Mazatlan'), $27, $28,
        $29
      )
    `;

    const valores = [
      nuevoFolio,
      'Transportacion',
      datos.tipo_transporte || '',
      '', // proveedor
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
      nombre_cliente,
      correo_cliente,
      nota,
      telefono_cliente,
      datos.codigo_descuento || '',
      porcentaje_descuento,
      precio_servicio,
      total_pago,
      datos.tipo_viaje || '',
      token_qr,
      idioma // <--- NUEVO
    ];

    console.log("🗂 DB payload reservaciones →", {
      folio: nuevoFolio, tipo_servicio:'Transportacion', tipo_transporte: datos.tipo_transporte || '',
      zona: zonaBD, capacidad: datos.capacidad || '', cantidad: cantidadPasajeros,
      hoteles: { llegada: hotel_llegada, salida: hotel_salida },
      fechas:  { llegada: fecha_llegada, salida: fecha_salida },
      horas:   { llegada: hora_llegada,  salida: hora_salida  },
      vuelos:  { llegada: vuelo_llegada, salida: vuelo_salida },
      cliente: { nombre: nombre_cliente, correo: correo_cliente, tel: telefono_cliente },
      descuentos: { codigo: datos.codigo_descuento || '', porcentaje: porcentaje_descuento },
      precio_servicio, total_pago, tipo_viaje: datos.tipo_viaje || '', idioma
    });

    await pool.query(query, valores);

    await enviarCorreoTransporte({
      ...datos,
      nombre_cliente,
      folio: nuevoFolio,
      zona: zonaBD,
      total_pago,
      imagen: datos.imagen || '',
      qr,
      idioma // <--- pasar idioma al mailer (lo ajustamos luego)
    });

    res.status(200).json({
      exito: true,
      folio: nuevoFolio,
      correo: correo_cliente,
      mensaje: `Reservación registrada correctamente con folio ${nuevoFolio}.`
    });

  } catch (error) {
    console.error("❌ Error al guardar transporte:", error);
    res.status(500).json({ error: "Error interno al guardar transporte." });
  }
}
