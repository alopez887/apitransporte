import ExcelJS from 'exceljs';
import pool from './conexion.js';
import path from 'path';

// Valida YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const hoyYMD = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

// GET /api/exportarExcelReservas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&por=fecha|llegada|salida]
const exportarExcelReservas = async (req, res) => {
  try {
    const hoy = hoyYMD();
    let { desde, hasta, por } = req.query;

    desde = isYMD(desde) ? desde : hoy;
    hasta = isYMD(hasta) ? hasta : hoy;
    por = ['fecha','llegada','salida'].includes((por||'').toLowerCase()) ? por.toLowerCase() : 'fecha';

    const columna =
      por === 'llegada' ? 'fecha_llegada' :
      por === 'salida'  ? 'fecha_salida'  :
                          'fecha';

    // Mismos campos que estás usando en Reservas + extras útiles
    const query = `
      SELECT 
        folio,
        tipo_viaje,
        nombre_cliente,
        fecha,
        fecha_llegada,
        fecha_salida,
        cantidad_pasajeros,
        tipo_transporte,
        zona,
        COALESCE(hotel_llegada, hotel_salida) AS hotel
      FROM reservaciones
      WHERE ${columna}::date BETWEEN $1 AND $2
      ORDER BY ${columna} ASC, folio ASC
    `;
    const { rows } = await pool.query(query, [desde, hasta]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reservas');

    // 📸 Logo (mismo tratamiento)
    try {
      const logoId = wb.addImage({
        filename: path.resolve('public/logo.png'),
        extension: 'png'
      });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 2, row: 4 } });
      ws.mergeCells('A1:B4');
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    } catch (e) {
      // Si falta el logo, no reventamos el Excel
      console.warn('⚠️ Logo no encontrado para reservas:', e.message);
    }

    // 🟦 Título centrado (mismo estilo)
    ws.mergeCells('C1:H4');
    const titleCell = ws.getCell('C1');
    titleCell.value = `REPORTE DE RESERVAS CABO TRAVELS SOLUTIONS (${por.toUpperCase()}) ${desde} a ${hasta}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 🔠 Encabezados (mismo look & feel)
    const headers = [
      { header: 'Folio',           key: 'folio',              width: 12 },
      { header: 'Tipo viaje',      key: 'tipo_viaje',         width: 14 },
      { header: 'Cliente',         key: 'nombre_cliente',     width: 28 },
      { header: 'Fecha registro',  key: 'fecha',              width: 14 },
      { header: 'Fecha llegada',   key: 'fecha_llegada',      width: 14 },
      { header: 'Fecha salida',    key: 'fecha_salida',       width: 14 },
      { header: 'Pax',             key: 'cantidad_pasajeros', width: 8  },
      { header: 'Transporte',      key: 'tipo_transporte',    width: 16 },
      { header: 'Zona',            key: 'zona',               width: 14 },
      { header: 'Hotel',           key: 'hotel',              width: 26 }
    ];

    headers.forEach((h, i) => ws.getColumn(i + 1).width = h.width);

    const headerRow = ws.getRow(6);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.header;
      cell.font = { bold: true, color: { argb: 'FF0D2740' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDbe5f1' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 20;

    // 📄 Filas (mismo borde y formatos)
    const safeDate = (v) => (v instanceof Date ? v.toISOString().slice(0,10) : (v ? String(v).slice(0,10) : ''));
    rows.forEach((r, idx) => {
      const row = ws.getRow(7 + idx);
      headers.forEach((h, i) => {
        let val = r[h.key];
        if (['fecha','fecha_llegada','fecha_salida'].includes(h.key)) {
          val = safeDate(val);
        }
        const cell = row.getCell(i + 1);
        cell.value = val ?? '';
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      row.commit();
    });

    // 📦 Respuesta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reservas_${por}_${desde}_a_${hasta}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('❌ Error al generar Excel de reservas:', err.message);
    res.status(500).send('Error al generar Excel');
  }
};

export default exportarExcelReservas;