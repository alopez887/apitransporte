// exportarExcel.js
import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config();

const router = express.Router();

// Creamos un Pool dedicado para la exportación:
// – Si existe DATABASE_URL, lo usamos con SSL (Railway).
// – Si no, caemos a tu actual { PGHOST, PGUSER, … } con SSL = false o true según necesites.
const poolExport = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host:     process.env.PGHOST,
      user:     process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port:     process.env.PGPORT,
      // si en local no quieres SSL, pon ssl: false
      ssl:      { rejectUnauthorized: false }
    });

router.get('/exportar-excel', async (req, res) => {
  try {
    const { desde, hasta, busqueda, representante } = req.query;
    const condiciones = [];
    const valores = [];

    // Rango de fechas
    condiciones.push(`(fecha_inicioviaje >= $1 AND fecha_inicioviaje <= $2)`);
    valores.push(desde, hasta);

    // Búsqueda por folio o cliente
    if (busqueda) {
      valores.push(`%${busqueda}%`);
      condiciones.push(`(folio ILIKE $${valores.length} OR nombre_cliente ILIKE $${valores.length})`);
    }

    // Filtro de representante
    if (representante) {
      valores.push(`%${representante}%`);
      condiciones.push(`(
        representante_salida   ILIKE $${valores.length} OR
        representante_llegada ILIKE $${valores.length} OR
        representante         ILIKE $${valores.length}
      )`);
    }

    const sql = `
      SELECT
        folio,
        COALESCE(nombre_cliente, nombre) AS cliente,
        tipo_viaje,
        COALESCE(numero_unidadsalida, numero_unidadllegada, numero_unidad) AS unidad,
        COALESCE(cantidad_pasajerosoksalida,
                 cantidad_pasajerosokllegada,
                 cantidad_pasajeros) AS pasajeros,
        TO_CHAR(fecha_inicioviaje, 'YYYY-MM-DD') AS fecha_inicio,
        COALESCE(representante_salida,
                 representante_llegada,
                 representante) AS representante,
        COALESCE(comentariossalida,
                 comentariosllegada,
                 comentarios) AS comentario,
        CASE
          WHEN estatus_viajesalida = 'finalizado'
            OR estatus_viajellegada = 'finalizado'
            THEN 'Finalizado'
          WHEN estatus_viajesalida = 'asignado'
            OR estatus_viajellegada = 'asignado'
            THEN 'Asignado'
          ELSE ''
        END AS estatus
      FROM servicios_transporte
      WHERE ${condiciones.join(' AND ')}
      ORDER BY fecha_inicio;
    `;

    const { rows } = await poolExport.query(sql, valores);

    // Armar el Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Servicios');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Devolver descarga
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