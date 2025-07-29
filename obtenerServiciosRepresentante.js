// obtenerServiciosRepresentante.js
import pool from './conexion.js';

// Endpoint para filtrar por representante, fechas, búsqueda y estatus
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

    // Filtro por representante (en llegada o salida)
    if (representante) {
      filtros.push(`(
        representante_llegada = $${ix}
        OR representante_salida = $${ix}
      )`);
      valores.push(representante);
      ix++;
    }

    // Filtro por fechas (en cualquiera de los inicios/finales)
    if (desde) {
      filtros.push(`(
        (fecha_inicioviajellegada >= $${ix} OR fecha_inicioviajesalida >= $${ix}
        OR fecha_finalviajellegada >= $${ix} OR fecha_finalviajesalida >= $${ix})
      )`);
      valores.push(desde);
      ix++;
    }
    if (hasta) {
      filtros.push(`(
        (fecha_inicioviajellegada <= $${ix} OR fecha_inicioviajesalida <= $${ix}
        OR fecha_finalviajellegada <= $${ix} OR fecha_finalviajesalida <= $${ix})
      )`);
      valores.push(hasta);
      ix++;
    }

    // Filtro por búsqueda de texto (folio o nombre_cliente)
    if (busqueda) {
      filtros.push(`(
        folio ILIKE $${ix} OR
        nombre_cliente ILIKE $${ix}
      )`);
      valores.push(`%${busqueda}%`);
      ix++;
    }

    // Solo servicios asignados o finalizados (en cualquier tramo)
    filtros.push(`(
      estatus_viajellegada = 'asignado'
      OR estatus_viajesalida = 'asignado'
      OR estatus_viajellegada = 'finalizado'
      OR estatus_viajesalida = 'finalizado'
    )`);

    let where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';

    const query = `
      SELECT *
      FROM reservaciones
      ${where}
      ORDER BY
        COALESCE(fecha_inicioviajesalida, fecha_inicioviajellegada, fecha_finalviajellegada, fecha_finalviajesalida) DESC NULLS LAST
      LIMIT 200
    `;

    const result = await pool.query(query, valores);
    res.json({ success: true, servicios: result.rows });
  } catch (err) {
    console.error("❌ Error en obtenerServiciosRepresentante:", err.message);
    res.status(500).json({ success: false, error: "DB error" });
  }
}