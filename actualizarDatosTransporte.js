import pool from './conexion.js';
import { DateTime } from 'luxon';

export default async function actualizarDatosTransporte(req, res) {
  const {
    token_qr,
    folio,
    tipo_viaje,
    representante_llegada,
    representante_salida,
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

  const tipoViajeBase =
    tipo_viaje === 'redondo_llegada' ? 'llegada' :
    tipo_viaje === 'redondo_salida'  ? 'salida'  :
    tipo_viaje === 'shuttle'         ? 'llegada' :
    tipo_viaje;

  const tiposValidos = ['llegada', 'salida', 'shuttle'];
  if (!tipoViajeBase || !tiposValidos.includes(tipo_viaje)) {
    return res.status(400).json({ success: false, message: 'Tipo de viaje inválido' });
  }

  try {
    const identificador      = token_qr || folio;
    const campoIdentificador = token_qr ? 'token_qr' : 'folio';
    const campoEstatus       = `estatus_viaje${tipoViajeBase}`;
    const sufijo             = tipoViajeBase;

    const checkQuery = `
      SELECT estatus_viajellegada, estatus_viajesalida
      FROM reservaciones
      WHERE ${campoIdentificador} = $1
    `;
    const checkRes = await pool.query(checkQuery, [identificador]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Reservación no encontrada' });
    }

    const estatusLlegada = checkRes.rows[0].estatus_viajellegada;
    const estatusSalida  = checkRes.rows[0].estatus_viajesalida;

    if (estatusLlegada === 'finalizado' && estatusSalida === 'finalizado') {
      return res.status(400).json({ success: false, message: 'Este servicio ya fue finalizado completamente y no se puede modificar.' });
    }

    if ((tipo_viaje === 'llegada' || tipo_viaje === 'redondo_llegada' || tipo_viaje === 'shuttle') && estatusLlegada === 'finalizado') {
      return res.status(400).json({ success: false, message: 'La llegada ya fue finalizada y no se puede modificar.' });
    }

    if ((tipo_viaje === 'salida' || tipo_viaje === 'redondo_salida') && estatusSalida === 'finalizado') {
      return res.status(400).json({ success: false, message: 'La salida ya fue finalizada y no se puede modificar.' });
    }

    const updates = [];
    const values  = [];
    let paramIndex = 1;
    let estatusViaje = null;

    const setCampo = (campoBase, valor) => {
      if (valor === undefined) return;
      const campo = `${campoBase}${sufijo}`;
      updates.push(`${campo} = $${paramIndex++}`);
      values.push(valor);
    };

    if (tipoViajeBase === 'llegada' && representante_llegada !== undefined) {
      updates.push(`representante_llegada = $${paramIndex++}`);
      values.push(representante_llegada);
    }
    if (tipoViajeBase === 'salida' && representante_salida !== undefined) {
      updates.push(`representante_salida = $${paramIndex++}`);
      values.push(representante_salida);
    }

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
      updates.push(`${campoEstatus} = $${paramIndex++}`);
      values.push(estatusViaje);
    }

    if (chofer_externonombre && choferexterno_tel && chofer_empresaext) {
      updates.push(`chofer_externonombre = $${paramIndex++}`);
      updates.push(`choferexterno_tel   = $${paramIndex++}`);
      updates.push(`chofer_empresaext   = $${paramIndex++}`);
      values.push(chofer_externonombre, choferexterno_tel, chofer_empresaext);

      updates.push(`chofer${sufijo} = NULL`);

      if (unit !== undefined && unit !== null && unit !== '') {
        setCampo('numero_unidad', unit);
      } else {
        updates.push(`numero_unidad${sufijo} = NULL`);
      }
    } else {
      setCampo('chofer', chofer_nombre);
      setCampo('numero_unidad', unit);

      updates.push(`chofer_externonombre = NULL`);
      updates.push(`choferexterno_tel    = NULL`);
      updates.push(`chofer_empresaext    = NULL`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No se recibieron campos para actualizar' });
    }

    const whereClause = `${campoIdentificador} = $${paramIndex}`;
    values.push(identificador);

    const query = `
      UPDATE reservaciones
      SET ${updates.join(', ')}
      WHERE ${whereClause}
    `;

    await pool.query(query, values);

    res.json({ success: true, message: 'Datos actualizados correctamente' });

  } catch (error) {
    console.error('❌ Error en actualizarDatosTransporte:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
}
