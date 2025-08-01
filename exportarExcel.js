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

    // 1) Fechas
    condiciones.push(`
      (
        fecha_inicioviajesalida  BETWEEN $1 AND $2 OR
        fecha_inicioviajellegada BETWEEN $1 AND $2 OR
        fecha_finalviajesalida    BETWEEN $1 AND $2 OR
        fecha_finalviajellegada   BETWEEN $1 AND $2
      )
    `);
    valores.push(desde, hasta);

    // 2) Busqueda
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`
        folio ILIKE $${valores.length}
        OR nombre_cliente ILIKE $${valores.length}
      `);
    }

    // 3) Representante
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
        estatus, capacidad, cantidad_pasajeros,
        hotel_llegada, hotel_salida,
        fecha_llegada, hora_llegada, aerolinea_llegada, vuelo_llegada,
        fecha_salida, hora_salida, aerolinea_salida, vuelo_salida,
        zona, tipo_viaje,
        representante_llegada, fecha_inicioviajellegada,
        fecha_finalviajellegada, choferllegada, numero_unidadllegada,
        estatus_viajellegada, cantidad_pasajerosokllegada,
        representante_salida, fecha_inicioviajesalida,
        fecha_finalviajesalida, comentariossalida, firma_clientesalida,
        chofersalida, numero_unidadsalida, estatus_viajesalida,
        cantidad_pasajerosoksalida, chofer_externonombre,
        choferexterno_tel, chofer_empresaext
      FROM reservaciones
      WHERE ${condiciones.join(' AND ')}
      ORDER BY
        COALESCE(
          fecha_inicioviajesalida,
          fecha_inicioviajellegada,
          fecha_finalviajesalida,
          fecha_finalviajellegada
        ) DESC
      LIMIT 200;
    `;

    const { rows } = await pool.query(sql, valores);

    // --- Generar Excel con exceljs ---
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reservaciones');

    // 1) Insertar logo (debe existir en /public/logo.png)
    const logoPath = path.resolve('public/logo.png');
    const imgId = wb.addImage({
      filename: logoPath,
      extension: 'png',
    });
    // posicionar el logo (col A - B, row 1 - 4)
    ws.addImage(imgId, {
      tl: { col: 0, row: 0 },
      br: { col: 2, row: 4 },
    });

    // 2) Definir encabezados y anchos de columna
    const headers = [
      { header: 'Folio', key: 'folio', width: 15 },
      { header: 'Cliente', key: 'nombre_cliente', width: 25 },
      { header: 'Correo', key: 'correo_cliente', width: 30 },
      { header: 'Teléfono', key: 'telefono_cliente', width: 15 },
      { header: 'Nota', key: 'nota', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      /* … añade el resto igual … */
    ];
    ws.columns = headers;

    // 3) Styling de la fila de encabezados
    ws.getRow(6).font = { bold: true };     // suponiendo que el header esté en la fila 6
    ws.getRow(6).alignment = { horizontal: 'center' };
    ws.getRow(6).height = 20;

    // 4) Escribir datos (comienza en la fila 7)
    rows.forEach((r, i) => {
      const rowIndex = i + 7;
      ws.addRow(r);
    });

    // 5) Generar buffer y responder
    const buf = await wb.xlsx.writeBuffer();
    res
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      .setHeader(
        'Content-Disposition',
        'attachment; filename="reservaciones.xlsx"'
      )
      .send(buf);

  } catch (err) {
    console.error('Error al generar Excel:', err);
    res.status(500).send('Error al generar Excel');
  }
});

export default router;