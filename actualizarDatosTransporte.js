import pool from './conexion.js';
import { DateTime } from 'luxon';

export default async function actualizarDatosTransporte(req, res) {
  const {
    token_qr,
    folio,
    tipo_viaje,
    usuario_proveedor,
    chofer_nombre,
    unit,
    comentarios,
    fecha_inicioviaje,
    fecha_finalviaje,
    cantidad_pasajerosok,
    firma_cliente,
    chofer_externonombre,
    choferexterno_tel,
    chofer_empresaext
  } = req.body;

  if (!token_qr && !folio) {
    return res.status(400).json({ success: false, message: 'Falta identificador: token_qr o folio' });
  }

  if (!tipo_viaje) {
    return res.status(400).json({ success: false, message: 'Falta el tipo de viaje' });
  }

  try {
    let identificador = token_qr || folio;
    let campoIdentificador = token_qr ? 'token_qr' : 'folio';

    let campoEstatus = '';
    let sufijo = '';

    if (tipo_viaje === 'llegada') {
      campoEstatus = 'estatus_viajellegada';
      sufijo = 'llegada';
    } else if (tipo_viaje === 'salida') {
      campoEstatus = 'estatus_viajesalida';
      sufijo = 'salida';
    } else {
      return res.status(400).json({ success: false, message: 'Tipo de viaje inválido' });
    }

    const checkQuery = `SELECT ${campoEstatus} FROM reservaciones WHERE ${campoIdentificador} = $1`;
    const checkRes = await pool.query(checkQuery, [identificador]);

    if (checkRes.rows.length > 0 && checkRes.rows[0][campoEstatus] === 'finalizado') {
      return res.status(400).json({ success: false, message: 'Este servicio ya fue finalizado y no se puede modificar.' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;
    let estatusViaje = null;

    const setCampo = (campoBase, valor) => {
      if (valor === undefined) return;
      const campo = `${campoBase}${sufijo}`;
      updates.push(`${campo} = $${paramIndex++}`);
      values.push(valor);
    };

    setCampo('usuario_proveedor', usuario_proveedor);
    setCampo('comentarios', comentarios);
    setCampo('firma_cliente', firma_cliente);
    setCampo('cantidad_pasajerosok', cantidad_pasajerosok);

    if (fecha_inicioviaje) {
      const fechaInicio = DateTime.fromISO(fecha_inicioviaje).setZone('America/Mazatlan').toISO();
      setCampo('fecha_inicioviaje', fechaInicio);
      estatusViaje = 'asignado';
    }

    if (fecha_finalviaje) {
      const fechaFin = DateTime.fromISO(fecha_finalviaje).setZone('America/Mazatlan').toISO();
      setCampo('fecha_finalviaje', fechaFin);
      estatusViaje = 'finalizado';
    }

    if (estatusViaje) {
      setCampo('estatus_viaje', estatusViaje);
    }

    // Chofer externo
    if (chofer_externonombre && choferexterno_tel && chofer_empresaext) {
      updates.push(`chofer_externonombre = $${paramIndex++}`);
      updates.push(`choferexterno_tel = $${paramIndex++}`);
      updates.push(`chofer_empresaext = $${paramIndex++}`);
      values.push(chofer_externonombre, choferexterno_tel, chofer_empresaext);

      updates.push(`chofer${sufijo} = NULL`);
      updates.push(`numero_unidad${sufijo} = NULL`);
    } else {
      setCampo('chofer', chofer_nombre);
      setCampo('numero_unidad', unit);
      updates.push(`chofer_externonombre = NULL`);
      updates.push(`choferexterno_tel = NULL`);
      updates.push(`chofer_empresaext = NULL`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No se recibieron campos para actualizar' });
    }

    let whereClause = '';
    if (token_qr) {
      whereClause = `token_qr = $${paramIndex}`;
      values.push(token_qr);
    } else {
      whereClause = `folio = $${paramIndex}`;
      values.push(folio);
    }

    const query = `
      UPDATE reservaciones
      SET ${updates.join(', ')}
      WHERE ${whereClause}
    `;

    await pool.query(query, values);

    res.json({ success: true, message: 'Datos actualizados correctamente' });

  } catch (error) {
    console.error('❌ Error actualizando transporte:', error.message);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
}