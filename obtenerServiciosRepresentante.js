// obtenerServiciosRepresentante.js
import pool from './conexion.js';

export async function obtenerServiciosRepresentante(req, res) {
  try {
    const { representante = '', desde = '', hasta = '', busqueda = '' } = req.query;
    let filtrosAND = [];
    let valores = [];
    let ix = 1;

    if (representante) {
      filtrosAND.push(`(
        representante_llegada = $${ix}
        OR representante_salida = $${ix}
        OR representante = $${ix}
      )`);
      valores.push(representante);
      ix++;
    }

    if (busqueda) {
      filtrosAND.push(`(
        folio ILIKE $${ix}
        OR nombre_cliente ILIKE $${ix}
      )`);
      valores.push(`%${busqueda}%`);
      ix++;
    }

    if (desde && hasta) {
      filtrosAND.push(`(
        fecha_inicioviajellegada BETWEEN $${ix} AND $${ix+1}
        OR fecha_inicioviajesalida  BETWEEN $${ix} AND $${ix+1}
        OR fecha_finalviajellegada   BETWEEN $${ix} AND $${ix+1}
        OR fecha_finalviajesalida    BETWEEN $${ix} AND $${ix+1}
      )`);
      valores.push(desde, hasta);
      ix += 2;
    } else if (desde) {
      filtrosAND.push(`(
        fecha_inicioviajellegada >= $${ix}
        OR fecha_inicioviajesalida  >= $${ix}
        OR fecha_finalviajellegada   >= $${ix}
        OR fecha_finalviajesalida    >= $${ix}
      )`);
      valores.push(desde);
      ix++;
    } else if (hasta) {
      filtrosAND.push(`(
        fecha_inicioviajellegada <= $${ix}
        OR fecha_inicioviajesalida  <= $${ix}
        OR fecha_finalviajellegada   <= $${ix}
        OR fecha_finalviajesalida    <= $${ix}
      )`);
      valores.push(hasta);
      ix++;
    }

    filtrosAND.push(`(
      estatus_viajellegada = 'asignado'
      OR estatus_viajesalida  = 'asignado'
      OR estatus_viaje        = 'asignado'
      OR estatus_viajellegada = 'finalizado'
      OR estatus_viajesalida  = 'finalizado'
      OR estatus_viaje        = 'finalizado'
    )`);

    const where = filtrosAND.length ? 'WHERE ' + filtrosAND.join(' AND ') : '';

    const query = `
      SELECT *
      FROM reservaciones
      ${where}
      ORDER BY
        COALESCE(
          fecha_inicioviajesalida,
          fecha_inicioviajellegada,
          fecha_finalviajellegada,
          fecha_finalviajesalida
        ) DESC NULLS LAST
      LIMIT 200
    `;

    console.log("🔎 Query:", query);
    console.log("🔎 Valores:", valores);

    const result = await pool.query(query, valores);
    res.json({ success: true, servicios: result.rows });
  } catch (err) {
    console.error("❌ Error en obtenerServiciosRepresentante:", err.message);
    res.status(500).json({ success: false, error: "DB error" });
  }
}