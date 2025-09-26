import pool from './conexion.js';

/* === SIEMPRE usar 'fecha' (registro de venta) === */
const FECHA_COL = 'fecha';

/* Limpieza robusta de importe (si viene texto con $ o comas) */
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

/* YYYY-MM-DD sin líos de zona horaria */
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* Rango mes actual vs pasado (por 'fecha') */
function rangoMesActualPasado() {
  const now = new Date();
  const desdeAct = new Date(now.getFullYear(), now.getMonth(), 1);
  const hastaAct = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const desdeAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const hastaAnt = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    actual: { desde: ymd(desdeAct), hasta: ymd(hastaAct) },
    pasado: { desde: ymd(desdeAnt), hasta: ymd(hastaAnt) },
  };
}

/* Filtro por servicio (case-insensitive)
   - actividades: ILIKE 'Actividad%'
   - tours:       ILIKE 'Tours%'
   - transporte:  todo lo que NO sea Actividad% NI Tours% (incluye vacío/null)
   - ambos:       sin filtro
*/
function filtroServicioSQL(servicio) {
  const col = "LOWER(COALESCE(TRIM(tipo_servicio), ''))";
  switch (servicio) {
    case 'actividades': return `AND ${col} LIKE 'actividad%'`;
    case 'tours':       return `AND ${col} LIKE 'tours%'`;
    case 'transporte':  return `AND (${col} = '' OR (${col} NOT LIKE 'actividad%' AND ${col} NOT LIKE 'tours%'))`;
    case 'ambos':
    default:            return '';
  }
}

export default async function ventasComparativa(req, res) {
  try {
    const servicioRaw = String(req.query.servicio || 'transporte').toLowerCase();
    const servicio = ['transporte','actividades','tours','ambos'].includes(servicioRaw)
      ? servicioRaw
      : 'transporte';

    const { actual, pasado } = rangoMesActualPasado();
    const filtro = filtroServicioSQL(servicio);

    const q = `
      SELECT ${FECHA_COL}::date AS dia,
             SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
      FROM reservaciones
      WHERE ${FECHA_COL}::date BETWEEN $1 AND $2
        ${filtro}
      GROUP BY 1
      ORDER BY 1
    `;

    const [act, ant] = await Promise.all([
      pool.query(q, [actual.desde, actual.hasta]),
      pool.query(q, [pasado.desde, pasado.hasta]),
    ]);

    const sum = rows => rows.reduce((acc, r) => acc + Number(r.total || 0), 0);

    res.json({
      ok: true,
      rango_actual: { desde: actual.desde, hasta: actual.hasta, dias: act.rows, total: sum(act.rows) },
      rango_pasado: { desde: pasado.desde, hasta: pasado.hasta, dias: ant.rows, total: sum(ant.rows) },
    });
  } catch (err) {
    console.error('❌ /api/ventas-comparativa:', err);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}