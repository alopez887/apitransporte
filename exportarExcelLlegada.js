import ExcelJS from 'exceljs';
import pool from './conexion.js';
import path from 'path';

const exportarExcelLlegada = async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });
    }

    const query = `
      SELECT 
        folio,
        nombre_cliente,
        nota,
        tipo_viaje,
        tipo_transporte,
        capacidad,
        cantidad_pasajeros,
        hotel_llegada,
        zona,
        fecha_llegada,
        hora_llegada,
        aerolinea_llegada,
        vuelo_llegada
      FROM reservaciones
      WHERE (
        tipo_viaje ILIKE 'llegada'
        OR tipo_viaje ILIKE 'shuttle'
        OR (tipo_viaje ILIKE 'redondo' AND fecha_llegada IS NOT NULL)
      )
      AND fecha_llegada BETWEEN $1 AND $2
      ORDER BY fecha_llegada ASC, hora_llegada ASC
    `;
    const { rows } = await pool.query(query, [desde, hasta]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Llegadas');

    // 📸 Logo
    const logoId = wb.addImage({
      filename: path.resolve('public/logo.png'),
      extension: 'png'
    });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 2, row: 4 } });
    ws.mergeCells('A1:B4');
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    // 🟦 Título centrado
    ws.mergeCells('C1:H4');
    const titleCell = ws.getCell('C1');
    titleCell.value = 'REPORTE DE LLEGADAS CABO TRAVELS SOLUTIONS';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 🔠 Encabezados
    const headers = [
      { header: 'Folio', key: 'folio', width: 14 },
      { header: 'Cliente', key: 'nombre_cliente', width: 22 },
      { header: 'Nota', key: 'nota', width: 22 },
      { header: 'Tipo viaje', key: 'tipo_viaje', width: 14 },
      { header: 'Transporte', key: 'tipo_transporte', width: 20 },
      { header: 'Capacidad', key: 'capacidad', width: 14 },
      { header: 'Pasajeros', key: 'cantidad_pasajeros', width: 14 },
      { header: 'Hotel', key: 'hotel_llegada', width: 20 },
      { header: 'Zona', key: 'zona', width: 14 },
      { header: 'Fecha llegada', key: 'fecha_llegada', width: 16 },
      { header: 'Hora', key: 'hora_llegada', width: 12 },
      { header: 'Aerolínea', key: 'aerolinea_llegada', width: 18 },
      { header: 'Vuelo', key: 'vuelo_llegada', width: 14 }
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

    // 📄 Filas
    rows.forEach((r, idx) => {
      const row = ws.getRow(7 + idx);
      headers.forEach((h, i) => {
        const val = h.key === 'capacidad'
          ? (r.capacidad?.trim() || '—')
          : (r[h.key] == null ? '' : r[h.key]);

        const cell = row.getCell(i + 1);
        cell.value = val;

        if (h.key === 'fecha_llegada' && val instanceof Date) {
          cell.numFmt = 'yyyy-mm-dd';
        }

        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      row.commit();
    });

    // 📦 Enviar Excel
    const buffer = await wb.xlsx.writeBuffer();
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="llegadas_${desde}_a_${hasta}.xlsx"`)
      .send(buffer);

  } catch (err) {
    console.error('❌ Error al generar Excel de llegadas:', err.message);
    res.status(500).send('Error al generar Excel');
  }
};

export default exportarExcelLlegada;