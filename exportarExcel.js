// exportarExcel.js
import express from 'express';
import pool from './conexion.js';      // tu pool existente
import XLSX from 'xlsx';

const router = express.Router();

router.get('/exportar-excel', async (req, res) => {
  try {
    const { desde, hasta, busqueda, representante } = req.query;
    const condiciones = [];
    const valores = [];

    // 1) Rango de fechas
    condiciones.push(`(fecha_inicioviaje >= $1 AND fecha_inicioviaje <= $2)`);
    valores.push(desde, hasta);

    // 2) Búsqueda folio/cliente
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`(folio ILIKE $${valores.length} OR nombre_cliente ILIKE $${valores.length})`);
    }

    // 3) Filtro representante
    if (representante) {
      valores.push(`%${representante}%`);
      condiciones.push(`(
        representante_salida   ILIKE $${valores.length} OR
        representante_llegada  ILIKE $${valores.length} OR
        representante          ILIKE $${valores.length}
      )`);
    }

    const sql = `
      SELECT
        folio,
        COALESCE(nombre_cliente, nombre)                                        AS cliente,
        tipo_viaje,
        COALESCE(numero_unidadsalida, numero_unidadllegada, numero_unidad)      AS unidad,
        COALESCE(cantidad_pasajerosoksalida,
                 cantidad_pasajerosokllegada,
                 cantidad_pasajeros)                                            AS pasajeros,
        TO_CHAR(fecha_inicioviaje, 'YYYY-MM-DD')                                 AS fecha_inicio,
        COALESCE(representante_salida,
                 representante_llegada,
                 representante)                                                  AS representante,
        COALESCE(comentariossalida,
                 comentariosllegada,
                 comentarios)                                                    AS comentario,
        CASE
          WHEN estatus_viajesalida = 'finalizado'
            OR estatus_viajellegada = 'finalizado' THEN 'Finalizado'
          WHEN estatus_viajesalida = 'asignado'
            OR estatus_viajellegada = 'asignado'   THEN 'Asignado'
          ELSE ''
        END                                                                     AS estatus
      FROM servicios_transporte
      WHERE ${condiciones.join(' AND ')}
      ORDER BY fecha_inicio;
    `;

    // 4) Usamos el pool de conexion.js
    const { rows } = await pool.query(sql, valores);

    // 5) Armar Excel con SheetJS
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Servicios');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // 6) Enviar como descarga
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="servicios-asignados.xlsx"')
      .send(buffer);

  } catch (err) {
    console.error('Error al generar Excel:', err);
    res.status(500).send('Error al generar Excel');
  }
});

export default router;