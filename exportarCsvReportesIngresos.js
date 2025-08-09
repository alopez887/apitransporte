// exportarCsvReportesIngresos.js
import reportesIngresos from './reportesIngresos.js';

function bom(str) { return '\ufeff' + str; } // para que Excel respete UTF-8
function q(s) { return `"${String(s ?? '').replace(/"/g, '""')}"`; }

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

export default async function exportarCsvReportesIngresos(req, res) {
  try {
    // Reutiliza la ruta /api/reportes-ingresos
    const { status, body } = await invokeToJson(reportesIngresos, {
      app: req.app,
      query: req.query,
    });

    if (status !== 200 || !body || body.ok === false) {
      return res.status(500).json({ ok: false, error: 'No se pudo obtener el reporte' });
    }

    const rows = body.datos || [];
    // Armar CSV: Encabezado con USD
    let csv = 'Etiqueta,Total (USD)\n';
    for (const r of rows) {
      const etiqueta = (typeof r.etiqueta === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.etiqueta))
        ? r.etiqueta.slice(0, 10)
        : (r.etiqueta ?? '');
      const total = Number(r.total || 0).toFixed(2);
      csv += `${q(etiqueta)},${q(total)}\n`;
    }

    const { tipo='por-fecha', desde='', hasta='' } = req.query;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ingresos_${tipo}_${desde}_a_${hasta}.csv"`);
    res.status(200).send(bom(csv));
  } catch (err) {
    console.error('❌ exportarCsvReportesIngresos:', err);
    res.status(500).json({ ok:false, error: 'Error generando CSV' });
  }
}