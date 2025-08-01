// serviciosModel.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function getServicios(desde, hasta, busqueda, representante) {
  const params = [desde, hasta];
  let where = `WHERE fecha_inicioviaje >= $1 AND fecha_inicioviaje <= $2`;

  if (busqueda) {
    params.push(`%${busqueda}%`);
    where += ` AND (folio ILIKE $${params.length} OR nombre_cliente ILIKE $${params.length})`;
  }
  if (representante) {
    params.push(representante);
    where += ` AND representante = $${params.length}`;
  }

  const sql = `
    SELECT folio, nombre_cliente, tipo_viaje,
           numero_unidadsalida, numero_unidadllegada,
           cantidad_pasajerosoksalida, cantidad_pasajerosokllegada,
           cantidad_pasajeros, fecha_inicioviaje,
           representante_salida, representante_llegada,
           comentariossalida, comentariosllegada,
           estatus_viajellegada, estatus_viajesalida, estatus
    FROM servicios
    ${where}
    ORDER BY fecha_inicioviaje DESC
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}