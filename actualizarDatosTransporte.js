import pool from './conexion.js';

export default async function actualizarDatosTransporte(req, res) {
  const { 
    token_qr, 
    usuario_proveedor, 
    driver, 
    unit, 
    comentarios, 
    fecha_inicioviaje, 
    fecha_finalviaje 
  } = req.body;

  if (!token_qr || !usuario_proveedor) {
    return res.status(400).json({ success: false, message: 'Datos incompletos' });
  }

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;
    let estatus_viaje = null;

    // Siempre usuario_proveedor
    updates.push(`usuario_proveedor = $${paramIndex++}`);
    values.push(usuario_proveedor);

    if (driver) {
      updates.push(`chofer = $${paramIndex++}`);
      values.push(driver);
    }

    if (unit) {
      updates.push(`numero_unidad = $${paramIndex++}`);
      values.push(unit);
    }

    if (comentarios) {
      updates.push(`comentarios = $${paramIndex++}`);
      values.push(comentarios);
    }

    if (fecha_inicioviaje) {
      updates.push(`fecha_inicioviaje = $${paramIndex++}`);
      values.push(fecha_inicioviaje);
      estatus_viaje = 'asignado';
    }

    if (fecha_finalviaje) {
      updates.push(`fecha_finalviaje = $${paramIndex++}`);
      values.push(fecha_finalviaje);
      estatus_viaje = 'finalizado';
    }

    if (estatus_viaje) {
      updates.push(`estatus_viaje = $${paramIndex++}`);
      values.push(estatus_viaje);
    }

    // WHERE
    values.push(token_qr);

    const query = `
      UPDATE reservaciones
      SET ${updates.join(', ')}
      WHERE token_qr = $${paramIndex}
    `;

    await pool.query(query, values);

    res.json({ success: true, message: 'Datos actualizados correctamente' });

  } catch (error) {
    console.error('❌ Error actualizando transporte:', error.message);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
}