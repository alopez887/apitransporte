// ventasComparativa.js
import pool from './conexion.js';

/* ===== Importe robusto ===== */
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

/* ===== filtros por servicio ===== */
function filtroServicioSQL(servicio) {
  const col = "LOWER(COALESCE(TRIM(tipo_servicio), ''))";
  switch ((servicio || '').toLowerCase()) {
    case 'actividades':
      return `AND ${col} ~ '^actividad'`;
    case 'tours':
      // por si algún tour se guarda como “tour” o “excursión”
      return `AND (${col} ~ '^tours?' OR ${col} ~ '^excurs')`;
    case 'transporte':
      // todo lo que NO es actividad ni tour
      return `AND NOT(${col} ~ '^actividad' OR ${col} ~ '^tours?' OR ${col} ~ '^excurs')`;
    case 'ambos':
    default:
      return '';
  }
}

/* ===== filtro por tipo de viaje (solo transporte) ===== */
function filtroTipoViajeSQL(servicio, viaje) {
  if ((servicio || '').toLowerCase() !== 'transporte') return '';
  const v = (viaje || 'todos').toLowerCase();

  // Usamos solo tipo_viaje. Para shuttle contemplamos también tipo_transporte por si acaso.
  const tv = "LOWER(COALESCE(TRIM(tipo_viaje), ''))";
  const tt = "LOWER(COALESCE(TRIM(tipo_transporte), ''))";

  switch (v) {
    case 'llegada':
      return `AND (${tv} = 'llegada' OR ${tv} = 'arrival')`;
    case 'salida':
      return `AND (${tv} = 'salida' OR ${tv} = 'departure')`;
    case 'redondo':
      // redondo, roundtrip, etc.
      return `AND (${tv} ~ '^redon' OR ${tv} ~ '^round')`;
    case 'shuttle':
      return `AND (${tv} = 'shuttle' OR ${tt} ~ '^shuttle')`;
    case 'todos':
    default:
      return '';
  }
}

/* ===== rango mes actual y pasado ===== */
function rangoMesActualPasado() {
  const now = new Date();
  const a1 = new Date(now.getFullYear(), now.getMonth(), 1);
  const a2 = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const p1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const p2 = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = d => d.toISOString().slice(0, 10);
  return {
    actual: { desde: fmt(a1), hasta: fmt(a2) },
    pasado: { desde: fmt(p1), hasta: fmt(p2) },
  };
}

/* ===== Handler ===== */
export default async function ventasComparativa(req, res) {
  try {
    const servicio = String(req.query.servicio || 'transporte').toLowerCase();

    // SIEMPRE por 'fecha' (ventas por fecha de registro)
    const baseCol = 'fecha';

    // Back-compat: si no viene ?viaje=... pero el front manda base=llegada/salida/redondo/shuttle,
    // lo tomamos como "viaje" sin romper nada.
    const baseParam = String(req.query.base || '').toLowerCase();
    const viajeParam = String(req.query.viaje || '').toLowerCase();
    const viaje = viajeParam || (['llegada', 'salida', 'redondo', 'shuttle'].includes(baseParam) ? baseParam : 'todos');

    const { actual, pasado } = rangoMesActualPasado();

    const filtroServicio = filtroServicioSQL(servicio);
    const filtroViaje    = filtroTipoViajeSQL(servicio, viaje);

    const sql = `
      SELECT ${baseCol}::date AS dia,
             SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
      FROM reservaciones
      WHERE ${baseCol}::date BETWEEN $1 AND $2
        ${filtroServicio}
        ${filtroViaje}
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
        dias: cur.rows, // [{ dia, total }]
        total: Number(sum(cur.rows).toFixed(2)),
      },
      rango_pasado: {
        desde: pasado.desde,
        hasta: pasado.hasta,
        dias: prev.rows,
        total: Number(sum(prev.rows).toFixed(2)),
      },
      // extra útil para depurar desde el front
      meta: { servicio, viaje_usado: viaje }
    });
  } catch (err) {
    console.error('❌ /api/ventas-comparativa:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}