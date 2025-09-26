// ventasComparativa.js
import pool from './conexion.js';

/* =========================
   CONFIG
   ========================= */

// Limpieza robusta de importe (acepta $, comas, espacios, etc.)
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

// Filtrado por servicio basado SOLO en tipo_servicio (insensible a mayúsculas)
function filtroServicioSQL(servicio) {
  // normalizamos a minúsculas y quitamos espacios
  const col = "LOWER(COALESCE(TRIM(tipo_servicio), ''))";

  switch ((servicio || '').toLowerCase()) {
    case 'actividades':
      // actividad, actividades, actividad - x
      return `AND ${col} ~ '^actividad'`;

    case 'tours':
      // tour, tours, tour privado, excursion / excursión…
      return `AND (${col} ~ '^tours?' OR ${col} ~ '^excurs')`;

    case 'transporte':
      // todo lo que NO sea actividad NI tour/excursión (incluye vacío/null)
      return `AND NOT(${col} ~ '^actividad' OR ${col} ~ '^tours?' OR ${col} ~ '^excurs')`;

    case 'ambos':
    default:
      // sin filtro (todas las ventas)
      return '';
  }
}

// Rango (mes actual y mes pasado) en formato YYYY-MM-DD
function rangoMesActualPasado() {
  const now = new Date();
  const dActDesde = new Date(now.getFullYear(), now.getMonth(), 1);
  const dActHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dAntDesde = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const dAntHasta = new Date(now.getFullYear(), now.getMonth(), 0);

  const fmt = d => d.toISOString().slice(0, 10);
  return {
    actual: { desde: fmt(dActDesde), hasta: fmt(dActHasta) },
    pasado: { desde: fmt(dAntDesde), hasta: fmt(dAntHasta) },
  };
}

/* =========================
   HANDLER
   ========================= */

export default async function ventasComparativa(req, res) {
  try {
    const servicio = String(req.query.servicio || 'transporte').toLowerCase();

    // *** SIEMPRE por 'fecha' ***
    const baseCol = 'fecha';

    const { actual, pasado } = rangoMesActualPasado();
    const filtroServicio = filtroServicioSQL(servicio);

    // misma consulta para ambos rangos
    const sql = `
      SELECT ${baseCol}::date AS dia,
             SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
      FROM reservaciones
      WHERE ${baseCol}::date BETWEEN $1 AND $2
        ${filtroServicio}
      GROUP BY 1
      ORDER BY 1
    `;

    const [cur, prev] = await Promise.all([
      pool.query(sql, [actual.desde, actual.hasta]),
      pool.query(sql, [pasado.desde, pasado.hasta]),
    ]);

    const sum = rows => rows.reduce((acc, r) => acc + Number(r.total || 0), 0);

    res.json({
      ok: true,
      rango_actual: {
        desde: actual.desde,
        hasta: actual.hasta,
        dias: cur.rows,           // [{ dia: 'YYYY-MM-DD', total: n }]
        total: Number(sum(cur.rows).toFixed(2)),
      },
      rango_pasado: {
        desde: pasado.desde,
        hasta: pasado.hasta,
        dias: prev.rows,
        total: Number(sum(prev.rows).toFixed(2)),
      },
    });
  } catch (err) {
    console.error('❌ /api/ventas-comparativa:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}