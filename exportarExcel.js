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

    // 1) Rango de fechas idéntico al endpoint de listing
    condiciones.push(`
      (
        fecha_inicioviajesalida  BETWEEN $1 AND $2 OR
        fecha_inicioviajellegada BETWEEN $1 AND $2 OR
        fecha_finalviajesalida    BETWEEN $1 AND $2 OR
        fecha_finalviajellegada   BETWEEN $1 AND $2
      )
    `);
    valores.push(desde, hasta);

    // 2) Búsqueda folio/nombre_cliente
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`
        folio ILIKE $${valores.length}
        OR nombre_cliente ILIKE $${valores.length}
      `);
    }

    // 3) Representante llegada/salida
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
        ) DESC NULLS LAST
      LIMIT 200;
    `;

    const { rows } = await pool.query(sql, valores);

    // --- Empieza la creación del Excel ---
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reservaciones');

    // 1) Inserta el logo en filas 1-4
    const logoId = wb.addImage({
      filename: path.resolve('public/logo.png'),
      extension: 'png',
    });
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      br: { col: 2, row: 4 }
    });

    // 2) Define los encabezados y anchos de columna
    const headers = [
      { header: 'Folio', key: 'folio', width: 15 },
      { header: 'Cliente', key: 'nombre_cliente', width: 25 },
      { header: 'Correo', key: 'correo_cliente', width: 30 },
      { header: 'Teléfono', key: 'telefono_cliente', width: 15 },
      { header: 'Nota', key: 'nota', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Tipo servicio', key: 'tipo_servicio', width: 20 },
      { header: 'Tipo transporte', key: 'tipo_transporte', width: 20 },
      { header: 'Proveedor', key: 'proveedor', width: 20 },
      { header: 'Estatus', key: 'estatus', width: 15 },
      // … agrega el resto de columnas según tu lista …
    ];

    // 3) Agrega la fila de encabezados en la fila 6 (justo debajo del logo)
    ws.getRow(6).values = headers.map(h => h.header);
    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    // 4) Aplica negrita y centrar a esa fila
    ws.getRow(6).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 5) Escribe los datos comenzando en la fila 7
    rows.forEach((r, i) => {
      const row = ws.getRow(i + 7);
      headers.forEach((h, colIdx) => {
        row.getCell(colIdx + 1).value = r[h.key];
      });
      row.commit();
    });

    // 6) Envía el buffer al cliente
    const buffer = await wb.xlsx.writeBuffer();
    res
      .setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition',
        'attachment; filename="reservaciones.xlsx"')
      .send(buffer);

  } catch (err) {
    console.error('Error al generar Excel:', err);
    res.status(500).send('Error al generar Excel');
  }
});

export default router;