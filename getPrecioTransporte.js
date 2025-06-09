// getPrecioTransporte.js
export default async function getPrecioTransporte(req, res) {
  const { transporte, zona, pasajeros } = req.query;
  const campo = req.query.campo; // Campo opcional

  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan datos requeridos (transporte, zona, pasajeros)' });
  }

  try {
    const client = await req.app.locals.pool.connect();

    try {
      // Validar campo permitido
      const camposValidos = ['precio_original', 'precio_descuento_13', 'precio_descuento_15'];
      const campoValido = campo && camposValidos.includes(campo) ? campo : 'precio_original';

      const query = `
        SELECT ${campoValido} AS precio
        FROM tarifas_transportacion
        WHERE UPPER(tipo_transporte) = UPPER($1)
        AND zona_id = $2
        AND rango_pasajeros = $3
      `;

      const result = await client.query(query, [transporte, zona, pasajeros]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No se encontró tarifa' });
      }

      const precio = result.rows[0].precio;

      res.json({
        precio: parseFloat(precio).toFixed(2),
        campo_utilizado: campoValido
      });

    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Error en getPrecioTransporte:', err);
    res.status(500).json({ error: 'Error al consultar precio' });
  }
}