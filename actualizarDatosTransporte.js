import pool from './conexion.js';

export default async function actualizarDatosTransporte(req, res) {
  const { token_qr, usuario_proveedor, fecha_inicioviaje, fecha_finalviaje, firma_cliente, comentarios } = req.body;

  if (!token_qr || !usuario_proveedor) {
    return res.status(400).json({ success: false, message: 'Datos incompletos' });
  }

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // usuario_proveedor siempre
    updates.push(`usuario_proveedor = $${paramIndex++}`);
    values.push(usuario_proveedor);

    if (fecha_inicioviaje) {
      updates.push(`fecha_inicioviaje = $${paramIndex++}`);
      values.push(fecha_inicioviaje);
    }

    if (fecha_finalviaje) {
      updates.push(`fecha_finalviaje = $${paramIndex++}`);
      values.push(fecha_finalviaje);
    }

    if (firma_cliente) {
      updates.push(`firma_cliente = $${paramIndex++}`);
      values.push(firma_cliente);
    }

    if (comentarios) {
      updates.push(`comentarios = $${paramIndex++}`);
      values.push(comentarios);
    }

    // WHERE
    values.push(token_qr);

    const query = `
      UPDATE reservaciones
      SET ${updates.join(', ')}
      WHERE token_qr = $${paramIndex}
    `;

    await pool.query(query, values);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error actualizando transporte:', error.message);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
}