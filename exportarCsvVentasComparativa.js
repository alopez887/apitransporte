// exportarCsvVentasComparativa.js
import ventasComparativa from './ventasComparativa.js';

function bom(str) { return '\ufeff' + str; }
function rangoFechas(desde, hasta) {
  const out = [];
  const d = new Date(desde);
  const end = new Date(hasta);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
async function invokeToJson(handler, reqLike) {
  return await new Promise((resolve, reject) => {
    const resLike = {
      _status: 200,
      status(code) { this._status = code; return this; },
      json(obj) { resolve({ status: this._status, body: obj }); },
      send(obj) { resolve({ status: this._status, body: obj }); },
    };
    Promise.resolve(handler(reqLike, resLike)).catch(reject);
  });
}

export default async function exportarCsvVentasComparativa(req, res) {
  try {
    // Reutiliza la ruta /api/ventas-comparativa
    const { status, body } = await invokeToJson(ventasComparativa, {
      app: req.app,
      query: req.query,
    });

    if (status !== 200 || !body || body.ok === false) {
      return res.status(500).json({ ok:false, error:'No se pudo obtener la comparativa' });
    }

    const rp = body.rango_pasado || {};
    const ra = body.rango_actual || {};
    const diasAnt = Object.fromEntries((rp.dias || []).map(r => [String(r.dia).slice(0,10), Number(r.total||0)]));
    const diasAct = Object.fromEntries((ra.dias || []).map(r => [String(r.dia).slice(0,10), Number(r.total||0)]));

    const labelsAnt = (rp.desde && rp.hasta) ? rangoFechas(rp.desde, rp.hasta) : [];
    const labelsAct = (ra.desde && ra.hasta) ? rangoFechas(ra.desde, ra.hasta) : [];
    const labels = labelsAct.length >= labelsAnt.length ? labelsAct : labelsAnt;

    const mes = iso => new Intl.DateTimeFormat('es-MX', { month:'long' })
      .format(new Date((iso || '').slice(0,10) + 'T00:00:00'));
    const nombreMesAnt = (rp.desde ? mes(rp.desde) : 'Mes pasado');
    const nombreMesAct = (ra.desde ? mes(ra.desde) : 'Mes actual');

    // Encabezado con USD
    let csv = `dia,${nombreMesAnt} (USD),${nombreMesAct} (USD)\n`;
    for (const d of labels) {
      const a = diasAnt[d] ?? 0;
      const c = diasAct[d] ?? 0;
      csv += `${d},${a},${c}\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="comparativa.csv"');
    res.status(200).send(bom(csv));
  } catch (err) {
    console.error('❌ exportarCsvVentasComparativa:', err);
    res.status(500).json({ ok:false, error:'Error generando CSV' });
  }
}