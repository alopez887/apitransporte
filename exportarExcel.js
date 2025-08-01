// exportarExcel.js
import express from 'express';
import pool from './conexion.js';    // tu conexión existente
import XLSX from 'xlsx';

const router = express.Router();

router.get('/exportar-excel', async (req, res) => {
  try {
    const { desde, hasta, busqueda, representante } = req.query;
    const condiciones = [];
    const valores = [];

    // 1) Filtrar por rango sobre la columna "fecha"
    condiciones.push(`fecha >= $1 AND fecha <= $2`);
    valores.push(desde, hasta);

    // 2) Filtro de búsqueda (folio o nombre_cliente)
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`(folio ILIKE $${valores.length} OR nombre_cliente ILIKE $${valores.length})`);
    }

    // 3) Filtro de representante (llegada o salida)
    if (representante) {
      valores.push(`%${representante}%`);
      condiciones.push(`(
        representante_llegada ILIKE $${valores.length} OR
        representante_salida  ILIKE $${valores.length}
      )`);
    }

    // 4) Consulta SELECT con todas las columnas que necesitas
    const sql = `
      SELECT
        folio,
        nombre_cliente,
        correo_cliente,
        telefono_cliente,
        nota,
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
        firma_clientesalida,
        chofersalida,
        numero_unidadsalida,
        estatus_viajesalida,
        cantidad_pasajerosoksalida,
        chofer_externonombre,
        choferexterno_tel,
        chofer_empresaext
      FROM reservaciones
      WHERE ${condiciones.join(' AND ')}
      ORDER BY fecha;
    `;

    // 5) Ejecutar la consulta
    const { rows } = await pool.query(sql, valores);

    // 6) Generar libro de Excel con SheetJS
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Reservaciones');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // 7) Enviar como descarga .xlsx
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