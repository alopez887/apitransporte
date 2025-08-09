// exportarCsvVentasComparativa.js
import ventasComparativa from './ventasComparativa.js';

const bom = s => '\ufeff' + s;

// Intenta extraer 'YYYY-MM-DD' desde lo que venga (Date, ISO, 'Fri Aug...', etc.)
function isoFromAny(v){
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s = String(v||'');
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}
// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
function ddmmyyyy(iso){
  const [y,m,d] = (iso||'').split('-');
  return `${d}/${m}/${y}`;
}
// Rango en UTC para evitar desfases
function rangoFechasUTC(desdeISO, hastaISO){
  const out = [];
  const d = new Date(desdeISO + 'T00:00:00Z');
  const end = new Date(hastaISO + 'T00:00:00Z');
  while (d.getTime() <= end.getTime()){
    out.push(d.toISOString().slice(0,10));
    d.setUTCDate(d.getUTCDate()+1);
  }
  return out;
}

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

    // Normaliza claves de días a ISO
    const mapAnt = Object.fromEntries((rp.dias || []).map(r => {
      const iso = isoFromAny(r.dia);
      return [iso, Number(r.total||0)];
    }).filter(([k]) => !!k));

    const mapAct = Object.fromEntries((ra.dias || []).map(r => {
      const iso = isoFromAny(r.dia);
      return [iso, Number(r.total||0)];
    }).filter(([k]) => !!k));

    // Labels con UTC
    const desdeAnt = isoFromAny(rp.desde);
    const hastaAnt = isoFromAny(rp.hasta);
    const desdeAct = isoFromAny(ra.desde);
    const hastaAct = isoFromAny(ra.hasta);

    const labelsAnt = (desdeAnt && hastaAnt) ? rangoFechasUTC(desdeAnt, hastaAnt) : [];
    const labelsAct = (desdeAct && hastaAct) ? rangoFechasUTC(desdeAct, hastaAct) : [];
    const labels = labelsAct.length >= labelsAnt.length ? labelsAct : labelsAnt;

    const mes = iso => new Intl.DateTimeFormat('es-MX',{ month:'long' })
      .format(new Date(iso+'T00:00:00Z'));
    const nombreMesAnt = desdeAnt ? mes(desdeAnt) : 'Mes pasado';
    const nombreMesAct = desdeAct ? mes(desdeAct) : 'Mes actual';

    let csv = `dia,${nombreMesAnt} (USD),${nombreMesAct} (USD)\n`;
    for (const iso of labels){
      const ant = (mapAnt[iso] ?? 0);
      const act = (mapAct[iso] ?? 0);
      csv += `${ddmmyyyy(iso)},${ant.toFixed(2)},${act.toFixed(2)}\n`;
    }

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="comparativa.csv"');
    res.status(200).send(bom(csv));
  } catch (err) {
    console.error('❌ exportarCsvVentasComparativa:', err);
    res.status(500).json({ ok:false, error:'Error generando CSV' });
  }
}