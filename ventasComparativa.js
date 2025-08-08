import pool from './conexion.js';

function fechaExpr(base) {
  switch ((base || 'fecha').toLowerCase()) {
    case 'llegada': return 'fecha_llegada';
    case 'salida':  return 'fecha_salida';
    default:        return 'fecha';
  }
}

const COL_IMPORTE = `COALESCE(NULLIF(total_pago, '')::numeric, 0)`;

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

export default async function ventasComparativa(req, res) {
  try {
    const baseCol = fechaExpr(req.query.base);
    const { actual, pasado } = rangoMesActualPasado();

    const q = (desde, hasta) => `
      SELECT ${baseCol}::date AS dia,
             SUM(${COL_IMPORTE})::numeric(12,2) AS total
      FROM reservaciones
      WHERE ${baseCol}::date BETWEEN $1 AND $2
      GROUP BY 1
      ORDER BY 1
    `;

    const [act, ant] = await Promise.all([
      pool.query(q(actual.desde, actual.hasta), [actual.desde, actual.hasta]),
      pool.query(q(pasado.desde, pasado.hasta), [pasado.desde, pasado.hasta]),
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