import pool from './conexion.js';
import { DateTime } from 'luxon';

export default async function actualizarDatosTransporte(req, res) {
  const { 
    token_qr, 
    usuario_proveedor, 
    driver,
	chofer_nombre,  // ✅ nuevo
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

    if (chofer_nombre) {
	  updates.push(`chofer = $${paramIndex++}`);
	  values.push(chofer_nombre);
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
      // 🔥 Convertir a zona horaria Mazatlán
      const fechaMazatlan = DateTime.fromISO(fecha_inicioviaje).setZone('America/Mazatlan').toISO();
      updates.push(`fecha_inicioviaje = $${paramIndex++}`);
      values.push(fechaMazatlan);
      estatus_viaje = 'asignado';
    }

    if (fecha_finalviaje) {
      // 🔥 También convertir si se usa
      const fechaMazatlanFinal = DateTime.fromISO(fecha_finalviaje).setZone('America/Mazatlan').toISO();
      updates.push(`fecha_finalviaje = $${paramIndex++}`);
      values.push(fechaMazatlanFinal);
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