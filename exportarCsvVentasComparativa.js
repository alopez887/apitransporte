// exportarCsvVentasComparativa.js
import ventasComparativa from './ventasComparativa.js';

const bom = (s) => '\ufeff' + s;

// Fecha segura en UTC -> 'YYYY-MM-DD'
function ymdUTC(d){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
function ddmmyyyy(iso){
  const [y,m,d] = String(iso).slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}
// Rango de fechas en UTC usando desde/hasta en ISO
function rangoFechasUTC(desdeISO, hastaISO){
  const out = [];
  const d = new Date(desdeISO + 'T00:00:00Z');
  const end = new Date(hastaISO + 'T00:00:00Z');
  while (d.getTime() <= end.getTime()){
    out.push(ymdUTC(d));
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

    const rp = body.rango_pasado  || {};
    const ra = body.rango_actual  || {};

    // Mapear totales por día usando llave ISO 'YYYY-MM-DD' segura
    const mapAnt = Object.fromEntries((rp.dias || []).map(r => [String(r.dia).slice(0,10), Number(r.total||0)]));
    const mapAct = Object.fromEntries((ra.dias || []).map(r => [String(r.dia).slice(0,10), Number(r.total||0)]));

    // Labels con función UTC (evita desfases por zona)
    const labelsAnt = (rp.desde && rp.hasta) ? rangoFechasUTC(rp.desde.slice(0,10), rp.hasta.slice(0,10)) : [];
    const labelsAct = (ra.desde && ra.hasta) ? rangoFechasUTC(ra.desde.slice(0,10), ra.hasta.slice(0,10)) : [];
    const labels = labelsAct.length >= labelsAnt.length ? labelsAct : labelsAnt;

    // Nombres de mes para encabezado
    const mes = iso => new Intl.DateTimeFormat('es-MX',{ month:'long' })
      .format(new Date(iso.slice(0,10)+'T00:00:00Z'));
    const nombreMesAnt = rp.desde ? mes(rp.desde) : 'Mes pasado';
    const nombreMesAct = ra.desde ? mes(ra.desde) : 'Mes actual';

    // CSV
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