// exportarExcel.js
import express from 'express';
import pool from './conexion.js';
import XLSX from 'xlsx';

const router = express.Router();

router.get('/exportar-excel', async (req, res) => {
  try {
    const { desde, hasta, busqueda, representante } = req.query;
    const condiciones = [];
    const valores = [];

    // 1) FILTRO POR CAMPO 'fecha'
    condiciones.push(`fecha BETWEEN $1 AND $2`);
    valores.push(desde, hasta);

    // 2) BÚSQUEDA (folio / nombre_cliente)
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`(folio ILIKE $${valores.length} OR nombre_cliente ILIKE $${valores.length})`);
    }

    // 3) REPRESENTANTE
    if (representante) {
      valores.push(`%${representante}%`);
      condiciones.push(`(
        representante_llegada ILIKE $${valores.length}
        OR representante_salida ILIKE $${valores.length}
      )`);
    }

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

    console.log('🔍 exportarExcel SQL:', sql);
    console.log('🔢 Valores:', valores);

    const { rows } = await pool.query(sql, valores);
    console.log('🏷️ exportarExcel rows:', rows.length, rows);

    // Generar Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Reservaciones');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

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