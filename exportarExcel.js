// exportarExcel.js
import { Router } from 'express';
import { getServicios } from './serviciosModel.js'; // tu función de acceso a datos

const router = Router();

router.get('/exportar-servicios', async (req, res) => {
  try {
    // 1) Leer filtros desde query params
    const { desde, hasta, busqueda, representante } = req.query;

    // 2) Traer los servicios según esos filtros
    const servicios = await getServicios({ desde, hasta, busqueda, representante });

    // 3) Construir el CSV
    const encabezados = ['Folio','Cliente','Tipo viaje','Unidad','Pasajeros','Fecha inicio','Representante'];
    const filas = servicios.map(s => {
      const unidad    = s.numero_unidadsalida || s.numero_unidadllegada || '';
      const pasajeros = s.cantidad_pasajerosoksalida || s.cantidad_pasajerosokllegada || s.cantidad_pasajeros || '';
      const fecha     = (s.fecha_inicioviaje||s.fecha_inicioviajellegada||'').split('T')[0] || '';
      const rep       = s.representante_salida || s.representante_llegada || s.representante || '';
      return [
        s.folio || '',
        s.nombre_cliente || s.nombre || '',
        s.tipo_viaje || '',
        unidad,
        pasajeros,
        fecha,
        rep
      ].map(c => `"${String(c).replace(/"/g,'""')}"`).join(',');
    });

    const csv = [
      encabezados.join(','),
      ...filas
    ].join('\r\n');

    // 4) Forzar descarga con headers apropiados
    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    res.setHeader('Content-Disposition', 'attachment; filename="servicios-asignados.csv"');
    // BOM para que Excel reconozca UTF-8
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('Error exportando CSV:', err);
    res.status(500).send('Error generando el CSV');
  }
});

export default router;