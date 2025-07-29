// obtenerServiciosRepresentante.js
import pool from './conexion.js'; // Ajusta el import según tu estructura

export async function obtenerServiciosRepresentante(req, res) {
  try {
    const {
      usuario = '',
      fecha_inicio = '',
      fecha_fin = '',
      estatus = '',
      pagina = 1,
      por_pagina = 10,
      busqueda = ''
    } = req.query;

    // Construcción de filtros dinámicos
    let filtros = [];
    let valores = [];
    let idx = 1;

    // Filtro por representante (puede ser llegada o salida)
    if (usuario) {
      filtros.push(`(representante_llegada = $${idx} OR representante_salida = $${idx})`);
      valores.push(usuario);
      idx++;
    }
    // Filtro por fecha (puedes afinar si solo aplica a llegada/salida)
    if (fecha_inicio) {
      filtros.push(`(fecha_llegada >= $${idx} OR fecha_salida >= $${idx})`);
      valores.push(fecha_inicio);
      idx++;
    }
    if (fecha_fin) {
      filtros.push(`(fecha_llegada <= $${idx} OR fecha_salida <= $${idx})`);
      valores.push(fecha_fin);
      idx++;
    }
    // Filtro por estatus
    if (estatus) {
      filtros.push(`(estatus_viajellegada = $${idx} OR estatus_viajesalida = $${idx})`);
      valores.push(estatus);
      idx++;
    }
    // Búsqueda por folio o nombre cliente
    if (busqueda) {
      filtros.push(`(
        folio ILIKE $${idx} OR
        nombre_cliente ILIKE $${idx} OR
        hotel_llegada ILIKE $${idx} OR
        hotel_salida ILIKE $${idx}
      )`);
      valores.push(`%${busqueda}%`);
      idx++;
    }

    // WHERE final
    let where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    let offset = (parseInt(pagina, 10) - 1) * parseInt(por_pagina, 10);

    // Query principal
    const query = `
      SELECT
        folio, tipo_viaje, nombre_cliente, hotel_llegada, hotel_salida,
        fecha_llegada, fecha_salida, estatus_viajellegada, estatus_viajesalida,
        representante_llegada, representante_salida, choferllegada, chofersalida,
        chofer_externonombre, choferexterno_tel, chofer_empresaext, total_pago
      FROM reservaciones
      ${where}
      ORDER BY fecha_llegada DESC NULLS LAST, fecha_salida DESC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    valores.push(parseInt(por_pagina, 10), offset);

    // Query para el total
    const queryTotal = `
      SELECT COUNT(*) AS total
      FROM reservaciones
      ${where}
    `;

    // Ejecuta ambas consultas
    const [result, totalResult] = await Promise.all([
      pool.query(query, valores),
      pool.query(queryTotal, valores.slice(0, idx-1))
    ]);

    res.json({
      success: true,
      servicios: result.rows,
      total: parseInt(totalResult.rows[0].total, 10)
    });
  } catch (err) {
    console.error("❌ Error al obtener servicios:", err);
    res.status(500).json({ success: false, message: "Error interno" });
  }
}