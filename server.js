import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import dotenv from 'dotenv';
import getPrecioTransporte from './getPrecioTransporte.js';

dotenv.config();

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }
});

// 🔹 Asignar pool a app.locals para que esté disponible en otros archivos
app.locals.pool = pool;

// 🔹 Obtener zona por hotel
app.get('/zona-hotel', async (req, res) => {
  const { hotel } = req.query;
  if (!hotel) return res.status(400).json({ error: 'El parámetro "hotel" es requerido' });

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

// 🔹 Obtener tarifa
app.get('/tarifa', async (req, res) => {
  const { transporte, zona, pasajeros } = req.query;
  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (transporte, zona, pasajeros)' });
  }

  try {
    const result = await pool.query(
      `SELECT precio_original, precio_descuento_13 AS precio_descuento
       FROM tarifas_transportacion
       WHERE UPPER(tipo_transporte) = UPPER($1) AND zona_id = $2 AND rango_pasajeros = $3`,
      [transporte, zona, pasajeros]
    );
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No se encontró tarifa para esos parámetros' });
    }
  } catch (err) {
    console.error('Error obteniendo tarifa:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Validar código de descuento (ACTUALIZADO)
app.get('/validar-descuento', async (req, res) => {
  const { codigo, transporte, zona } = req.query;
  if (!codigo || !transporte || !zona) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (codigo, transporte, zona)' });
  }

  try {
    const result = await pool.query(
      `SELECT tipo_descuento, descuento_aplicado
       FROM codigos_descuento
       WHERE codigo = $1 AND UPPER(tipo_transporte) = UPPER($2) AND zona = $3`,
      [codigo, transporte, zona]
    );
    if (result.rows.length > 0) {
      const { tipo_descuento, descuento_aplicado } = result.rows[0];
      res.json({
        valido: true,
        tipo_descuento,
        descuento_aplicado: parseFloat(descuento_aplicado)
      });
    } else {
      res.json({ valido: false });
    }
  } catch (err) {
    console.error('Error validando código de descuento:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Obtener hoteles
app.get('/obtener-hoteles', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT nombre_hotel AS nombre FROM hoteles_zona ORDER BY nombre_hotel ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener hoteles:', err.message);
    res.status(500).json({ error: 'Error al consultar hoteles', detalle: err.message });
  }
});

// 🔹 Obtener aerolíneas
app.get('/obtener-aerolineas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT nombre FROM aerolineas ORDER BY nombre ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener aerolíneas:', err.message);
    res.status(500).json({ error: 'Error al consultar aerolíneas', detalle: err.message });
  }
});

// 🔹 Obtener opciones de pasajeros (por tipo exacto)
app.get('/opciones-pasajeros', async (req, res) => {
  const tipo = req.query.tipo;
  if (!tipo) return res.status(400).json({ error: 'Falta el parámetro tipo' });

  try {
    const result = await pool.query(
      `SELECT DISTINCT rango_pasajeros
       FROM tarifas_transportacion
       WHERE UPPER(tipo_transporte) = UPPER($1)
       ORDER BY rango_pasajeros`,
      [tipo]
    );
    const opciones = result.rows.map(r => r.rango_pasajeros);
    res.json(opciones);
  } catch (err) {
    console.error('Error al obtener opciones de pasajeros:', err.message);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Ruta POST para calcular precio final
app.post('/get-precio-transportacion', getPrecioTransporte);

// 🔹 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚗 API de transportación corriendo en el puerto ${PORT}`);
});