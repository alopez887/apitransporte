// reportesIngresos.js
import pool from "./conexion.js";

// Valida YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Hoy en formato YYYY-MM-DD
const hoyYMD = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// GET /api/reportes-ingresos?tipo=xxx&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export default async function reportesIngresos(req, res) {
  try {
    let { tipo, desde, hasta } = req.query;

    if (!tipo) {
      return res.status(400).json({ ok: false, msg: "Falta parámetro 'tipo'" });
    }

    const hoy = hoyYMD();
    desde = isYMD(desde) ? desde : hoy;
    hasta = isYMD(hasta) ? hasta : hoy;

    let sql = "";
    let params = [desde, hasta];

    switch (tipo) {
      case "por-fecha":
        sql = `
          SELECT fecha::date AS etiqueta, SUM(precio_final) AS total
          FROM reservaciones
          WHERE fecha::date BETWEEN $1 AND $2
          GROUP BY fecha::date
          ORDER BY fecha::date;
        `;
        break;

      case "por-tipo-viaje":
        sql = `
          SELECT tipo_viaje AS etiqueta, SUM(precio_final) AS total
          FROM reservaciones
          WHERE fecha::date BETWEEN $1 AND $2
          GROUP BY tipo_viaje
          ORDER BY total DESC;
        `;
        break;

      case "por-tipo-transporte":
        sql = `
          SELECT tipo_transporte AS etiqueta, SUM(precio_final) AS total
          FROM reservaciones
          WHERE fecha::date BETWEEN $1 AND $2
          GROUP BY tipo_transporte
          ORDER BY total DESC;
        `;
        break;

      case "por-zona-hotel":
        sql = `
          SELECT COALESCE(zona, hotel_llegada, hotel_salida) AS etiqueta, SUM(precio_final) AS total
          FROM reservaciones
          WHERE fecha::date BETWEEN $1 AND $2
          GROUP BY etiqueta
          ORDER BY total DESC;
        `;
        break;

      case "con-sin-descuento":
        sql = `
          SELECT 
            CASE WHEN descuento_aplicado > 0 THEN 'Con descuento' ELSE 'Sin descuento' END AS etiqueta,
            SUM(precio_final) AS total
          FROM reservaciones
          WHERE fecha::date BETWEEN $1 AND $2
          GROUP BY etiqueta
          ORDER BY etiqueta;
        `;
        break;

      default:
        return res.status(400).json({ ok: false, msg: "Tipo de reporte no válido" });
    }

    const { rows } = await pool.query(sql, params);
    res.json({ ok: true, datos: rows });

  } catch (err) {
    console.error("❌ /api/reportes-ingresos:", err);
    res.status(500).json({ ok: false, msg: "Error al generar reporte" });
  }
}