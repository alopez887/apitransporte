// guardarRoundtrip.js
import pool from './conexion.js';
import { enviarCorreoTransporte } from './correosTransporte.js';
import { generarQRTransporte } from './generarQRTransporte.js';
import crypto from 'crypto';

console.log('🟢 guardando roundtrip — con idioma + email_reservacion');

// 🔹 Helper: redondear a 2 decimales
function round2(v) {
  const n = Number(v) || 0;
  return Math.round(n * 100) / 100;
}

export default async function guardarRoundtrip(req, res) {
  const datos = req.body || {};

  const idioma = (String(datos?.idioma || '').toLowerCase().startsWith('es')) ? 'es' : 'en';

  // nombre/teléfono/correo
  const nombre   = (datos.nombre ?? datos.cliente?.nombre ?? '').toString().trim();
  const apellido = (datos.apellido ?? datos.cliente?.apellido ?? '').toString().trim();
  const nombre_cliente   = `${nombre} ${apellido}`.trim() || (datos.cliente?.nombreCompleto || '').trim();
  const telefono_cliente = (datos.telefono_cliente ?? datos.cliente?.telefono ?? '').toString().trim();
  const correo_cliente   = (datos.correo_cliente   ?? datos.cliente?.email    ?? '').toString().trim();
  const nota             = (datos.nota ?? datos.cliente?.nota ?? '').toString();

  // 🔹 cantidad de pasajeros: usar lo que manda el iframe (cantidad_pasajeros)
  const cantidad = (() => {
    const fromIframe = parseInt(datos.cantidad_pasajeros ?? datos.pasajeros ?? 0, 10);
    if (Number.isFinite(fromIframe) && fromIframe > 0) return fromIframe;

    // compat por si algún flujo viejo manda pasajeros_llegada / pasajeros_salida
    const cantLleg = parseInt(datos.pasajeros_llegada ?? datos.pasajeros ?? 0, 10) || 0;
    const cantSal  = parseInt(datos.pasajeros_salida ?? datos.pasajeros ?? 0, 10) || 0;
    return Math.max(cantLleg, cantSal, 0);
  })();

  // 🔹 total_pago con redondeo a 2 decimales (igual que guardarTransporte)
  const totalPagoRaw   = datos.total_pago ?? datos.total ?? 0;
  const totalPagoNum   = round2(totalPagoRaw);            // ej. 250.6566 → 250.66
  const total_pago     = Number(totalPagoNum.toFixed(2)); // num con 2 decimales "lógicos"
  const total_pago_str = totalPagoNum.toFixed(2);         // "250.60", "250.04", etc. (DB/log)

  const precio_servicio      = Number(datos.precio_servicio ?? 0) || 0;
  const porcentaje_descuento = Number(datos.porcentaje_descuento ?? 0) || 0;

  // 🔹 moneda (mismo criterio que en guardarTransporte)
  const moneda = (() => {
    const m = String(
      datos.moneda || datos.moneda_cobro_real || datos.moneda_cobro || 'USD'
    ).trim().toUpperCase();
    return m.startsWith('MXN') ? 'MXN' : 'USD';
  })();

  if (!nombre_cliente || !telefono_cliente || !total_pago) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // folio
    const rFolio = await pool.query(
      "SELECT folio FROM reservaciones WHERE folio LIKE 'TR-%' ORDER BY id DESC LIMIT 1"
    );
    const ultimo = rFolio.rows[0]?.folio || 'TR-000000';
    const numero = parseInt(ultimo.replace('TR-', ''), 10) + 1;
    const folio  = `TR-${numero.toString().padStart(6, '0')}`;

    // QR
    const token_qr = crypto.randomBytes(20).toString('hex');
    const qr = await generarQRTransporte(token_qr);

    // llegada
    const fecha_llegada      = datos.fecha_llegada || null;
    const hora_llegada       = (datos.hora_llegada || '').toString().trim() || null;
    const aerolinea_llegada  = datos.aerolinea_llegada || '';
    const vuelo_llegada      = datos.vuelo_llegada || '';
    const hotel_llegada      = datos.hotel_llegada || '';

    // salida
    const fecha_salida       = datos.fecha_salida || null;
    const hora_salida        = (datos.hora_salida || '').toString().trim() || null;
    const aerolinea_salida   = datos.aerolinea_salida || '';
    const vuelo_salida       = datos.vuelo_salida || '';
    const hotel_salida       = datos.hotel_salida || '';

    // zona
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

    // 🔹 Resolver "codigo" (igual que llegada)
    const codigo =
      (datos.codigo ??
       datos.codigo_transporte ??
       datos.codigoTransporte ??
       '').toString().trim();

    // 🔹 INSERT: ahora incluye `moneda` y usa `total_pago_str` (2 decimales fijos)
    const query = `
      INSERT INTO reservaciones (
        folio, tipo_servicio, tipo_transporte, codigo, proveedor, estatus, zona,
        capacidad, cantidad_pasajeros, hotel_llegada, hotel_salida,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        nombre_cliente, correo_cliente, nota, telefono_cliente, codigo_descuento,
        porcentaje_descuento, precio_servicio, total_pago, moneda, imagen,
        fecha, tipo_viaje, token_qr, idioma
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29,
        NOW() AT TIME ZONE 'America/Mazatlan', $30, $31, $32
      )
    `;

    const valores = [
      folio,                                      // $1
      'Transportacion',                           // $2
      (datos.tipo_transporte || 'ROUNDTRIP'),     // $3
      codigo,                                     // $4
      '',                                         // $5 proveedor
      1,                                          // $6 estatus
      zonaBD,                                     // $7
      datos.capacidad || '',                      // $8
      cantidad,                                   // $9  → cantidad_pasajeros (ya del iframe)
      hotel_llegada,                              // $10
      hotel_salida,                               // $11
      fecha_llegada,                              // $12
      hora_llegada,                               // $13
      aerolinea_llegada,                          // $14
      vuelo_llegada,                              // $15
      fecha_salida,                               // $16
      hora_salida,                                // $17
      aerolinea_salida,                           // $18
      vuelo_salida,                               // $19
      nombre_cliente,                             // $20
      correo_cliente,                             // $21
      nota,                                       // $22
      telefono_cliente,                           // $23
      datos.codigo_descuento || '',               // $24
      porcentaje_descuento,                       // $25
      precio_servicio,                            // $26
      total_pago_str,                             // $27  "XXXX.XX" SIEMPRE 2 decimales
      moneda,                                     // $28  'USD' | 'MXN'
      datos.imagen || '',                         // $29
      'Redondo',                                  // $30
      token_qr,                                   // $31
      idioma                                      // $32
    ];

    console.log('🗂 DB payload reservaciones (roundtrip) →', {
      folio,
      tipo_servicio: 'Transportacion',
      tipo_transporte: datos.tipo_transporte || 'ROUNDTRIP',
      codigo,
      zona: zonaBD,
      capacidad: datos.capacidad || '',
      cantidad,
      hoteles: { llegada: hotel_llegada, salida: hotel_salida },
      fechas:  { llegada: fecha_llegada, salida: fecha_salida },
      horas:   { llegada: hora_llegada,  salida: hora_salida  },
      vuelos:  { llegada: vuelo_llegada, salida: vuelo_salida },
      cliente: { nombre: nombre_cliente, correo: correo_cliente, tel: telefono_cliente },
      descuentos: { codigo: datos.codigo_descuento || '', porcentaje: porcentaje_descuento },
      precio_servicio,
      total_pago: total_pago_str, // 👈 log en texto con siempre 2 decimales
      moneda,                     // 👈 ahora sí alineado con guardarTransporte
      tipo_viaje: 'Redondo',
      idioma
    });

    await pool.query(query, valores);

    // correo + marca email_reservacion
    try {
      await enviarCorreoTransporte({
        ...datos,
        nombre_cliente,
        correo_cliente,
        telefono_cliente,
        folio,
        zona: zonaBD,
        total_pago,   // num; en plantilla lo formateas a 2 decimales
        moneda,       // 👈 ya la traes aquí también
        qr,
        idioma
        // la imagen ya viaja en ...datos (datos.imagen)
      });

      await pool.query(
        "UPDATE reservaciones SET email_reservacion = 'enviado' WHERE folio = $1",
        [folio]
      );
    } catch (mailErr) {
      console.error('❌ Error al enviar correo de roundtrip (GAS):', mailErr);
      await pool.query(
        "UPDATE reservaciones SET email_reservacion = 'error' WHERE folio = $1",
        [folio]
      );
      // no rompemos el flujo
    }

    res.status(200).json({ exito: true, folio, correo: correo_cliente });
  } catch (err) {
    console.error('❌ Error al guardar roundtrip:', err);
    res.status(500).json({ error: 'Error interno al guardar roundtrip.' });
  }
}
