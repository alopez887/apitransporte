import express from 'express';
import path from 'path';
import fs from 'fs';
import pool from './conexion.js';
import cors from 'cors';
import pkg from 'pg';
import dotenv from 'dotenv';

import guardarTransporte from './guardarTransporte.js';
import guardarRoundtrip from './guardarRoundtrip.js';
import { generarQRTransporte } from './generarQRTransporte.js';
import { obtenerReservaTransporte } from './obtenerReservaTransporte.js';
console.log("✅ Función obtenerReservaTransporte importada:", obtenerReservaTransporte);
import actualizarDatosTransporte from './actualizarDatosTransporte.js';
import guardarFirma from './firmas/guardarFirmas.js';
import loginUsuario from './loginUsuario.js';
import { obtenerChoferes } from './obtenerChoferes.js';
import { obtenerServiciosAsignadosEstatus } from './obtenerServiciosasignadosestatus.js';
import { obtenerServiciosRepresentante } from './obtenerServiciosRepresentante.js';
import { listarRepresentantes } from './listarRepresentantes.js';
import exportarExcelRouter from './exportarExcel.js';
import consultarLlegadas from './consultarLlegadas.js';
import exportarExcelLlegada from './exportarExcelLlegada.js';
import consultarSalidas from './consultarSalidas.js';
import exportarExcelSalidas from './exportarExcelSalidas.js';
import buscarReservas from './buscarReservas.js';
import exportarExcelReservas from './exportarExcelReservas.js';
import reportesIngresos from './reportesIngresos.js';
import ventasComparativa from './ventasComparativa.js';
import exportarReportesIngresosExcel from './exportarReportesIngresosExcel.js';
import exportarCsvVentasComparativa from './exportarCsvVentasComparativa.js';

// ⬇️ ÚNICO import de canvasCache
import registerCanvasCache from './canvasCache.js';

dotenv.config();
const { Pool } = pkg;
const app = express();

// ⬇️ Límite alto para data URLs (QR, etc.)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const PORT = process.env.PORT;

// Log simple de una ruta específica (debug)
app.use((req, res, next) => {
  if (req.url.includes('/api/obtener-reservas')) {
    console.log('🚨 Llamada a /api/obtener-reservas');
    console.log('🔹 Query:', req.query);
    console.log('🔹 Referer:', req.headers.referer || 'SIN REFERER');
  }
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.locals.pool = pool;

// ---------- Rutas principales ----------
app.post('/reservar-transporte', guardarTransporte);
app.post('/guardarroundtrip', guardarRoundtrip);

// Zonas por hotel
app.get('/zona-hotel', async (req, res) => {
  const { hotel } = req.query;
  if (!hotel) return res.status(400).json({ error: 'El parametro "hotel" es requerido' });

  try {
    const result = await pool.query(
      'SELECT zona_id FROM hoteles_zona WHERE nombre_hotel = $1',
      [hotel]
    );
    if (result.rows.length > 0) {
      res.json({ zona: result.rows[0].zona_id });
    } else {
      res.status(404).json({ error: 'Hotel no encontrado' });
    }
  } catch (err) {
    console.error('Error consultando zona por hotel:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

/* =========================================================
 * TARIFAS / CUPONES — soporta codigo_transporte (nuevo) y
 * tipo/transporte (legacy) SIN romper el front anterior.
 * =======================================================*/

// Tarifa por transporte/zona/pasajeros (simple o con campo de descuento)
app.get('/tarifa', async (req, res) => {
  const codigoTrans = (req.query.codigo_transporte || req.query.codigo || '').toString().trim();
  const transporte   = (req.query.transporte || '').toString().trim(); // legacy tipo textual
  const { zona, pasajeros, campo } = req.query;

  const have = codigoTrans || transporte;
  if (!have || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (codigo_transporte|transporte, zona, pasajeros)' });
  }

  try {
    const useCodigo = Boolean(codigoTrans);
    const colId = useCodigo ? 'codigo_transporte' : 'UPPER(tipo_transporte)';
    const valId = useCodigo ? codigoTrans : transporte.toUpperCase();

    const allowed = ['precio_descuento_13', 'precio_descuento_135', 'precio_descuento_15'];
    const wantsCampo = campo && allowed.includes(campo);

    const sql = wantsCampo
      ? `
        SELECT ${campo} AS precio
        FROM tarifas_transportacion
        WHERE ${colId} = $1 AND zona_id = $2 AND rango_pasajeros = $3
      `
      : `
        SELECT precio_original, precio_descuento_13 AS precio_descuento
        FROM tarifas_transportacion
        WHERE ${colId} = $1 AND zona_id = $2 AND rango_pasajeros = $3
      `;

    const params = [valId, zona, pasajeros];
    const result = await pool.query(sql, params);

    if (!result.rows.length) return res.status(404).json({ error: 'No se encontro tarifa para esos parametros' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error obteniendo tarifa:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// Tarifa shuttle (permite codigo_transporte o fuerza tipo SHUTTLE)
app.get('/tarifa-shuttle', async (req, res) => {
  const { zona, pasajeros } = req.query;
  const codigoTrans = (req.query.codigo_transporte || req.query.codigo || '').toString().trim();

  if (!zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (zona, pasajeros)' });
  }

  try {
    const useCodigo = Boolean(codigoTrans);
    const where = useCodigo ? 'codigo_transporte = $1' : "UPPER(tipo_transporte) = 'SHUTTLE'";
    const params = useCodigo ? [codigoTrans, zona, pasajeros] : [zona, pasajeros];

    const sql = `
      SELECT precio_original, precio_descuento_13, precio_descuento_15
      FROM tarifas_transportacion
      WHERE ${where}
        AND zona_id = $${useCodigo ? 2 : 1}
        AND rango_pasajeros = $${useCodigo ? 3 : 2}
    `;
    const result = await pool.query(sql, params);

    if (!result.rows.length) return res.status(404).json({ error: 'No se encontro tarifa para esos parametros' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en /tarifa-shuttle:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// Verificar código de descuento (simple)
app.get('/api/verificar-codigo', async (req, res) => {
  const cupon = (req.query.codigo || '').toString().trim(); // el CUPÓN
  const codigoTrans = (req.query.codigo_transporte || req.query.codigoTransporte || '').toString().trim();
  const transporte   = (req.query.transporte || '').toString().trim(); // legacy
  const { zona }     = req.query;

  if (!cupon || !(codigoTrans || transporte) || !zona) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (codigo, codigo_transporte|transporte, zona)' });
    }

  try {
    // Si viene codigo_transporte, mapea a tipo_transporte para la tabla de cupones (si esa tabla sigue en tipo textual)
    let tipoParaCupon = (transporte || '').toUpperCase();
    if (codigoTrans) {
      const q = await pool.query(
        `SELECT tipo_transporte FROM tarifas_transportacion WHERE codigo_transporte = $1 LIMIT 1`,
        [codigoTrans]
      );
      if (q.rows.length) tipoParaCupon = (q.rows[0].tipo_transporte || '').toUpperCase();
    }

    const descQ = `
      SELECT descuento_aplicado
      FROM codigos_descuentos
      WHERE TRIM(UPPER(codigo)) = TRIM(UPPER($1))
        AND (UPPER(tipo_transporte) = UPPER($2) OR UPPER(tipo_transporte) = 'ANY')
        AND ($3 = ANY(zonas) OR 'GLOBAL' = ANY(zonas))
        AND activo = true
      LIMIT 1
    `;
    const descR = await pool.query(descQ, [cupon, tipoParaCupon, zona]);

    if (!descR.rows.length) return res.json({ valido: false });

    const porcentaje = parseFloat(descR.rows[0].descuento_aplicado);
    let campo = '';
    if (porcentaje === 13) campo = 'precio_descuento_13';
    else if (porcentaje === 13.5) campo = 'precio_descuento_135';
    else if (porcentaje === 15) campo = 'precio_descuento_15';
    else return res.status(400).json({ error: 'Descuento no soportado' });

    res.json({ valido: true, descuento_aplicado: porcentaje, campo });
  } catch (err) {
    console.error('Error validando codigo de descuento:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// Verificar código de descuento (redondo)
app.get('/api/verificar-codigo-redondo', async (req, res) => {
  const cupon = (req.query.codigo || '').toString().trim(); // CUPÓN
  const codigoTrans = (req.query.codigo_transporte || req.query.codigoTransporte || '').toString().trim();
  const transporte   = (req.query.transporte || '').toString().trim(); // legacy
  const { zona, pasajeros } = req.query;

  if (!cupon || !(codigoTrans || transporte) || !zona || !pasajeros) {
    return res.status(400).json({ valido: false, mensaje: 'Faltan parametros requeridos' });
  }

  try {
    // 1) validar el cupón (por tipo textual, con fallback ANY)
    let tipoParaCupon = (transporte || '').toUpperCase();
    if (codigoTrans) {
      const q = await pool.query(
        `SELECT tipo_transporte FROM tarifas_transportacion WHERE codigo_transporte = $1 LIMIT 1`,
        [codigoTrans]
      );
      if (q.rows.length) tipoParaCupon = (q.rows[0].tipo_transporte || '').toUpperCase();
    }

    const descQ = `
      SELECT descuento_aplicado 
      FROM codigos_descuentos
      WHERE TRIM(UPPER(codigo)) = TRIM(UPPER($1)) 
        AND (UPPER(tipo_transporte) = UPPER($2) OR UPPER(tipo_transporte) = 'ANY')
        AND ($3 = ANY(zonas) OR 'GLOBAL' = ANY(zonas))
        AND activo = true
      LIMIT 1
    `;
    const descR = await pool.query(descQ, [cupon, tipoParaCupon, zona]);
    if (!descR.rows.length) return res.json({ valido: false });

    const descuento = parseFloat(descR.rows[0].descuento_aplicado);
    let campo = '';
    if (descuento === 13) campo = 'precio_descuento_13';
    else if (descuento === 13.5) campo = 'precio_descuento_135';
    else if (descuento === 15) campo = 'precio_descuento_15';
    else return res.status(400).json({ valido: false, mensaje: 'Descuento no soportado' });

    // 2) precio con el campo correcto (si llega codigo_transporte → filtra por codigo_transporte)
    const useCodigo = Boolean(codigoTrans);
    const filtroCol = useCodigo ? 'codigo_transporte' : 'UPPER(tipo_transporte)';
    const valorCol  = useCodigo ? codigoTrans : (transporte || '').toUpperCase();

    const tarifaQ = `
      SELECT ${campo} AS precio_descuento 
      FROM tarifas_transportacion 
      WHERE ${filtroCol} = $1 AND zona_id = $2 AND TRIM(rango_pasajeros) = TRIM($3)
    `;
    const tarifaR = await pool.query(tarifaQ, [valorCol, zona, String(pasajeros).trim()]);
    if (!tarifaR.rows.length) return res.json({ valido: false });

    const precioDescuento = parseFloat(tarifaR.rows[0].precio_descuento);
    res.json({ valido: true, precio_descuento: precioDescuento.toFixed(2), descuento });
  } catch (error) {
    console.error("Error en /api/verificar-codigo-redondo:", error.message);
    res.status(500).json({ valido: false, mensaje: 'Error interno del servidor' });
  }
});

// Catálogos
app.get('/obtener-hoteles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT nombre_hotel AS nombre 
      FROM hoteles_zona 
      ORDER BY nombre_hotel ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener hoteles:', err.message);
    res.status(500).json({ error: 'Error al consultar hoteles', detalle: err.message });
  }
});

app.get('/obtener-aerolineas', async (req, res) => {
  try {
    const result = await pool.query('SELECT nombre FROM aerolineas ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener aerolineas:', err.message);
    res.status(500).json({ error: 'Error al consultar aerolineas', detalle: err.message });
  }
});

// Opciones de pasajeros
app.get('/opciones-pasajeros', async (req, res) => {
  // nuevo: codigo_transporte; legacy: tipo/transporte
  const codigoTrans = (req.query.codigo_transporte || req.query.codigo || '').toString().trim();
  const tipo = (req.query.tipo || req.query.transporte || '').toString().trim();

  const have = codigoTrans || tipo;
  if (!have) return res.status(400).json({ error: 'Falta el parametro codigo_transporte o tipo' });

  try {
    const useCodigo = Boolean(codigoTrans);
    const sql = useCodigo
      ? `
        SELECT DISTINCT rango_pasajeros
        FROM tarifas_transportacion
        WHERE codigo_transporte = $1
        ORDER BY rango_pasajeros
      `
      : `
        SELECT DISTINCT rango_pasajeros
        FROM tarifas_transportacion
        WHERE UPPER(tipo_transporte) = UPPER($1)
        ORDER BY rango_pasajeros
      `;
    const val = useCodigo ? codigoTrans : tipo.toUpperCase();
    const { rows } = await pool.query(sql, [val]);
    res.json(rows.map(r => r.rango_pasajeros));
  } catch (err) {
    console.error('Error al obtener opciones de pasajeros:', err.message);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

app.get('/hoteles-excluidos', async (req, res) => {
  try {
    const result = await pool.query('SELECT nombre FROM hoteles_nodescuento');
    const nombres = result.rows.map(r => r.nombre.toUpperCase());
    res.json(nombres);
  } catch (err) {
    console.error('Error al obtener hoteles sin descuento:', err.message);
    res.status(500).json({ error: 'Error en la base de datos', detalle: err.message });
  }
});

// Tarifa redondo (con campo específico)
app.get('/tarifa-redondo', async (req, res) => {
  const codigoTrans = (req.query.codigo_transporte || req.query.codigo || '').toString().trim();
  const transporte   = (req.query.transporte || '').toString().trim();
  const { zona, pasajeros, campo } = req.query;

  const have = codigoTrans || transporte;
  if (!have || !zona || !pasajeros || !campo) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (codigo_transporte|transporte, zona, pasajeros, campo)' });
  }

  try {
    const useCodigo = Boolean(codigoTrans);
    const colId = useCodigo ? 'codigo_transporte' : 'UPPER(tipo_transporte)';
    const valId = useCodigo ? codigoTrans : transporte.toUpperCase();

    const sql = `
      SELECT ${campo} AS precio
      FROM tarifas_transportacion
      WHERE ${colId} = $1 AND zona_id = $2 AND rango_pasajeros = $3
    `;
    const result = await pool.query(sql, [valId, zona, pasajeros]);

    if (!result.rows.length) return res.status(404).json({ error: 'No se encontro tarifa para esos parametros' });
    res.json({ precio: result.rows[0].precio });
  } catch (err) {
    console.error('Error en /tarifa-redondo:', err.message);
    res.status(500).json({ error: 'Error en la base de datos', detalle: err.message });
  }
});

// Auth y endpoints de operaciones
app.post('/api/login-usuario', loginUsuario);
app.get('/api/obtener-reserva-transporte', obtenerReservaTransporte);
app.post('/api/actualizar-datos-transporte', actualizarDatosTransporte);
app.post('/api/guardar-firma', guardarFirma);
app.use('/firmas', express.static(path.join(process.cwd(), 'firmas')));
app.get('/api/obtener-choferes', obtenerChoferes);
app.get('/api/obtener-servicios-chofer', obtenerServiciosAsignadosEstatus);
app.get('/api/obtener-servicios-representante', obtenerServiciosRepresentante);
app.get('/api/listar-representantes', listarRepresentantes);
app.get('/api/llegadas', consultarLlegadas);
app.get('/api/salidas', consultarSalidas);
app.use('/api', exportarExcelRouter);
app.get('/api/exportarExcelLlegadas', exportarExcelLlegada);
app.get('/api/exportarExcelSalidas', exportarExcelSalidas);
app.get('/api/buscarreservas', buscarReservas);
app.get('/api/exportarExcelReservas', exportarExcelReservas);
app.get('/api/reportes-ingresos', reportesIngresos);
app.get('/api/ventas-comparativa', ventasComparativa);
app.get('/api/reportes-ingresos-excel', exportarReportesIngresosExcel);
app.get('/api/ventas-comparativa-csv', exportarCsvVentasComparativa);

// ⬇️ Registra rutas de cache/descarga PNG
registerCanvasCache(app);

// ---------- Arranque ----------
app.listen(PORT, () => {
  console.log(`API de transportacion corriendo en el puerto ${PORT}`);
});
