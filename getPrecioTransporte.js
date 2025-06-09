// getPrecioTransporte.js
export default async function getPrecioTransporte(req, res) {
  const { transporte, zona, pasajeros, codigo } = req.body;

  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan datos requeridos (transporte, zona, pasajeros)' });
  }

  try {
    const client = await req.app.locals.pool.connect();

    try {
      // 🔹 Obtener precio base
      const precioResult = await client.query(
        `SELECT precio_original, precio_descuento_13 AS precio_descuento
         FROM tarifas_transportacion
         WHERE UPPER(tipo_transporte) = UPPER($1)
         AND zona_id = $2
         AND rango_pasajeros = $3`,
        [transporte, zona, pasajeros]
      );

      if (precioResult.rows.length === 0) {
        return res.status(404).json({ error: 'No se encontró tarifa' });
      }

      const tarifa = precioResult.rows[0];
      let precioFinal = tarifa.precio_descuento || tarifa.precio_original;
      let tipoDescuento = null;

      // 🔹 Si se mandó un código de descuento, validar
      if (codigo && codigo.trim() !== '') {
        const descResult = await client.query(
          `SELECT tipo_descuento
           FROM codigos_descuento
           WHERE codigo = $1
           AND UPPER(tipo_transporte) = UPPER($2)
           AND zona = $3`,
          [codigo.trim(), transporte, zona]
        );

        if (descResult.rows.length > 0) {
          tipoDescuento = descResult.rows[0].tipo_descuento;
          // Aplicar descuento si se requiere (puedes ajustar este cálculo)
          if (tipoDescuento === '13') {
            precioFinal = tarifa.precio_original * 0.87;
          } else if (tipoDescuento === '13.5') {
            precioFinal = tarifa.precio_original * 0.865;
          }
        }
      }

      res.json({
        precio_original: tarifa.precio_original,
        precio_final: parseFloat(precioFinal.toFixed(2)),
        tipo_descuento: tipoDescuento || 'Ninguno'
      });

    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Error en getPrecioTransporte:', err);
    res.status(500).json({ error: 'Error al calcular precio' });
  }
}