// reportesIngresos.js
import pool from './conexion.js';

// Normaliza YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const hoy = () => new Date().toISOString().slice(0, 10);

// Columna de fecha según “base”
function fechaExpr(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'fecha_llegada';
    case 'salida':  return 'fecha_salida';
    default:        return 'fecha';
  }
}

/**
 * Limpieza robusta: total_pago y precio_servicio suelen venir como texto.
 * Quitamos símbolos ($, comas, espacios, etc.)
 */
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

const VAL_LISTA = (col = 'precio_servicio') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

// Por compat: nombre de tabla según servicio
function tablaPorServicio(servicio) {
  return (servicio === 'actividades') ? 'actividades' : 'reservaciones';
}

// GET /api/reportes-ingresos?tipo=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&base=fecha|llegada|salida&servicio=transporte|actividades|ambos
export default async function reportesIngresos(req, res) {
  try {
    let {
      tipo = 'por-fecha',
      desde,
      hasta,
      base = 'fecha',
      servicio = 'transporte'
    } = req.query;

    servicio = String(servicio || 'transporte').toLowerCase();

    if (!isYMD(desde)) desde = hoy();
    if (!isYMD(hasta)) hasta = hoy();

    // en actividades ignoramos base y usamos 'fecha'
    const fcol = (servicio === 'actividades') ? 'fecha' : fechaExpr(base);
    const params = [desde, hasta];
    let sql = '';

    // ===== Servicio = TRANSPORTE (compat total con lo que ya tenías) =====
    if (servicio === 'transporte') {
      switch (tipo) {
        case 'por-fecha':
          // Un importe por folio; usamos MIN(fecha_ref) y MAX(importe_folio) por folio
          sql = `
            WITH folios AS (
              SELECT
                folio,
                MIN(${fcol}::date) AS fecha_ref,
                MAX(${COL_IMPORTE('total_pago')}) AS importe_folio
              FROM reservaciones
              WHERE ${fcol}::date BETWEEN $1 AND $2
              GROUP BY folio
            )
            SELECT
              fecha_ref AS etiqueta,
              SUM(importe_folio)::numeric(12,2) AS total
            FROM folios
            GROUP BY 1
            ORDER BY 1 ASC
          `;
          break;

        case 'por-tipo-viaje':
          sql = `
            SELECT COALESCE(NULLIF(TRIM(tipo_viaje), ''), '(Sin tipo)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcol}::date BETWEEN $1 AND $2
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        case 'por-tipo-transporte':
          sql = `
            SELECT COALESCE(NULLIF(TRIM(tipo_transporte), ''), '(Sin transporte)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
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
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcol}::date BETWEEN $1 AND $2
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        case 'con-sin-descuento':
          sql = `
            SELECT CASE
                     WHEN ${COL_IMPORTE('total_pago')} < ${VAL_LISTA('precio_servicio')} THEN 'Con descuento'
                     ELSE 'Sin descuento'
                   END AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
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
      return res.json({ ok: true, datos: rows });
    }

    // ===== Servicio = ACTIVIDADES =====
    if (servicio === 'actividades') {
      // En actividades forzamos columna de fecha = 'fecha'
      const fcolAct = 'fecha';
      switch (tipo) {
        case 'por-fecha':
          sql = `
            SELECT ${fcolAct}::date AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM actividades
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
            GROUP BY 1
            ORDER BY 1 ASC
          `;
          break;

        case 'por-tipo-actividad':
          // Ajusta el nombre de columna si en tu tabla se llama distinto
          sql = `
            SELECT COALESCE(NULLIF(TRIM(tipo_actividad), ''), '(Sin tipo)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM actividades
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        case 'por-operador-actividad':
          // Ajusta el nombre de columna si en tu tabla se llama distinto
          sql = `
            SELECT COALESCE(NULLIF(TRIM(operador_actividad), ''), '(Sin operador)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM actividades
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        case 'con-sin-descuento':
          sql = `
            SELECT CASE
                     WHEN ${COL_IMPORTE('total_pago')} < ${VAL_LISTA('precio_servicio')} THEN 'Con descuento'
                     ELSE 'Sin descuento'
                   END AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM actividades
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        default:
          return res.status(400).json({ ok: false, msg: 'tipo inválido para actividades' });
      }

      const { rows } = await pool.query(sql, params);
      return res.json({ ok: true, datos: rows });
    }

    // ===== Servicio = AMBOS =====
    // Para "ambos" limitamos los tipos a los que definiste en el front:
    // por-fecha, por-servicio, con-sin-descuento
    if (servicio === 'ambos') {
      switch (tipo) {
        case 'por-servicio':
          // Totales por servicio en el rango
          sql = `
            SELECT 'Transporte' AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fechaExpr(base)}::date BETWEEN $1 AND $2
            UNION ALL
            SELECT 'Actividades' AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM actividades
            WHERE fecha::date BETWEEN $1 AND $2
            ORDER BY 1
          `;
          break;

        case 'por-fecha':
          // Suma por día combinando ambas tablas
          sql = `
            WITH t AS (
              SELECT ${fechaExpr(base)}::date AS dia, ${COL_IMPORTE('total_pago')} AS imp
              FROM reservaciones
              WHERE ${fechaExpr(base)}::date BETWEEN $1 AND $2
              UNION ALL
              SELECT fecha::date AS dia, ${COL_IMPORTE('total_pago')} AS imp
              FROM actividades
              WHERE fecha::date BETWEEN $1 AND $2
            )
            SELECT dia AS etiqueta,
                   SUM(imp)::numeric(12,2) AS total
            FROM t
            GROUP BY 1
            ORDER BY 1 ASC
          `;
          break;

        case 'con-sin-descuento':
          // Agrupamos por etiqueta de descuento sumando ambos servicios
          sql = `
            WITH t AS (
              SELECT
                CASE WHEN ${COL_IMPORTE('total_pago')} < ${VAL_LISTA('precio_servicio')} THEN 'Con descuento'
                     ELSE 'Sin descuento'
                END AS etiqueta,
                ${COL_IMPORTE('total_pago')} AS imp
              FROM reservaciones
              WHERE ${fechaExpr(base)}::date BETWEEN $1 AND $2

              UNION ALL

              SELECT
                CASE WHEN ${COL_IMPORTE('total_pago')} < ${VAL_LISTA('precio_servicio')} THEN 'Con descuento'
                     ELSE 'Sin descuento'
                END AS etiqueta,
                ${COL_IMPORTE('total_pago')} AS imp
              FROM actividades
              WHERE fecha::date BETWEEN $1 AND $2
            )
            SELECT etiqueta,
                   SUM(imp)::numeric(12,2) AS total
            FROM t
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        default:
          return res.status(400).json({ ok: false, msg: 'tipo inválido para ambos' });
      }

      const { rows } = await pool.query(sql, params);
      return res.json({ ok: true, datos: rows });
    }

    // Fallback
    return res.status(400).json({ ok: false, msg: 'servicio inválido' });

  } catch (err) {
    console.error('❌ /api/reportes-ingresos:', err.message);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}