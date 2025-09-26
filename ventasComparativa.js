import pool from './conexion.js';

/* ========= Columnas de fecha según base (Transporte) ========= */
function baseColTransporte(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'COALESCE(fecha_llegada, fecha)';
    case 'salida':  return 'COALESCE(fecha_salida,  fecha)';
    default:        return 'fecha';
  }
}

/* ========= Limpieza de importe ========= */
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

/* ========= Rango del mes (LOCAL, sin UTC) ========= */
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function rangoMesActualPasado() {
  const now = new Date();
  const desdeAct = new Date(now.getFullYear(), now.getMonth(), 1);
  const hastaAct = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const desdeAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const hastaAnt = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    actual: { desde: ymdLocal(desdeAct), hasta: ymdLocal(hastaAct) },
    pasado: { desde: ymdLocal(desdeAnt), hasta: ymdLocal(hastaAnt) },
  };
}

/* ========= WHERE por servicio (separando Tours) ========= */
function filtroServicioSQL(servicio) {
  const col = "LOWER(COALESCE(TRIM(tipo_servicio), ''))";
  switch ((servicio || '').toLowerCase()) {
    case 'actividades':
      return `AND ${col} LIKE 'actividad%'`;
    case 'tours':
      return `AND ${col} LIKE 'tour%'`;
    case 'transporte':
      // Transporte explícito o legacy vacío/nulo
      return `AND (${col} = '' OR ${col} LIKE 'transporte%')`;
    // 'ambos' u otro => sin filtro
    default:
      return '';
  }
}

export default async function ventasComparativa(req, res) {
  try {
    const servicio = String(req.query.servicio || 'transporte').toLowerCase();

    // Base por servicio
    const baseCol =
      servicio === 'actividades' || servicio === 'tours'
        ? 'fecha'
        : baseColTransporte(req.query.base);

    const { actual, pasado } = rangoMesActualPasado();
    const filtro = filtroServicioSQL(servicio);

    const q = `
      SELECT (${baseCol})::date AS dia,
             SUM(${COL_IMPORTE('total_pago')})::numeric(12,2) AS total
      FROM reservaciones
      WHERE (${baseCol})::date BETWEEN $1 AND $2
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
      rango_actual: {
        desde: actual.desde,
        hasta: actual.hasta,
        dias: act.rows,
        total: sum(act.rows)
      },
      rango_pasado: {
        desde: pasado.desde,
        hasta: pasado.hasta,
        dias: ant.rows,
        total: sum(ant.rows)
      },
    });
  } catch (err) {
    console.error('❌ /api/ventas-comparativa:', err.message);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}