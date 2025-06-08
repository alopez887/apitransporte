// guardarTransporte.js
import pool from '../conexion.js';
import enviarCorreoTransporte from './correosTransporte.js';

export default async function guardarTransporte(req, res) {
  const {
    tipo_transporte, zona, hotel, pasajeros, tipo_viaje,
    vuelo_llegada, aerolinea_llegada,
    vuelo_salida, aerolinea_salida,
    nombre_cliente, correo_cliente, telefono_cliente, codigo_descuento,
    precio_original, precio_final, moneda, imagen, nota
  } = req.body;

  if (!tipo_transporte || !zona || !hotel || !pasajeros || !tipo_viaje || !nombre_cliente || !correo_cliente || !telefono_cliente) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const fecha = new Date();

  try {
    const folioResult = await pool.query(`SELECT folio FROM reservaciones ORDER BY id DESC LIMIT 1`);
    const ultimoFolio = folioResult.rows[0]?.folio || 'F-000000';
    const numero = parseInt(ultimoFolio.replace('F-', '')) + 1;
    const nuevoFolio = `F-${numero.toString().padStart(6, '0')}`;

    const query = `INSERT INTO reservaciones (
      folio, tipo_transporte, zona, hotel, pasajeros, tipo_viaje,
      vuelo_llegada, aerolinea_llegada, vuelo_salida, aerolinea_salida,
      nombre_cliente, correo_cliente, telefono_cliente, codigo_descuento,
      precio_original, precio_final, moneda, imagen, nota, fecha
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    `;

    const valores = [
      nuevoFolio, tipo_transporte, zona, hotel, pasajeros, tipo_viaje,
      vuelo_llegada || '', aerolinea_llegada || '', vuelo_salida || '', aerolinea_salida || '',
      nombre_cliente, correo_cliente, telefono_cliente, codigo_descuento || '',
      precio_original, precio_final, moneda || '', imagen || '', nota || '', fecha
    ];

    await pool.query(query, valores);

    await enviarCorreoTransporte({
      folio: nuevoFolio,
      tipo_transporte, zona, hotel, pasajeros, tipo_viaje,
      vuelo_llegada, aerolinea_llegada, vuelo_salida, aerolinea_salida,
      nombre_cliente, correo_cliente, telefono_cliente, codigo_descuento,
      precio_original, precio_final, moneda, imagen, nota
    });

    res.status(200).json({
      success: true,
      message: `Gracias por tu reservación. Tu folio es ${nuevoFolio}.`,
      folio: nuevoFolio
    });
  } catch (error) {
    console.error('❌ Error al guardar la reservación de transporte:', error);
    res.status(500).json({ error: 'Error al registrar la reservación de transporte.' });
  }
}
