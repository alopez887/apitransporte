// exportarCsvReportesIngresos.js
import reportesIngresos from './reportesIngresos.js';

const bom = s => '\ufeff' + s;

function isoFromAny(v){
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s = String(v||'');
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}
function ddmmyyyy(iso){
  const [y,m,d] = (iso||'').split('-');
  return `${d}/${m}/${y}`;
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

export default async function exportarCsvReportesIngresos(req, res){
  try{
    const { status, body } = await invokeToJson(reportesIngresos, {
      app: req.app,
      query: req.query,
    });
    if (status !== 200 || !body || body.ok === false) {
      return res.status(500).json({ ok:false, error:'No se pudo obtener el reporte' });
    }

    const rows = body.datos || [];
    let csv = 'Etiqueta,Total (USD)\n';
    for (const r of rows){
      const raw = r.etiqueta ?? '';
      const iso = isoFromAny(raw);
      const etiqueta = iso ? ddmmyyyy(iso) : String(raw).replace(/"/g,'""');
      const total = Number(r.total || 0).toFixed(2);
      // etiqueta como texto (con comillas), total como número
      csv += `"${etiqueta}",${total}\n`;
    }

    const { tipo='por-fecha', desde='', hasta='' } = req.query;
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ingresos_${tipo}_${desde}_a_${hasta}.csv"`);
    res.status(200).send(bom(csv));
  }catch(err){
    console.error('❌ exportarCsvReportesIngresos:', err);
    res.status(500).json({ ok:false, error:'Error generando CSV' });
  }
}