// exportarCsvVentasComparativa.js
import ventasComparativa from './ventasComparativa.js';

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
// dd/mm/yyyy desde {año,mes,dia}
function ddmmyyyy(y, m, d){
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
}

// Día del mes (1..31) en UTC
const dayOf = v => {
  const d = new Date(String(v).slice(0,10) + 'T00:00:00Z');
  return d.getUTCDate();
};
// Último día del mes de una fecha ISO
const lastDay = iso => {
  const d = new Date(String(iso).slice(0,10) + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate();
};

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

    // Mapear TOTALES por DÍA del mes (1..31), no por fecha completa
    const mapAntDia = Object.fromEntries((rp.dias || [])
      .map(r => [dayOf(r.dia), Number(r.total||0)]));
    const mapActDia = Object.fromEntries((ra.dias || [])
      .map(r => [dayOf(r.dia), Number(r.total||0)]));

    // Definir cuántos días mostrar
    const ldAnt = rp.desde ? lastDay(isoFromAny(rp.desde)) : 31;
    const ldAct = ra.desde ? lastDay(isoFromAny(ra.desde)) : 31;
    const maxDays = Math.max(ldAnt, ldAct);

    // Etiquetas: usamos el MES/AÑO del rango ACTUAL para formatear el día (como en tu CSV actual)
    const baseIso = isoFromAny(ra.desde) || isoFromAny(rp.desde) || new Date().toISOString().slice(0,10);
    const base = new Date(baseIso + 'T00:00:00Z');
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth() + 1; // 1..12

    // Encabezados
    const mes = iso => new Intl.DateTimeFormat('es-MX',{ month:'long' })
      .format(new Date(iso + 'T00:00:00Z'));
    const nombreMesAnt = rp.desde ? mes(isoFromAny(rp.desde)) : 'Mes pasado';
    const nombreMesAct = ra.desde ? mes(isoFromAny(ra.desde)) : 'Mes actual';

    // Construir CSV alineado por día
    let csv = `dia,${nombreMesAnt} (USD),${nombreMesAct} (USD)\n`;
    for (let d = 1; d <= maxDays; d++){
      const ant = (mapAntDia[d] ?? 0);
      const act = (mapActDia[d] ?? 0);
      csv += `${ddmmyyyy(year, month, d)},${ant.toFixed(2)},${act.toFixed(2)}\n`;
    }

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="comparativa.csv"');
    res.status(200).send(bom(csv));
  } catch (err) {
    console.error('❌ exportarCsvVentasComparativa:', err);
    res.status(500).json({ ok:false, error:'Error generando CSV' });
  }
}