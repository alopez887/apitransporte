// buscarReservas.js
import pool from "./conexion.js"; // tu pool existente

// Valida YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Utilidad para "hoy" en zona del servidor (formato YYYY-MM-DD)
const hoyYMD = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// GET /api/buscarreservas
export default async function buscarReservas(req, res) {
  try {
    // Si no vienen, usar HOY
    const hoy = hoyYMD();
    let { desde, hasta } = req.query;

    desde = isYMD(desde) ? desde : hoy;
    hasta = isYMD(hasta) ? hasta : hoy;

    // ⚠️ Filtramos por la columna `fecha` (NO por fecha_llegada/fecha_salida)
    const sql = `
      SELECT
        folio,
        tipo_viaje,
        nombre_cliente,
        fecha,            -- por si quieres mostrarla/llevar trazabilidad
        fecha_llegada,
        fecha_salida,
        cantidad_pasajeros
      FROM reservaciones
      WHERE fecha::date BETWEEN $1 AND $2
      ORDER BY fecha DESC, folio DESC
    `;

    const { rows } = await pool.query(sql, [desde, hasta]);
    res.json({ ok: true, reservas: rows });
  } catch (err) {
    console.error("❌ /api/buscarreservas:", err);
    res.status(500).json({ ok: false, msg: "Error al consultar reservaciones" });
  }
}