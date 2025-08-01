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

    // Consulta con los campos exactos
    const sql = `
      SELECT
        nombre_cliente,
        correo_cliente,
        telefono_cliente,
        fecha,
        tipo_servicio,
        tipo_transporte,
        proveedor,
        estatus,
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
        zona,
        tipo_viaje,
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

    // Crear libro y hoja
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reservaciones');

    // 1) Logo en A1:B4
    const logoId = wb.addImage({
      filename: path.resolve('public/logo.png'),
      extension: 'png'
    });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 2, row: 4 } });

    // 2) Combinar A1:B4 para ocultar líneas bajo el logo
    ws.mergeCells('A1:B4');
    const blank = ws.getCell('A1');
    blank.value = '';
    blank.alignment = { horizontal: 'center', vertical: 'middle' };

    // 3) Título en C1:H4
    ws.mergeCells('C1:H4');
    const titleCell = ws.getCell('C1');
    titleCell.value = 'REPORTE DE SERVICIOS ASIGNADOS CABO TRAVELS SOLUTIONS';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 4) Encabezados y anchos
    const headers = [
      { header: 'Cliente', key: 'nombre_cliente', width: 20 },
      { header: 'Correo', key: 'correo_cliente', width: 25 },
      { header: 'Teléfono', key: 'telefono_cliente', width: 15 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Tipo servicio', key: 'tipo_servicio', width: 18 },
      { header: 'Tipo transporte', key: 'tipo_transporte', width: 18 },
      { header: 'Proveedor', key: 'proveedor', width: 18 },
      { header: 'Estatus', key: 'estatus', width: 12 },
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
      { header: 'Zona', key: 'zona', width: 12 },
      { header: 'Tipo viaje', key: 'tipo_viaje', width: 14 },
      { header: 'Rep. llegada', key: 'representante_llegada', width: 18 },
      { header: 'Inicio llegada', key: 'fecha_inicioviajellegada', width: 16 },
      { header: 'Final llegada', key: 'fecha_finalviajellegada', width: 16 },
      { header: 'Chofer llegada', key: 'choferllegada', width: 16 },
      { header: 'Unidad llegada', key: 'numero_unidadllegada', width: 14 },
      { header: 'Estatus llegada', key: 'estatus_viajellegada', width: 16 },
      { header: 'Pasajeros ok llegada', key: 'cantidad_pasajerosokllegada', width: 20 },
      { header: 'Rep. salida', key: 'representante_salida', width: 18 },
      { header: 'Inicio salida', key: 'fecha_inicioviajesalida', width: 16 },
      { header: 'Final salida', key: 'fecha_finalviajesalida', width: 16 },
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

    // 5) Fila de encabezados (6)
    const headerRow = ws.getRow(6);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.header;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 20;

    // 6) Datos (fila 7+), vacíos si null/undefined
    rows.forEach((r, idx) => {
      const row = ws.getRow(7 + idx);
      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        const val = r[h.key];
        cell.value = val == null ? '' : val;
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      row.commit();
    });

    // 7) Enviar archivo
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