import pool from './conexion.js';

// === columnas de fecha según base (solo transporte usa base) ===
function fechaExpr(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'fecha_llegada';
    case 'salida':  return 'fecha_salida';
    default:        return 'fecha';
  }
}

// Limpieza robusta de importe (por si viene como texto con $ o comas)
const COL_IMPORTE = (col = 'total_pago') => `
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(TRIM(${col}::text), '[^0-9\\.]', '', 'g'),
      ''
    )::numeric,
    0
  )
`;

// Rango (mes actual y mes pasado)
function rangoMesActualPasado() {
  const now = new Date();
  const desdeAct = new Date(now.getFullYear(), now.getMonth(), 1);
  const hastaAct = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const desdeAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const hastaAnt = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = d => d.toISOString().slice(0, 10);
  return {
    actual: { desde: fmt(desdeAct), hasta: fmt(hastaAct) },
    pasado: { desde: fmt(desdeAnt), hasta: fmt(hastaAnt) },
  };
}

// WHERE extra según servicio
function filtroServicioSQL(servicio) {
  const col = "COALESCE(TRIM(tipo_servicio), '')";
  if (servicio === 'actividades') {
    // Solo registros cuyo tipo_servicio empiece con 'Actividad'
    return `AND ${col} ILIKE 'Actividad%'`;
  }
  if (servicio === 'transporte') {
    // Todo lo que NO sea Actividad (incluye null/vacío)
    return `AND (${col} = '' OR ${col} NOT ILIKE 'Actividad%')`;
  }
  // ambos: sin filtro
  return '';
}

export default async function ventasComparativa(req, res) {
  try {
    const servicio = String(req.query.servicio || 'transporte').toLowerCase();
    // En actividades la base se ignora y usamos 'fecha'
    const baseCol = (servicio === 'actividades')
      ? 'fecha'
      : fechaExpr(req.query.base);

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
    console.error('❌ /api/ventas-comparativa:', err.message);
    res.status(500).json({ ok: false, msg: 'Error interno' });
  }
}