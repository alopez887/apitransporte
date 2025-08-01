// exportarExcel.js
import express from 'express';
import pool from './conexion.js';
import ExcelJS from 'exceljs';
import path from 'path';

const router = express.Router();

router.get('/exportar-excel', async (req, res) => {
  try {
    const { desde, hasta, busqueda, representante } = req.query;
    const condiciones = [];
    const valores = [];

    // Rango de fechas
    condiciones.push(`
      (
        fecha_inicioviajesalida  BETWEEN $1 AND $2 OR
        fecha_inicioviajellegada BETWEEN $1 AND $2 OR
        fecha_finalviajesalida    BETWEEN $1 AND $2 OR
        fecha_finalviajellegada   BETWEEN $1 AND $2
      )
    `);
    valores.push(desde, hasta);

    // Búsqueda folio/nombre
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`
        folio ILIKE $${valores.length}
        OR nombre_cliente ILIKE $${valores.length}
      `);
    }

    // Filtro representante
    if (representante) {
      valores.push(`%${representante}%`);
      condiciones.push(`
        representante_llegada ILIKE $${valores.length}
        OR representante_salida  ILIKE $${valores.length}
      `);
    }

    const sql = `
      SELECT
        folio, nombre_cliente, correo_cliente, telefono_cliente,
        nota, fecha, tipo_servicio, tipo_transporte, proveedor,
        estatus, capacidad, cantidad_pasajeros
      FROM reservaciones
      WHERE ${condiciones.join(' AND ')}
      ORDER BY
        COALESCE(
          fecha_inicioviajesalida,
          fecha_inicioviajellegada,
          fecha_finalviajesalida,
          fecha_finalviajellegada
        ) DESC NULLS LAST
      LIMIT 200;
    `;
    const { rows } = await pool.query(sql, valores);

    // --- Crear libro y hoja ---
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reservaciones');

    // 1) Logo en A1:B4
    const logoId = wb.addImage({
      filename: path.resolve('public/logo.png'),
      extension: 'png',
    });
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      br: { col: 2, row: 4 },
    });

    // 2) Título en C1:H4
    ws.mergeCells('C1:H4');
    const titleCell = ws.getCell('C1');
    titleCell.value = 'REPORTE DE SERVICIOS ASIGNADOS CABO TRAVELS SOLUTIONS';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 3) Encabezados en fila 6
    const headers = [
      { header: 'Folio', key: 'folio', width: 15 },
      { header: 'Cliente', key: 'nombre_cliente', width: 25 },
      { header: 'Correo', key: 'correo_cliente', width: 30 },
      { header: 'Teléfono', key: 'telefono_cliente', width: 15 },
      { header: 'Nota', key: 'nota', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
    ];
    headers.forEach((h, i) => {
      ws.getColumn(i + 1).width = h.width;
    });

    const headerRow = ws.getRow(6);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.header;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top:    { style: 'thin' },
        left:   { style: 'thin' },
        bottom: { style: 'thin' },
        right:  { style: 'thin' },
      };
    });
    headerRow.height = 20;

    // 4) Datos desde la fila 7
    rows.forEach((r, idx) => {
      const row = ws.getRow(7 + idx);
      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        cell.value = r[h.key];
        cell.border = {
          top:    { style: 'thin' },
          left:   { style: 'thin' },
          bottom: { style: 'thin' },
          right:  { style: 'thin' },
        };
      });
      row.commit();
    });

    // 5) Enviar archivo
    const buf = await wb.xlsx.writeBuffer();
    res
      .setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition',
        'attachment; filename="reservaciones.xlsx"')
      .send(buf);

  } catch (err) {
    console.error('Error al generar Excel:', err);
    res.status(500).send('Error al generar Excel');
  }
});

export default router;