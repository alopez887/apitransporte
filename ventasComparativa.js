import pool from './conexion.js';

// ===== columna de fecha según base (solo TRANSPORTE respeta base) =====
function fechaExpr(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'fecha_llegada';
    case 'salida':  return 'fecha_salida';
    default:        return 'fecha';
  }
}

// ===== limpieza robusta del importe (quita $, comas, espacios) =====
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

// ===== formateo YYYY-MM-DD sin UTC shift =====
function fmtYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===== rangos de mes actual y pasado (en horario local, sin UTC) =====
function rangoMesActualPasado() {
  const now = new Date(); // local
  const desdeAct = new Date(now.getFullYear(), now.getMonth(), 1);
  const hastaAct = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const desdeAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const hastaAnt = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    actual: { desde: fmtYYYYMMDD(desdeAct), hasta: fmtYYYYMMDD(hastaAct) },
    pasado: { desde: fmtYYYYMMDD(desdeAnt), hasta: fmtYYYYMMDD(hastaAnt) },
  };
}

// ===== filtro por servicio =====
// - actividades:   tipo_servicio ILIKE 'Actividad%'
// - transporte:    (vacío) O ILIKE 'Transporte%'
// - tours:         ILIKE 'Tours%'
// - ambos:         sin filtro
function filtroServicioSQL(servicio) {
  const col = "LOWER(COALESCE(TRIM(tipo_servicio), ''))";
  switch (servicio) {
    case 'actividades':
      return `AND ${col} LIKE 'actividad%'`;
    case 'transporte':
      // tratamos vacío como transporte; EXCLUYE tours y actividades
      return `AND (${col} = '' OR ${col} LIKE 'transporte%')`;
    case 'tours':
      return `AND ${col} LIKE 'tours%'`;
    case 'ambos':
    default:
      return '';
  }
}

export default async function ventasComparativa(req, res) {
  try {
    const servicioRaw = String(req.query.servicio || 'transporte').toLowerCase();
    const servicio = ['transporte','actividades','tours','ambos'].includes(servicioRaw)
      ? servicioRaw
      : 'transporte';

    // Solo TRANSPORTE respeta base; para A/Tours usamos 'fecha'
    const baseCol = (servicio === 'transporte')
      ? fechaExpr(req.query.base)
      : 'fecha';

    const { actual, pasado } = rangoMesActualPasado();
    const filtro = filtroServicioSQL(servicio);

    const q = `
      SELECT ${baseCol}::date AS dia,
             SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
      FROM reservaciones
      WHERE ${baseCol}::date BETWEEN $1 AND $2
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