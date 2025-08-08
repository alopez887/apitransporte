// reportesIngresos.js
import pool from './conexion.js';

// Normaliza YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const hoy = () => new Date().toISOString().slice(0, 10);

// Escoge la columna de fecha según “base”
function fechaExpr(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'fecha_llegada';
    case 'salida':  return 'fecha_salida';
    default:        return 'fecha';
  }
}

/**
 * total_pago es texto: limpiamos todo lo que no sea dígito o punto
 * para evitar fallos si viene con $, comas, espacios, etc.
 */
const COL_IMPORTE = `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(total_pago::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

/**
 * descuento_aplicado también puede venir como texto con % u otros símbolos.
 * Lo normalizamos a número de la misma forma.
 */
const EXPR_DESCUENTO = `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(COALESCE(descuento_aplicado::text, ''), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

// GET /api/reportes-ingresos?tipo=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&base=fecha|llegada|salida
export default async function reportesIngresos(req, res) {
  try {
    let { tipo = 'por-fecha', desde, hasta, base = 'fecha' } = req.query;
    if (!isYMD(desde)) desde = hoy();
    if (!isYMD(hasta)) hasta = hoy();

    const fcol = fechaExpr(base);
    let sql = '';
    const params = [desde, hasta];

    switch (tipo) {
      case 'por-fecha':
        sql = `
          SELECT ${fcol}::date AS etiqueta,
                 SUM(${COL_IMPORTE})::numeric(12,2) AS total
          FROM reservaciones
          WHERE ${fcol}::date BETWEEN $1 AND $2
          GROUP BY 1
          ORDER BY 1 ASC
        `;
        break;

      case 'por-tipo-viaje':
        sql = `
          SELECT COALESCE(NULLIF(TRIM(tipo_viaje), ''), '(Sin tipo)') AS etiqueta,
                 SUM(${COL_IMPORTE})::numeric(12,2) AS total
          FROM reservaciones
          WHERE ${fcol}::date BETWEEN $1 AND $2
          GROUP BY 1
          ORDER BY 2 DESC
        `;
        break;

      case 'por-tipo-transporte':
        sql = `
          SELECT COALESCE(NULLIF(TRIM(tipo_transporte), ''), '(Sin transporte)') AS etiqueta,
                 SUM(${COL_IMPORTE})::numeric(12,2) AS total
          FROM reservaciones
          WHERE ${fcol}::date BETWEEN $1 AND $2
          GROUP BY 1
          ORDER BY 2 DESC
        `;
        break;

      case 'por-zona-hotel':
        sql = `
          SELECT COALESCE(
                   NULLIF(TRIM(COALESCE(zona, hotel_llegada, hotel_salida)), ''),
                   '(Sin hotel/zona)'
                 ) AS etiqueta,
                 SUM(${COL_IMPORTE})::numeric(12,2) AS total
          FROM reservaciones
          WHERE ${fcol}::date BETWEEN $1 AND $2
          GROUP BY 1
          ORDER BY 2 DESC
        `;
        break;

      case 'con-sin-descuento':
        sql = `
          SELECT CASE WHEN ${EXPR_DESCUENTO} > 0
                      THEN 'Con descuento'
                      ELSE 'Sin descuento'
                 END AS etiqueta,
                 SUM(${COL_IMPORTE})::numeric(12,2) AS total
          FROM reservaciones
          WHERE ${fcol}::date BETWEEN $1 AND $2
          GROUP BY 1
          ORDER BY 2 DESC
        `;
        break;

      default:
        return res.status(400).json({ ok: false, msg: 'tipo inválido' });
    }

    const { rows } = await pool.query(sql, params);
    res.json({ ok: true, datos: rows });
  } catch (err) {
    console.error('❌ /api/reportes-ingresos:', err.message);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}