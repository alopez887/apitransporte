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

    // Filtro de fechas
    condiciones.push(`
      (
        fecha_inicioviajesalida  BETWEEN $1 AND $2 OR
        fecha_inicioviajellegada BETWEEN $1 AND $2 OR
        fecha_finalviajesalida    BETWEEN $1 AND $2 OR
        fecha_finalviajellegada   BETWEEN $1 AND $2
      )
    `);
    valores.push(desde, hasta);

    // Filtro búsqueda
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`
        folio ILIKE $${valores.length} OR
        nombre_cliente ILIKE $${valores.length}
      `);
    }

    // Filtro representante
    if (representante) {
      valores.push(`%${representante}%`);
      condiciones.push(`
        representante_llegada ILIKE $${valores.length} OR
        representante_salida  ILIKE $${valores.length}
      `);
    }

    const sql = `
      SELECT
        folio,
        nombre_cliente,
        correo_cliente,
        telefono_cliente,
		tipo_viaje,
        tipo_transporte,
        estatus,
		zona,
        capacidad,
        cantidad_pasajeros,
        hotel_llegada,
        hotel_salida,
        fecha_llegada,
        hora_llegada,
        aerolinea_llegada,
        vuelo_llegada,
        fecha_salida,
        hora_salida,
        aerolinea_salida,
        vuelo_salida,		
        representante_llegada,
        fecha_inicioviajellegada,
        fecha_finalviajellegada,
        choferllegada,
        numero_unidadllegada,
        estatus_viajellegada,
        cantidad_pasajerosokllegada,
        representante_salida,
        fecha_inicioviajesalida,
        fecha_finalviajesalida,
        comentariossalida,
        chofersalida,
        numero_unidadsalida,
        estatus_viajesalida,
        cantidad_pasajerosoksalida,
        chofer_externonombre,
        choferexterno_tel,
        chofer_empresaext
      FROM reservaciones
      WHERE ${condiciones.join(' AND ')}
      ORDER BY folio ASC
      LIMIT 200;
    `;
    const { rows } = await pool.query(sql, valores);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reservaciones');

    const logoId = wb.addImage({
      filename: path.resolve('public/logo.png'),
      extension: 'png'
    });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 2, row: 4 } });
    ws.mergeCells('A1:B4');
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells('C1:H4');
    const titleCell = ws.getCell('C1');
    titleCell.value = 'REPORTE DE SERVICIOS ASIGNADOS CABO TRAVELS SOLUTIONS';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const headers = [
      { header: 'Folio', key: 'folio', width: 14 },
      { header: 'Cliente', key: 'nombre_cliente', width: 20 },
      { header: 'Correo', key: 'correo_cliente', width: 25 },
      { header: 'Teléfono', key: 'telefono_cliente', width: 15 },
	  { header: 'Tipo viaje', key: 'tipo_viaje', width: 14 },
      { header: 'Tipo transporte', key: 'tipo_transporte', width: 18 },
      { header: 'Estatus', key: 'estatus', width: 12 },
	  { header: 'Zona', key: 'zona', width: 12 },
      { header: 'Capacidad', key: 'capacidad', width: 12 },
      { header: 'Cant. pasajeros', key: 'cantidad_pasajeros', width: 14 },
      { header: 'Hotel llegada', key: 'hotel_llegada', width: 18 },
      { header: 'Hotel salida', key: 'hotel_salida', width: 18 },
      { header: 'Fecha llegada', key: 'fecha_llegada', width: 14 },
      { header: 'Hora llegada', key: 'hora_llegada', width: 12 },
      { header: 'Aerolínea llegada', key: 'aerolinea_llegada', width: 18 },
      { header: 'Vuelo llegada', key: 'vuelo_llegada', width: 14 },
      { header: 'Fecha salida', key: 'fecha_salida', width: 14 },
      { header: 'Hora salida', key: 'hora_salida', width: 12 },
      { header: 'Aerolínea salida', key: 'aerolinea_salida', width: 18 },
      { header: 'Vuelo salida', key: 'vuelo_salida', width: 14 },	  
      { header: 'Rep. llegada', key: 'representante_llegada', width: 18 },
      { header: 'Inició viaje llegada', key: 'fecha_inicioviajellegada', width: 16 },
      { header: 'Finalizó viaje llegada', key: 'fecha_finalviajellegada', width: 16 },
      { header: 'Chofer llegada', key: 'choferllegada', width: 16 },
      { header: 'Unidad llegada', key: 'numero_unidadllegada', width: 14 },
      { header: 'Estatus llegada', key: 'estatus_viajellegada', width: 16 },
      { header: 'Pasajeros ok llegada', key: 'cantidad_pasajerosokllegada', width: 20 },
      { header: 'Rep. salida', key: 'representante_salida', width: 18 },
      { header: 'Inició viaje salida', key: 'fecha_inicioviajesalida', width: 16 },
      { header: 'Finalizó viaje salida', key: 'fecha_finalviajesalida', width: 16 },
      { header: 'Comentarios salida', key: 'comentariossalida', width: 20 },
      { header: 'Chofer salida', key: 'chofersalida', width: 16 },
      { header: 'Unidad salida', key: 'numero_unidadsalida', width: 14 },
      { header: 'Estatus salida', key: 'estatus_viajesalida', width: 16 },
      { header: 'Pasajeros ok salida', key: 'cantidad_pasajerosoksalida', width: 20 },
      { header: 'Chofer ext. nombre', key: 'chofer_externonombre', width: 18 },
      { header: 'Chofer ext. tel', key: 'choferexterno_tel', width: 16 },
      { header: 'Empresa chofer ext.', key: 'chofer_empresaext', width: 20 }
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

    const camposConHora = [
      'fecha_inicioviajellegada',
      'fecha_finalviajellegada',
      'fecha_inicioviajesalida',
      'fecha_finalviajesalida'
    ];

    rows.forEach((r, idx) => {
      const row = ws.getRow(7 + idx);
      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        const val = r[h.key];
        cell.value = val == null ? '' : val;
        if (camposConHora.includes(h.key) && val instanceof Date) {
          cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
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

    const buffer = await wb.xlsx.writeBuffer();
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="reservaciones.xlsx"')
      .send(buffer);

  } catch (err) {
    console.error('Error al generar Excel:', err);
    res.status(500).send('Error al generar Excel');
  }
});

export default router;
