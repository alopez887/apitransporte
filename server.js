// server.js actualizado y corregido
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

// ?? Obtener zona por hotel
app.get('/zona-hotel', async (req, res) => {
  const { hotel } = req.query;
  if (!hotel) return res.status(400).json({ error: 'El par芍metro "hotel" es requerido' });

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

// ?? Obtener tarifa general
app.get('/tarifa', async (req, res) => {
  const { transporte, zona, pasajeros, campo } = req.query;

  if (!transporte || !zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan par芍metros requeridos (transporte, zona, pasajeros)' });
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
      res.status(404).json({ error: 'No se encontr車 tarifa para esos par芍metros' });
    }
  } catch (err) {
    console.error('Error obteniendo tarifa:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// ?? Tarifa exclusiva para shuttle
app.get('/tarifa-shuttle', async (req, res) => {
  const { zona, pasajeros } = req.query;

  if (!zona || !pasajeros) {
    return res.status(400).json({ error: 'Faltan par芍metros requeridos (zona, pasajeros)' });
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
      res.status(404).json({ error: 'No se encontr車 tarifa para esos par芍metros' });
    }
  } catch (err) {
    console.error('Error en /tarifa-shuttle:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// ?? Validar c車digo de descuento general
app.get('/validar-descuento', async (req, res) => {
  const { codigo, transporte, zona } = req.query;
  if (!codigo || !transporte || !zona) {
    return res.status(400).json({ error: 'Faltan par芍metros requeridos (codigo, transporte, zona)' });
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
    console.error('Error validando c車digo de descuento:', err);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// ?? Validar c車digo redondo
app.get('/validar-descuento-redondo', async (req, res) => {
  const { codigo, transporte, zona, pasajeros } = req.query;

  console.log("?? Par芍metros recibidos:", { codigo, transporte, zona, pasajeros });

  if (!codigo || !transporte || !zona || !pasajeros) {
    return res.status(400).json({ valido: false, mensaje: 'Faltan par芍metros requeridos' });
  }

  try {
    const descQuery = `
      SELECT descuento_aplicado 
      FROM codigos_descuento 
      WHERE TRIM(UPPER(codigo)) = TRIM(UPPER($1)) 
        AND UPPER(tipo_transporte) = UPPER($2) 
        AND zona_id = $3
    `;
    const descResult = await pool.query(descQuery, [codigo, transporte, zona]);

    if (descResult.rows.length === 0) {
      console.log("? C車digo no v芍lido en codigos_descuento");
      return res.json({ valido: false });
    }

    const descuento = parseFloat(descResult.rows[0].descuento_aplicado);
    console.log("? Descuento encontrado:", descuento);

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
    const tarifaResult = await pool.query(tarifaQuery, [transporte, zona, pasajeros]);

    if (tarifaResult.rows.length === 0) {
      console.log("? No se encontr車 precio con descuento en tarifas_transportacion");
      return res.json({ valido: false });
    }

    const precioDescuento = parseFloat(tarifaResult.rows[0].precio_descuento);

    return res.json({
      valido: true,
      precio_descuento: precioDescuento.toFixed(2),
      descuento
    });

  } catch (error) {
    console.error("? Error en /validar-descuento-redondo:", error.message);
    return res.status(500).json({ valido: false, mensaje: 'Error interno del servidor' });
  }
});

// ?? Obtener hoteles
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

// ?? Aerol赤neas
app.get('/obtener-aerolineas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT nombre FROM aerolineas ORDER BY nombre ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener aerol赤neas:', err.message);
    res.status(500).json({ error: 'Error al consultar aerol赤neas', detalle: err.message });
  }
});

// ?? Opciones pasajeros
app.get('/opciones-pasajeros', async (req, res) => {
  const tipo = req.query.tipo;
  if (!tipo) return res.status(400).json({ error: 'Falta el par芍metro tipo' });

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

// ?? Hoteles sin descuento
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

// ?? Tarifa redondo con campo din芍mico
app.get('/tarifa-redondo', async (req, res) => {
  const { transporte, zona, pasajeros, campo } = req.query;

  if (!transporte || !zona || !pasajeros || !campo) {
    return res.status(400).json({ error: 'Faltan par芍metros requeridos (transporte, zona, pasajeros, campo)' });
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
      res.status(404).json({ error: 'No se encontr車 tarifa para esos par芍metros' });
    }
  } catch (err) {
    console.error('Error en /tarifa-redondo:', err.message);
    res.status(500).json({ error: 'Error en la base de datos', detalle: err.message });
  }
});

// ?? Iniciar servidor
app.listen(PORT, () => {
  console.log(`?? API de transportaci車n corriendo en el puerto ${PORT}`);
});