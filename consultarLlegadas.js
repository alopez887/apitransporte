import pool from './conexion.js';

const consultarLlegadas = async (req, res) => {
  try {
    const { fecha, desde, hasta } = req.query;
    console.log('📥 Parámetros recibidos:', { fecha, desde, hasta });

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
      WHERE tipo_viaje ILIKE 'llegada'
    `;
    const values = [];

    if (fecha) {
      console.log('🔍 Usando búsqueda por fecha exacta:', fecha);
      query += ` AND fecha_llegada = $1 ORDER BY hora_llegada ASC`;
      values.push(fecha);
    } else if (desde && hasta) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(desde) || !dateRegex.test(hasta)) {
        console.warn('⚠️ Formato de fecha inválido en desde/hasta:', { desde, hasta });
        return res.status(400).json({ error: 'Fechas mal formateadas' });
      }

      console.log(`🔍 Usando búsqueda por rango: ${desde} → ${hasta}`);
      query += ` AND fecha_llegada BETWEEN $1 AND $2 ORDER BY fecha_llegada ASC, hora_llegada ASC`;
      values.push(desde, hasta);
    } else {
      console.log('🔍 Usando búsqueda por fecha actual (CURRENT_DATE)');
      query += ` AND fecha_llegada = CURRENT_DATE ORDER BY hora_llegada ASC`;
    }

    const result = await pool.query(query, values);
    console.log('✅ Resultados encontrados:', result.rows.length);

    res.json({ datos: result.rows });
  } catch (error) {
    console.error('❌ Error consultando llegadas:', error.message);
    res.status(500).json({ error: 'Error al obtener llegadas desde la base de datos' });
  }
};

export default consultarLlegadas;