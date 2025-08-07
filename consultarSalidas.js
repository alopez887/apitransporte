import pool from './conexion.js';

const consultarSalidas = async (req, res) => {
  try {
    const { fecha, desde, hasta } = req.query;
    console.log('📥 Parámetros recibidos (salidas):', { fecha, desde, hasta });

    let query = `
      SELECT 
        folio,
        nombre_cliente,
        nota,
        tipo_viaje,
        tipo_transporte,
        capacidad,
        cantidad_pasajeros,
        hotel_salida,
        zona,
        fecha_salida,
        hora_salida,
        aerolinea_salida,
        vuelo_salida
      FROM reservaciones
      WHERE (
        tipo_viaje ILIKE 'salida'
        OR (tipo_viaje ILIKE 'redondo' AND fecha_salida IS NOT NULL)
      )
    `;
    const values = [];

    if (fecha) {
      console.log('🔍 Usando búsqueda por fecha exacta (salida):', fecha);
      query += ` AND fecha_salida = $1 ORDER BY hora_salida ASC`;
      values.push(fecha);
    } else if (desde && hasta) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(desde) || !dateRegex.test(hasta)) {
        console.warn('⚠️ Formato de fecha inválido en desde/hasta (salida):', { desde, hasta });
        return res.status(400).json({ error: 'Fechas mal formateadas' });
      }

      console.log(`🔍 Usando búsqueda por rango (salida): ${desde} → ${hasta}`);
      query += ` AND fecha_salida BETWEEN $1 AND $2 ORDER BY fecha_salida ASC, hora_salida ASC`;
      values.push(desde, hasta);
    } else {
      console.log('🔍 Usando búsqueda por fecha actual (CURRENT_DATE) para salidas');
      query += ` AND fecha_salida = CURRENT_DATE ORDER BY hora_salida ASC`;
    }

    const result = await pool.query(query, values);
    console.log('✅ Resultados encontrados (salidas):', result.rows.length);

    res.json({ datos: result.rows });
  } catch (error) {
    console.error('❌ Error consultando salidas:', error.message);
    res.status(500).json({ error: 'Error al obtener salidas desde la base de datos' });
  }
};

export default consultarSalidas;