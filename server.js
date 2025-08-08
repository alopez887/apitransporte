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
import loginUsuario from './loginUsuario.js'; // ✅ CAMBIADO: Login general (operadores y representantes)
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

dotenv.config();
const { Pool } = pkg;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT;

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

app.post('/reservar-transporte', guardarTransporte);
app.post('/guardarroundtrip', guardarRoundtrip);

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

app.get('/tarifa', async (req, res) => {
  const { transporte, zona, pasajeros, campo } = req.query;
  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (transporte, zona, pasajeros)' });
  }

  try {
    let query;
    let params = [transporte, zona, pasajeros];

    if (campo && ['precio_descuento_13', 'precio_descuento_135', 'precio_descuento_15'].includes(campo)) {
      query = `
        SELECT ${campo} AS precio
        FROM tarifas_transportacion
        WHERE UPPER(tipo_transporte) = UPPER($1)
        AND zona_id = $2
        AND rango_pasajeros = $3
      `;
    } else {
      query = `
        SELECT precio_original, precio_descuento_13 AS precio_descuento
        FROM tarifas_transportacion
        WHERE UPPER(tipo_transporte) = UPPER($1)
        AND zona_id = $2
        AND rango_pasajeros = $3
      `;
    }

    const result = await pool.query(query, params);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No se encontro tarifa para esos parametros' });
    }
  } catch (err) {
    console.error('Error obteniendo tarifa:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

app.get('/tarifa-shuttle', async (req, res) => {
  const { zona, pasajeros } = req.query;
  if (!zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (zona, pasajeros)' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        precio_original,
        precio_descuento_13,
        precio_descuento_15
      FROM tarifas_transportacion
      WHERE UPPER(tipo_transporte) = 'SHUTTLE'
      AND zona_id = $1
      AND rango_pasajeros = $2
    `, [zona, pasajeros]);

    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No se encontro tarifa para esos parametros' });
    }
  } catch (err) {
    console.error('Error en /tarifa-shuttle:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

app.get('/api/verificar-codigo', async (req, res) => {
  const { codigo, transporte, zona } = req.query;
  if (!codigo || !transporte || !zona) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (codigo, transporte, zona)' });
  }

  try {
    const query = `
      SELECT descuento_aplicado
      FROM codigos_descuentos
      WHERE TRIM(UPPER(codigo)) = TRIM(UPPER($1))
        AND UPPER(tipo_transporte) = UPPER($2)
        AND ($3 = ANY(zonas) OR 'GLOBAL' = ANY(zonas))
        AND activo = true
      LIMIT 1
    `;
    const values = [codigo, transporte, zona];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      const porcentaje = parseFloat(result.rows[0].descuento_aplicado);
      let campo = '';
      if (porcentaje === 13) campo = 'precio_descuento_13';
      else if (porcentaje === 13.5) campo = 'precio_descuento_135';
      else if (porcentaje === 15) campo = 'precio_descuento_15';
      else return res.status(400).json({ error: 'Descuento no soportado' });

      res.json({ valido: true, descuento_aplicado: porcentaje, campo });
    } else {
      res.json({ valido: false });
    }
  } catch (err) {
    console.error('Error validando codigo de descuento:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

app.get('/api/verificar-codigo-redondo', async (req, res) => {
  const { codigo, transporte, zona, pasajeros } = req.query;
  if (!codigo || !transporte || !zona || !pasajeros) {
    return res.status(400).json({ valido: false, mensaje: 'Faltan parametros requeridos' });
  }

  try {
    const descQuery = `
      SELECT descuento_aplicado 
      FROM codigos_descuentos
      WHERE TRIM(UPPER(codigo)) = TRIM(UPPER($1)) 
        AND UPPER(tipo_transporte) = UPPER($2) 
        AND ($3 = ANY(zonas) OR 'GLOBAL' = ANY(zonas))
        AND activo = true
      LIMIT 1
    `;
    const descResult = await pool.query(descQuery, [codigo, transporte, zona]);

    if (descResult.rows.length === 0) {
      return res.json({ valido: false });
    }

    const descuento = parseFloat(descResult.rows[0].descuento_aplicado);
    let campo = '';
    if (descuento === 13) campo = 'precio_descuento_13';
    else if (descuento === 13.5) campo = 'precio_descuento_135';
    else if (descuento === 15) campo = 'precio_descuento_15';
    else return res.status(400).json({ valido: false, mensaje: 'Descuento no soportado' });

    const tarifaQuery = `
      SELECT ${campo} AS precio_descuento 
      FROM tarifas_transportacion 
      WHERE TRIM(UPPER(tipo_transporte)) = TRIM(UPPER($1)) 
        AND zona_id = $2 
        AND TRIM(rango_pasajeros) = TRIM($3)
    `;
    const tarifaResult = await pool.query(tarifaQuery, [transporte, zona, pasajeros.trim()]);

    if (tarifaResult.rows.length === 0) {
      return res.json({ valido: false });
    }

    const precioDescuento = parseFloat(tarifaResult.rows[0].precio_descuento);
    res.json({ valido: true, precio_descuento: precioDescuento.toFixed(2), descuento });
  } catch (error) {
    console.error("Error en /api/verificar-codigo-redondo:", error.message);
    res.status(500).json({ valido: false, mensaje: 'Error interno del servidor' });
  }
});

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

app.get('/opciones-pasajeros', async (req, res) => {
  const tipo = req.query.tipo;
  if (!tipo) return res.status(400).json({ error: 'Falta el parametro tipo' });

  try {
    const result = await pool.query(`
      SELECT DISTINCT rango_pasajeros
      FROM tarifas_transportacion
      WHERE UPPER(tipo_transporte) = UPPER($1)
      ORDER BY rango_pasajeros
    `, [tipo]);
    res.json(result.rows.map(r => r.rango_pasajeros));
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

app.get('/tarifa-redondo', async (req, res) => {
  const { transporte, zona, pasajeros, campo } = req.query;
  if (!transporte || !zona || !pasajeros || !campo) {
    return res.status(400).json({ error: 'Faltan parametros requeridos (transporte, zona, pasajeros, campo)' });
  }

  try {
    const query = `
      SELECT ${campo} AS precio
      FROM tarifas_transportacion
      WHERE UPPER(tipo_transporte) = UPPER($1)
      AND zona_id = $2
      AND rango_pasajeros = $3
    `;
    const result = await pool.query(query, [transporte, zona, pasajeros]);

    if (result.rows.length > 0) {
      res.json({ precio: result.rows[0].precio });
    } else {
      res.status(404).json({ error: 'No se encontro tarifa para esos parametros' });
    }
  } catch (err) {
    console.error('Error en /tarifa-redondo:', err.message);
    res.status(500).json({ error: 'Error en la base de datos', detalle: err.message });
  }
});

app.post('/api/login-usuario', loginUsuario); // ✅ Aquí
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

app.listen(PORT, () => {
  console.log(`API de transportacion corriendo en el puerto ${PORT}`);
});