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

// Filtro por servicio (mismo criterio que usamos en otros endpoints)
// - actividades:    tipo_servicio ILIKE 'Actividad%'
// - transporte:     todo lo que NO sea Actividad (incluye nulos/vacío)
// - ambos:          sin filtro
function filtroServicioSQL(servicio) {
  const col = "COALESCE(TRIM(tipo_servicio), '')";
  if (servicio === "actividades") return `AND ${col} ILIKE 'Actividad%'`;
  if (servicio === "transporte")  return `AND (${col} = '' OR ${col} NOT ILIKE 'Actividad%')`;
  return ""; // ambos
}

// GET /api/buscarreservas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&servicio=transporte|actividades|ambos
export default async function buscarReservas(req, res) {
  try {
    // Si no vienen fechas, usar HOY
    const hoy = hoyYMD();
    let { desde, hasta, servicio = "transporte" } = req.query;

    desde = isYMD(desde) ? desde : hoy;
    hasta = isYMD(hasta) ? hasta : hoy;
    servicio = String(servicio || "transporte").toLowerCase();

    // ⚠️ Filtramos por la columna `fecha` (fecha de registro)
    const filtro = filtroServicioSQL(servicio);

    const sql = `
      SELECT
        folio,
        tipo_servicio,     -- para distinguir Transporte vs Actividad en el front
        tipo_viaje,
        nombre_cliente,
        fecha,             -- fecha de registro
        fecha_llegada,
        fecha_salida,
        cantidad_pasajeros
      FROM reservaciones
      WHERE fecha::date BETWEEN $1 AND $2
        ${filtro}
      ORDER BY fecha DESC, folio DESC
    `;

    const { rows } = await pool.query(sql, [desde, hasta]);
    res.json({ ok: true, reservas: rows });
  } catch (err) {
    console.error("❌ /api/buscarreservas:", err);
    res.status(500).json({ ok: false, msg: "Error al consultar reservaciones" });
  }
}