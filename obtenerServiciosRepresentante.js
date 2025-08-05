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

    let filtrosAND = [];
    let valores = [];
    let ix = 1;

    // Filtro por representante (en llegada, salida o shuttle)
    if (representante) {
      filtrosAND.push(`(
        representante_llegada = $${ix}
        OR representante_salida  = $${ix}
        OR representante         = $${ix}
      )`);
      valores.push(representante);
      ix++;
    }

    // Filtro por búsqueda (folio o nombre de cliente)
    if (busqueda) {
      filtrosAND.push(`(
        folio ILIKE $${ix}
        OR nombre_cliente ILIKE $${ix}
      )`);
      valores.push(`%${busqueda}%`);
      ix++;
    }

    // Filtro por fecha: busca cualquier servicio donde CUALQUIERA de las fechas caiga en el rango
    if (desde && hasta) {
      filtrosAND.push(`(
        (fecha_inicioviajellegada BETWEEN $${ix} AND $${ix+1}) OR
        (fecha_inicioviajesalida  BETWEEN $${ix} AND $${ix+1}) OR
        (fecha_finalviajellegada   BETWEEN $${ix} AND $${ix+1}) OR
        (fecha_finalviajesalida    BETWEEN $${ix} AND $${ix+1}) OR
        (fecha_inicioviaje         BETWEEN $${ix} AND $${ix+1}) OR
        (fecha_finalviaje          BETWEEN $${ix} AND $${ix+1})
      )`);
      valores.push(desde, hasta);
      ix += 2;
    } else if (desde) {
      filtrosAND.push(`(
        (fecha_inicioviajellegada >= $${ix}) OR
        (fecha_inicioviajesalida  >= $${ix}) OR
        (fecha_finalviajellegada   >= $${ix}) OR
        (fecha_finalviajesalida    >= $${ix}) OR
        (fecha_inicioviaje         >= $${ix}) OR
        (fecha_finalviaje          >= $${ix})
      )`);
      valores.push(desde);
      ix++;
    } else if (hasta) {
      filtrosAND.push(`(
        (fecha_inicioviajellegada <= $${ix}) OR
        (fecha_inicioviajesalida  <= $${ix}) OR
        (fecha_finalviajellegada   <= $${ix}) OR
        (fecha_finalviajesalida    <= $${ix}) OR
        (fecha_inicioviaje         <= $${ix}) OR
        (fecha_finalviaje          <= $${ix})
      )`);
      valores.push(hasta);
      ix++;
    }

    // Solo servicios asignados o finalizados (incluye Shuttle)
    filtrosAND.push(`(
      estatus_viajellegada = 'asignado'
      OR estatus_viajesalida  = 'asignado'
      OR estatus_viaje        = 'asignado'
      OR estatus_viajellegada = 'finalizado'
      OR estatus_viajesalida  = 'finalizado'
      OR estatus_viaje        = 'finalizado'
    )`);

    const where = filtrosAND.length
      ? 'WHERE ' + filtrosAND.join(' AND ')
      : '';

    const query = `
      SELECT *
      FROM reservaciones
      ${where}
      ORDER BY
        COALESCE(
          fecha_inicioviajesalida,
          fecha_inicioviajellegada,
          fecha_inicioviaje,
          fecha_finalviajellegada,
          fecha_finalviajesalida,
          fecha_finalviaje
        ) DESC NULLS LAST
      LIMIT 200
    `;

    // Logs para debug
    console.log("🔎 Query:", query);
    console.log("🔎 Valores:", valores);

    const result = await pool.query(query, valores);
    res.json({ success: true, servicios: result.rows });
  } catch (err) {
    console.error("❌ Error en obtenerServiciosRepresentante:", err.message);
    res.status(500).json({ success: false, error: "DB error" });
  }
}