import pool from './conexion.js';

const consultarLlegadas = async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    let query = `
      SELECT 
        folio,
        nombre_cliente,
        nota,
        tipo_viaje,
        tipo_transporte,
        capacidad,
        cantidad_pasajeros,
        hotel_llegada,
        zona,
        fecha_llegada,
        hora_llegada,
        aerolinea_llegada,
        vuelo_llegada
      FROM reservaciones
    `;
    const values = [];

    if (desde && hasta) {
      query += ` WHERE fecha_llegada BETWEEN $1 AND $2 ORDER BY fecha_llegada ASC, hora_llegada ASC`;
      values.push(desde, hasta);
    } else {
      query += ` WHERE fecha_llegada = CURRENT_DATE ORDER BY hora_llegada ASC`;
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error consultando llegadas:', error.message);
    res.status(500).json({ error: 'Error al obtener llegadas desde la base de datos' });
  }
};

export default consultarLlegadas;