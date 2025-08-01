// exportarExcel.js
import { Router } from 'express';
import { getServicios } from './serviciosModel.js';
import XLSX from 'xlsx';

const router = Router();

router.get('/exportar-excel', async (req, res) => {
  try {
    const { desde, hasta, busqueda, representante } = req.query;
    const servicios = await getServicios(desde, hasta, busqueda, representante);

    const rows = servicios.map(s => ({
      Folio: s.folio,
      Cliente: s.nombre_cliente,
      'Tipo viaje': s.tipo_viaje,
      Unidad: s.numero_unidadsalida || s.numero_unidadllegada,
      Pasajeros: s.cantidad_pasajerosoksalida
                 || s.cantidad_pasajerosokllegada
                 || s.cantidad_pasajeros,
      'Fecha inicio': s.fecha_inicioviaje.split('T')[0],
      Representante: s.representante_salida || s.representante_llegada || s.representante,
      Comentario: s.comentariossalida || s.comentariosllegada,
      Estatus: ['finalizado','Finalizado'].includes(s.estatus) ||
               ['finalizado','Finalizado'].includes(s.estatus_viajesalida) ||
               ['finalizado','Finalizado'].includes(s.estatus_viajellegada)
               ? 'Finalizado' : 'Asignado'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Servicios');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="servicios-asignados.xlsx"');
    res.type('application/octet-stream').send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al generar Excel');
  }
});

export default router;