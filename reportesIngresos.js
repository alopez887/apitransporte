// reportesIngresos.js
import pool from './conexion.js';

// Normaliza YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const hoy = () => new Date().toISOString().slice(0, 10);

// Columna de fecha según “base” (solo transporte/ambos)
function fechaExpr(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'fecha_llegada';
    case 'salida':  return 'fecha_salida';
    default:        return 'fecha';
  }
}

// Limpieza de importe/valor de lista
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

// Filtro por servicio (mismo criterio que comparativa)
function filtroServicioSQL(servicio) {
  const col = "COALESCE(TRIM(tipo_servicio), '')";
  if (servicio === 'actividades') {
    return `AND ${col} ILIKE 'Actividad%'`;
  }
  if (servicio === 'transporte') {
    return `AND (${col} = '' OR ${col} NOT ILIKE 'Actividad%')`;
  }
  return ''; // ambos
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

    // Columna de fecha efectiva:
    // - actividades usa 'fecha' sí o sí
    // - transporte/ambos usan la seleccionada para transporte
    const fcolTrans = fechaExpr(base);
    const fcolAct   = 'fecha';
    const params    = [desde, hasta];
    let sql = '';

    // ====== TRANSPORTE ======
    if (servicio === 'transporte') {
      const filtro = filtroServicioSQL('transporte');
      switch (tipo) {
        case 'por-fecha':
          sql = `
            WITH folios AS (
              SELECT
                folio,
                MIN(${fcolTrans}::date) AS fecha_ref,
                MAX(${COL_IMPORTE('total_pago')}) AS importe_folio
              FROM reservaciones
              WHERE ${fcolTrans}::date BETWEEN $1 AND $2
                ${filtro}
              GROUP BY folio
            )
            SELECT fecha_ref AS etiqueta,
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
            WHERE ${fcolTrans}::date BETWEEN $1 AND $2
              ${filtro}
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        case 'por-tipo-transporte':
          sql = `
            SELECT COALESCE(NULLIF(TRIM(tipo_transporte), ''), '(Sin transporte)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcolTrans}::date BETWEEN $1 AND $2
              ${filtro}
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
            WHERE ${fcolTrans}::date BETWEEN $1 AND $2
              ${filtro}
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
            WHERE ${fcolTrans}::date BETWEEN $1 AND $2
              ${filtro}
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

    // ====== ACTIVIDADES ======
    if (servicio === 'actividades') {
      const filtro = filtroServicioSQL('actividades');
      switch (tipo) {
        case 'por-fecha':
          sql = `
            WITH folios AS (
              SELECT
                folio,
                MIN(${fcolAct}::date) AS fecha_ref,
                MAX(${COL_IMPORTE('total_pago')}) AS importe_folio
              FROM reservaciones
              WHERE ${fcolAct}::date BETWEEN $1 AND $2
                ${filtro}
              GROUP BY folio
            )
            SELECT fecha_ref AS etiqueta,
                   SUM(importe_folio)::numeric(12,2) AS total
            FROM folios
            GROUP BY 1
            ORDER BY 1 ASC
          `;
          break;

        case 'por-tipo-actividad':
          sql = `
            SELECT COALESCE(NULLIF(TRIM(tipo_actividad), ''), '(Sin tipo)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
              ${filtro}
            GROUP BY 1
            ORDER BY 2 DESC
          `;
          break;

        case 'por-operador-actividad':
          sql = `
            SELECT COALESCE(NULLIF(TRIM(operador_actividad), ''), '(Sin operador)') AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
              ${filtro}
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
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
              ${filtro}
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

    // ====== AMBOS ======
    // Permitimos: por-fecha (sumado), por-servicio (T vs A), con-sin-descuento (sumado)
    if (servicio === 'ambos') {
      switch (tipo) {
        case 'por-servicio':
          sql = `
            SELECT 'Transporte' AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcolTrans}::date BETWEEN $1 AND $2
              ${filtroServicioSQL('transporte')}
            UNION ALL
            SELECT 'Actividades' AS etiqueta,
                   SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
            FROM reservaciones
            WHERE ${fcolAct}::date BETWEEN $1 AND $2
              ${filtroServicioSQL('actividades')}
            ORDER BY 1
          `;
          break;

        case 'por-fecha':
          // Unificamos día: transporte usa base elegida; actividades siempre 'fecha'
          sql = `
            WITH folios AS (
              SELECT
                folio,
                -- día por folio, escogiendo la fecha adecuada según el servicio
                MIN(
                  CASE
                    WHEN COALESCE(TRIM(tipo_servicio), '') ILIKE 'Actividad%' THEN ${fcolAct}::date
                    ELSE ${fcolTrans}::date
                  END
                ) AS fecha_ref,
                MAX(${COL_IMPORTE('total_pago')}) AS importe_folio
              FROM reservaciones
              WHERE (
                (COALESCE(TRIM(tipo_servicio), '') ILIKE 'Actividad%' AND ${fcolAct}::date BETWEEN $1 AND $2)
                OR
                ((COALESCE(TRIM(tipo_servicio), '') = '' OR COALESCE(TRIM(tipo_servicio), '') NOT ILIKE 'Actividad%')
                  AND ${fcolTrans}::date BETWEEN $1 AND $2)
              )
              GROUP BY folio
            )
            SELECT fecha_ref AS etiqueta,
                   SUM(importe_folio)::numeric(12,2) AS total
            FROM folios
            GROUP BY 1
            ORDER BY 1 ASC
          `;
          break;

        case 'con-sin-descuento':
          sql = `
            WITH t AS (
              SELECT
                CASE WHEN ${COL_IMPORTE('total_pago')} < ${VAL_LISTA('precio_servicio')} THEN 'Con descuento'
                     ELSE 'Sin descuento'
                END AS etiqueta,
                ${COL_IMPORTE('total_pago')} AS imp
              FROM reservaciones
              WHERE (
                (COALESCE(TRIM(tipo_servicio), '') ILIKE 'Actividad%' AND ${fcolAct}::date BETWEEN $1 AND $2)
                OR
                ((COALESCE(TRIM(tipo_servicio), '') = '' OR COALESCE(TRIM(tipo_servicio), '') NOT ILIKE 'Actividad%')
                  AND ${fcolTrans}::date BETWEEN $1 AND $2)
              )
            )
            SELECT etiqueta, SUM(imp)::numeric(12,2) AS total
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

    return res.status(400).json({ ok: false, msg: 'servicio inválido' });

  } catch (err) {
    console.error('❌ /api/reportes-ingresos:', err.message);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}