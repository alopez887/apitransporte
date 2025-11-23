// guardarTransporte.js 
import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';
import { generarQRTransporte } from './generarQRTransporte.js';
import crypto from 'crypto';

console.log('🟢 guardando transporte — llegada/salida/shuttle — con idioma + email_reservacion + moneda');

// 🔹 Helper para redondear a 2 decimales (igual idea que en reservar.js)
function round2(v) {
  const n = Number(v) || 0;
  return Math.round(n * 100) / 100;
}

export default async function guardarTransporte(req, res) {
  const datos = req.body || {};

  // === idioma (sin cambios) ===
  const idioma = (String(datos?.idioma || '').toLowerCase().startsWith('es')) ? 'es' : 'en';

  // === normalización básica (sin romper tu flujo) ===
  const cant = parseInt(datos.pasajeros, 10) || parseInt(datos.cantidad_pasajeros, 10) || 0;

  const nombre   = (datos.nombre ?? datos.cliente?.nombre ?? '').toString().trim();
  const apellido = (datos.apellido ?? datos.cliente?.apellido ?? '').toString().trim();
  const nombre_cliente   = `${nombre} ${apellido}`.trim() || (datos.cliente?.nombreCompleto || '').trim();
  const telefono_cliente = (datos.telefono_cliente ?? datos.cliente?.telefono ?? '').toString().trim();
  const correo_cliente   = (datos.correo_cliente   ?? datos.cliente?.email    ?? '').toString().trim();
  const nota             = (datos.nota ?? datos.cliente?.nota ?? '').toString();

  // 🔹 NUEVO: total_pago con redondeo a 2 decimales
  const totalPagoRaw   = datos.total_pago ?? datos.total ?? 0;
  const totalPagoNum   = round2(totalPagoRaw);              // p.ej. 250.6566 → 250.66
  const total_pago     = Number(totalPagoNum.toFixed(2));   // num con 2 decimales "lógicos"
  const total_pago_str = totalPagoNum.toFixed(2);           // "250.60", "250.04", etc. para DB/log

  // === NUEVO: moneda real de cobro (USD|MXN) ===
  const moneda = (String(
    datos.moneda || datos.moneda_cobro_real || datos.moneda_cobro || 'USD'
  ).toUpperCase() === 'MXN') ? 'MXN' : 'USD';

  // === texto de transporte y código (igual que tenías) ===
  const tipoTransporteTexto = (datos.tipo_transporte || datos.nombre_transporte || '').toString().trim();
  const codigoTransporte    = (datos.codigo_transporte || datos.codigo || '').toString().trim();

  // === NUEVO: imagen que viene del front (URL pública) ===
  const imagen = (datos.imagen || '').toString().trim();

  if (!nombre_cliente || !telefono_cliente || !total_pago) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // === folio ===
    const rFolio = await pool.query(
      "SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1"
    );
    const ultimoFolio = rFolio.rows[0]?.folio || 'TR-000000';
    const numero      = parseInt(ultimoFolio.replace('TR-', ''), 10) + 1;
    const folio       = `TR-${numero.toString().padStart(6, '0')}`;

    // === QR ===
    const token_qr = crypto.randomBytes(20).toString('hex');
    const qr = await generarQRTransporte(token_qr);

    // === descuentos/precio ===
    const porcentaje_descuento = Number(datos.porcentaje_descuento ?? 0) || 0;
    const precio_servicio      = Number(datos.precio_servicio ?? 0) || 0;

    // === Llegada / Salida ===
    let fecha_llegada = null, hora_llegada = null, aerolinea_llegada = '', vuelo_llegada = '', hotel_llegada = '';
    let fecha_salida  = null, hora_salida  = null, aerolinea_salida  = '', vuelo_salida  = '', hotel_salida  = '';

    const esShuttle = String(datos.tipo_viaje || '').toLowerCase() === 'shuttle';

    if (String(datos.tipo_viaje || '').toLowerCase() === 'llegada' || esShuttle) {
      fecha_llegada      = datos.fecha_llegada  || datos.fecha  || null;
      hora_llegada       = (datos.hora_llegada  || datos.hora || '').toString().trim() || null;
      aerolinea_llegada  = datos.aerolinea_llegada || datos.aerolinea || '';
      vuelo_llegada      = datos.vuelo_llegada     || datos.numero_vuelo || '';
      hotel_llegada      = datos.hotel_llegada     || datos.hotel || '';
    }

    if (String(datos.tipo_viaje || '').toLowerCase() === 'salida') {
      fecha_salida      = datos.fecha_salida  || null;
      hora_salida       = (datos.hora_salida  || '').toString().trim() || null;
      aerolinea_salida  = datos.aerolinea_salida || '';
      vuelo_salida      = datos.vuelo_salida     || '';
      hotel_salida      = datos.hotel_salida     || '';
    }

    // === normalización hora llegada (24h) ===
    if (typeof hora_llegada === 'string' && hora_llegada.trim()) {
      const h = hora_llegada.trim();
      const m24 = h.match(/^(\d{1,2}):(\d{2})$/);
      const m12 = h.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
      if (m24) {
        hora_llegada = `${m24[1].padStart(2,'0')}:${m24[2]}`;
      } else if (m12) {
        let hh = parseInt(m12[1],10); const mm = m12[2]; const per = m12[3].toLowerCase();
        if (per === 'p.m.' && hh < 12) hh += 12;
        if (per === 'a.m.' && hh === 12) hh = 0;
        hora_llegada = `${hh.toString().padStart(2,'0')}:${mm}`;
      }
    }

    // === zona (igual a tu flujo) ===
    let zonaBD = '';
    if (datos.zona && String(datos.zona).trim() !== '') {
      zonaBD = String(datos.zona).trim();
    } else if (hotel_llegada) {
      const rz = await pool.query(
        "SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1) LIMIT 1",
        [`%${hotel_llegada}%`]
      );
      zonaBD = rz.rows[0]?.zona_id || '';
    } else if (hotel_salida) {
      const rz = await pool.query(
        "SELECT zona_id FROM hoteles_zona WHERE UPPER(nombre_hotel) LIKE UPPER($1) LIMIT 1",
        [`%${hotel_salida}%`]
      );
      zonaBD = rz.rows[0]?.zona_id || '';
    }

    // === INSERT (agregamos 'moneda' e 'imagen' y mantenemos todo lo demás igual) ===
    const query = `
      INSERT INTO reservaciones (
        folio, tipo_servicio, tipo_transporte, proveedor, estatus, zona,
        capacidad, cantidad_pasajeros, hotel_llegada, hotel_salida,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        nombre_cliente, correo_cliente, nota, telefono_cliente, codigo_descuento,
        porcentaje_descuento, precio_servicio, total_pago, moneda,
        fecha, tipo_viaje, token_qr, idioma, codigo, imagen
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26, $27,
        NOW() AT TIME ZONE 'America/Mazatlan', $28, $29, $30, $31, $32
      )
    `;

    const valores = [
      // $1..$6
      folio,
      'Transportacion',
      tipoTransporteTexto,
      '',                         // proveedor
      1,
      zonaBD,

      // $7..$10
      datos.capacidad || '',
      cant,
      hotel_llegada,
      hotel_salida,

      // $11..$14
      fecha_llegada,
      hora_llegada,
      aerolinea_llegada,
      vuelo_llegada,

      // $15..$18
      fecha_salida,
      hora_salida,
      aerolinea_salida,
      vuelo_salida,

      // $19..$23
      nombre_cliente,
      correo_cliente,
      nota,
      telefono_cliente,
      datos.codigo_descuento || '',

      // $24..$27
      porcentaje_descuento,
      precio_servicio,
      total_pago_str,   // ⬅️ STRING con SIEMPRE 2 decimales ("250.60") para DB
      moneda,           // ⬅️ moneda

      // fecha -> NOW() AT TIME ZONE ...

      // $28..$32
      (datos.tipo_viaje || '').toString(),
      token_qr,
      idioma,
      codigoTransporte,          // guardamos en columna 'codigo'
      imagen                     // ⬅️ NUEVO: columna imagen
    ];

    console.log('🗂 DB payload reservaciones →', {
      folio, tipo_servicio:'Transportacion',
      tipo_transporte: tipoTransporteTexto,
      codigo: codigoTransporte,
      zona: zonaBD, capacidad: datos.capacidad || '', cantidad: cant,
      hoteles: { llegada: hotel_llegada, salida: hotel_salida },
      fechas:  { llegada: fecha_llegada, salida: fecha_salida },
      horas:   { llegada: hora_llegada,  salida: hora_salida  },
      vuelos:  { llegada: vuelo_llegada, salida: vuelo_salida },
      cliente: { nombre: nombre_cliente, correo: correo_cliente, tel: telefono_cliente },
      descuentos: { codigo: datos.codigo_descuento || '', porcentaje: porcentaje_descuento },
      precio_servicio,
      total_pago: total_pago_str, // 👈 log en texto con siempre 2 decimales
      moneda,
      tipo_viaje: datos.tipo_viaje || '', idioma,
      imagen                      // log de imagen que se guarda
    });

    await pool.query(query, valores);

    // ===== correo + marca email_reservacion =====
    try {
      await enviarCorreoTransporte({
        ...datos,
        // aseguramos consistencia en correo y moneda
        nombre_cliente,
        correo_cliente,
        telefono_cliente,
        folio,
        zona: zonaBD,
        total_pago,           // num (250.6 ≡ 250.60) → en plantilla lo formateas a 2 decimales
        moneda,               // ⬅️ útil si tu plantilla lo muestra
        imagen: datos.imagen || '',
        qr,
        idioma,
        tipo_transporte: tipoTransporteTexto,
        codigo_transporte: codigoTransporte
      });

      await pool.query(
        "UPDATE reservaciones SET email_reservacion = 'enviado' WHERE folio = $1",
        [folio]
      );

    } catch (mailErr) {
      console.error('❌ Error al enviar correo de transporte (GAS):', mailErr);
      await pool.query(
        "UPDATE reservaciones SET email_reservacion = 'error' WHERE folio = $1",
        [folio]
      );
      // NO rompemos la compra
    }

    res.status(200).json({
      exito: true,
      folio,
      correo: correo_cliente,
      mensaje: `Reservación registrada correctamente con folio ${folio}.`
    });

  } catch (error) {
    console.error('❌ Error al guardar transporte:', error);
    res.status(500).json({ error: 'Error interno al guardar transporte.' });
  }
}
