// getPrecioTransporte.js
import pool from './conexion.js';

export default async function getPrecioTransporte(req, res) {
  const { tipo_transporte, hotel, cantidad_pasajeros } = req.body;

  if (!tipo_transporte || !hotel || !cantidad_pasajeros) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    // 1. Obtener zona del hotel
    const zonaResult = await pool.query('SELECT zona FROM hoteles_zona WHERE hotel = $1', [hotel]);
    if (zonaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Zona no encontrada para el hotel seleccionado' });
    }

    const zona = zonaResult.rows[0].zona;

    // 2. Normalizar el rango desde cantidadPasajeros (ej. "1-6 passengers" → "1-6")
    const match = cantidad_pasajeros.match(/\d+(?:-\d+)?/);
    const rango_pasajeros = match ? match[0] : null;

    if (!rango_pasajeros) {
      return res.status(400).json({ error: 'No se pudo interpretar el rango de pasajeros' });
    }

    // 3. Buscar tarifa
    const tarifaResult = await pool.query(
      `SELECT precio_normal, precio_con_descuento FROM tarifas_transportacion
       WHERE tipo_transporte = $1 AND zona = $2 AND rango_pasajeros = $3`,
      [tipo_transporte.toLowerCase(), zona, rango_pasajeros]
    );

    if (tarifaResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró tarifa para los datos proporcionados' });
    }

    const { precio_normal, precio_con_descuento } = tarifaResult.rows[0];

    res.status(200).json({
      precio_normal: Number(precio_normal),
      precio_con_descuento: Number(precio_con_descuento),
      zona,
      rango: rango_pasajeros
    });

  } catch (err) {
    console.error('❌ Error al obtener precio:', err);
    res.status(500).json({ error: 'Error al calcular el precio de transportación.' });
  }
} 
