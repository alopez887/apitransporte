import pool from './conexion.js';

// Este endpoint filtra por representante, fechas y estatus
export async function obtenerServiciosRepresentante(req, res) {
  try {
    const {
      representante = '',
      desde = '',
      hasta = '',
      busqueda = ''
    } = req.query;

    let filtros = [];
    let valores = [];
    let ix = 1;

    // Filtro por representante
    if (representante) {
      filtros.push(`(
        representante_llegada = $${ix}
        OR representante_salida = $${ix}
        OR representante = $${ix}
      )`);
      valores.push(representante);
      ix++;
    }

    // Filtro por fechas (puedes personalizar los campos según tu modelo)
    if (desde) {
      filtros.push(`(fecha_inicioviaje >= $${ix} OR fecha_inicioviajellegada >= $${ix} OR fecha_inicioviajesalida >= $${ix})`);
      valores.push(desde);
      ix++;
    }
    if (hasta) {
      filtros.push(`(fecha_inicioviaje <= $${ix} OR fecha_inicioviajellegada <= $${ix} OR fecha_inicioviajesalida <= $${ix})`);
      valores.push(hasta);
      ix++;
    }

    // Filtro por búsqueda de texto (folio o nombre de cliente)
    if (busqueda) {
      filtros.push(`(
        folio ILIKE $${ix} OR
        nombre_cliente ILIKE $${ix} OR
        nombre ILIKE $${ix}
      )`);
      valores.push(`%${busqueda}%`);
      ix++;
    }

    // Solo servicios asignados: ajusta estos campos según tu modelo
    filtros.push(`(
      estatus_viajellegada = 'asignado'
      OR estatus_viajesalida = 'asignado'
      OR estatus = 'asignado'
      OR estatus_viajellegada = 'finalizado'
      OR estatus_viajesalida = 'finalizado'
      OR estatus = 'finalizado'
    )`);

    let where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';

    // Ajusta los campos del SELECT según tu base
    const query = `
      SELECT *
      FROM reservaciones_transporte
      ${where}
      ORDER BY fecha_inicioviaje DESC NULLS LAST, fecha_inicioviajellegada DESC NULLS LAST, fecha_inicioviajesalida DESC NULLS LAST
      LIMIT 200
    `;

    const result = await pool.query(query, valores);
    res.json({ success: true, servicios: result.rows });
  } catch (err) {
    console.error("❌ Error en obtenerServiciosRepresentante:", err.message);
    res.status(500).json({ success: false, error: "DB error" });
  }
}