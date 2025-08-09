// exportarCsvVentasComparativa.js
import ventasComparativa from './ventasComparativa.js';

const bom = s => '\ufeff' + s;

// Extrae un ISO 'YYYY-MM-DD' de (Date | ISO | 'Fri Aug...' | 'YYYY-MM-DD hh:mm:ss' | etc.)
function isoFromAny(v){
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s = String(v ?? '');
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}

// Día del mes (1..31) con tolerancia de campo
function dayOfAny(row){
  const val = row?.dia ?? row?.fecha ?? row?.day ?? row?.date ?? row;
  const iso = isoFromAny(val);
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  return d.getUTCDate();
}

const lastDay = (anyDate) => {
  const iso = isoFromAny(anyDate);
  if (!iso) return 31;
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate();
};

const ddmmyyyyFromYMDDay = (y, m, d) =>
  `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;

async function invokeToJson(handler, reqLike) {
  return await new Promise((resolve, reject) => {
    const resLike = {
      _status: 200,
      status(c){ this._status = c; return this; },
      json(o){ resolve({ status:this._status, body:o }); },
      send(o){ resolve({ status:this._status, body:o }); },
    };
    Promise.resolve(handler(reqLike, resLike)).catch(reject);
  });
}

export default async function exportarCsvVentasComparativa(req, res) {
  try {
    const { status, body } = await invokeToJson(ventasComparativa, {
      app: req.app,
      query: req.query,
    });
    if (status !== 200 || !body || body.ok === false) {
      return res.status(500).json({ ok:false, error:'No se pudo obtener la comparativa' });
    }

    const rp = body.rango_pasado || {};
    const ra = body.rango_actual || {};

    // Mapear por DÍA (1..31). Usa r.total (o 0 si no).
    const mapAntDia = {};
    for (const r of (rp.dias || [])) {
      const day = dayOfAny(r);
      if (day != null) mapAntDia[day] = Number(r.total ?? 0);
    }
    const mapActDia = {};
    for (const r of (ra.dias || [])) {
      const day = dayOfAny(r);
      if (day != null) mapActDia[day] = Number(r.total ?? 0);
    }

    // Si por alguna razón no pescamos nada, log muy breve (no rompe CSV)
    if (Object.keys(mapAntDia).length === 0) console.warn('comparativa CSV: rango_pasado sin días interpretables');
    if (Object.keys(mapActDia).length === 0) console.warn('comparativa CSV: rango_actual sin días interpretables');

    // Determinar número de días a listar
    const maxDays = Math.max(
      lastDay(rp.desde || rp.hasta),
      lastDay(ra.desde || ra.hasta),
      31
    );

    // Para la 1ª columna (fecha dd/mm/yyyy) uso mes/año del rango ACTUAL; si no hay, uso el PASADO; si no, hoy.
    const baseIso = isoFromAny(ra.desde || rp.desde || new Date());
    const base = new Date(baseIso + 'T00:00:00Z');
    const year  = base.getUTCFullYear();
    const month = base.getUTCMonth() + 1;

    const mes = iso => new Intl.DateTimeFormat('es-MX',{ month:'long' })
      .format(new Date((isoFromAny(iso) || baseIso) + 'T00:00:00Z'));
    const nombreMesAnt = mes(rp.desde);
    const nombreMesAct = mes(ra.desde);

    // CSV
    let csv = `dia,${nombreMesAnt} (USD),${nombreMesAct} (USD)\n`;
    for (let d = 1; d <= maxDays; d++){
      const ant = mapAntDia[d] ?? 0;
      const act = mapActDia[d] ?? 0;
      csv += `${ddmmyyyyFromYMDDay(year, month, d)},${ant.toFixed(2)},${act.toFixed(2)}\n`;
    }

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="comparativa.csv"');
    res.status(200).send(bom(csv));
  } catch (err) {
    console.error('❌ exportarCsvVentasComparativa:', err);
    res.status(500).json({ ok:false, error:'Error generando CSV' });
  }
}