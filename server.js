import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import dotenv from 'dotenv';

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

// 🔹 Obtener tarifa (rutas generales)
app.get('/tarifa', async (req, res) => {
  const { transporte, zona, pasajeros, campo } = req.query;

  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (transporte, zona, pasajeros)' });
  }

  try {
    let query;
    let params = [transporte, zona, pasajeros];

    if (campo && (campo === 'precio_descuento_13' || campo === 'precio_descuento_15')) {
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
      res.status(404).json({ error: 'No se encontró tarifa para esos parámetros' });
    }
  } catch (err) {
    console.error('Error obteniendo tarifa:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Ruta para shuttle
app.get('/tarifa-shuttle', async (req, res) => {
  const { zona, pasajeros } = req.query;

  if (!zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (zona, pasajeros)' });
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
      res.status(404).json({ error: 'No se encontró tarifa para esos parámetros' });
    }
  } catch (err) {
    console.error('Error en /tarifa-shuttle:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Validar código de descuento (CORREGIDO: RESPETA PRECIO EN FORMATO esperado)
app.get('/validar-descuento', async (req, res) => {
  const { codigo, transporte, zona, pasajeros } = req.query;

  if (!codigo || !transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (codigo, transporte, zona, pasajeros)' });
  }

  try {
    const result = await pool.query(
      `SELECT descuento_aplicado
       FROM codigos_descuento
       WHERE TRIM(UPPER(codigo)) = TRIM(UPPER($1)) 
       AND UPPER(tipo_transporte) = UPPER($2) 
       AND zona_id = $3`,
      [codigo, transporte, zona]
    );

    if (result.rows.length === 0) {
      return res.json({ valido: false });
    }

    const descuento = result.rows[0].descuento_aplicado;
    const campo = descuento === 13 ? 'precio_descuento_13' :
                  descuento === 15 ? 'precio_descuento_15' : null;

    if (!campo) {
      return res.json({ valido: false });
    }

    const tarifa = await pool.query(
      `SELECT ${campo} AS precio_descuento
       FROM tarifas_transportacion
       WHERE UPPER(tipo_transporte) = UPPER($1)
       AND zona_id = $2
       AND rango_pasajeros = $3`,
      [transporte, zona, pasajeros]
    );

    if (tarifa.rows.length > 0) {
      return res.json({
        valido: true,
        descuento_aplicado: descuento,
        precio_descuento: tarifa.rows[0].precio_descuento
      });
    } else {
      return res.json({ valido: false });
    }

  } catch (err) {
    console.error('Error validando código de descuento:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// 🔹 Aerolíneas
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

// 🔹 Opciones de pasajeros
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

// 🔹 Hoteles sin descuento
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

// 🔹 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚗 API de transportación corriendo en el puerto ${PORT}`);
});