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

// 🔹 Obtener zona por hotel
app.get('/zona-hotel', async (req, res) => {
  const { hotel } = req.query;
  if (!hotel) return res.status(400).json({ error: 'El parámetro "hotel" es requerido' });

  try {
    const result = await pool.query('SELECT zona FROM hoteles_zona WHERE nombre_hotel = $1', [hotel]);
    if (result.rows.length > 0) {
      res.json({ zona: result.rows[0].zona });
    } else {
      res.status(404).json({ error: 'Hotel no encontrado' });
    }
  } catch (err) {
    console.error('Error consultando zona por hotel:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Obtener tarifa por transporte, zona y cantidad de pasajeros
app.get('/tarifa', async (req, res) => {
  const { transporte, zona, pasajeros } = req.query;
  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (transporte, zona, pasajeros)' });
  }

  try {
    const result = await pool.query(
      `SELECT precio_original, precio_descuento
       FROM tarifas_transportacion
       WHERE tipo_transporte = $1 AND zona = $2 AND rango_pasajeros = $3`,
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

// 🔹 Validar código de descuento
app.get('/validar-descuento', async (req, res) => {
  const { codigo, transporte, zona } = req.query;
  if (!codigo || !transporte || !zona) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (codigo, transporte, zona)' });
  }

  try {
    const result = await pool.query(
      `SELECT tipo_descuento
       FROM codigos_descuento
       WHERE codigo = $1 AND tipo_transporte = $2 AND zona = $3`,
      [codigo, transporte, zona]
    );

    if (result.rows.length > 0) {
      res.json({ valido: true, tipo_descuento: result.rows[0].tipo_descuento });
    } else {
      res.json({ valido: false });
    }
  } catch (err) {
    console.error('Error validando código de descuento:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Obtener lista de hoteles
app.get('/obtener-hoteles', async (req, res) => {
  try {
    console.log("🏨 Intentando cargar hoteles...");
    const result = await pool.query('SELECT DISTINCT nombre_hotel AS nombre FROM hoteles_zona ORDER BY nombre_hotel ASC');
    console.log("✅ Hoteles encontrados:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener hoteles:', err.message);
    res.status(500).json({ error: 'Error al consultar hoteles', detalle: err.message });
  }
});

// 🔹 Obtener lista de aerolíneas
app.get('/obtener-aerolineas', async (req, res) => {
  try {
    console.log("📡 Intentando acceder a tabla 'aerolineas'");
    const result = await pool.query('SELECT nombre FROM aerolineas ORDER BY nombre ASC');
    console.log("✅ Aerolíneas encontradas:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener aerolíneas:', err.message);
    res.status(500).json({ error: 'Error al consultar aerolíneas', detalle: err.message });
  }
});

// 🔹 Obtener opciones de pasajeros dinámicamente desde la base de datos
app.get('/opciones-pasajeros', async (req, res) => {
  const tipo = req.query.tipo;
  if (!tipo) return res.status(400).json({ error: 'Falta el parámetro tipo' });

  try {
    const result = await pool.query(
      `SELECT DISTINCT rango_pasajeros 
       FROM tarifas_transportacion 
       WHERE tipo_transporte ILIKE $1 
       ORDER BY rango_pasajeros`,
      [tipo]
    );
    const opciones = result.rows.map(r => r.rango_pasajeros);
    res.json(opciones);
  } catch (err) {
    console.error('❌ Error al obtener opciones de pasajeros:', err.message);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Ruta POST para calcular precio final
app.post('/get-precio-transportacion', getPrecioTransporte);

// 🔹 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚗 API de transportación corriendo en el puerto ${PORT}`);
});