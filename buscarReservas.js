// buscarReservas.js
import pool from "./conexion.js"; // tu pool existente

// Valida YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Utilidad para "hoy" (YYYY-MM-DD)
const hoyYMD = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Filtro por servicio (igual criterio que en otros endpoints)
function filtroServicioSQL(servicio) {
  const col = "COALESCE(TRIM(tipo_servicio), '')";
  if (servicio === "actividades") return `AND ${col} ILIKE 'Actividad%'`;
  if (servicio === "transporte")  return `AND (${col} = '' OR ${col} NOT ILIKE 'Actividad%')`;
  return ""; // ambos
}

// GET /api/buscarreservas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&servicio=transporte|actividades|ambos
export default async function buscarReservas(req, res) {
  try {
    const hoy = hoyYMD();
    let { desde, hasta, servicio = "transporte" } = req.query;

    desde = isYMD(desde) ? desde : hoy;
    hasta = isYMD(hasta) ? hasta : hoy;
    servicio = String(servicio || "transporte").toLowerCase();

    const filtro = filtroServicioSQL(servicio);

    const sql = `
      SELECT
        folio,
        -- servicio
        tipo_servicio,                -- 'Transporte' o 'Actividad'

        -- transporte
        tipo_viaje,
        tipo_transporte,
        fecha_llegada,
        fecha_salida,
        cantidad_pasajeros,
        hotel_llegada,
        hotel_salida,
        zona,

        -- actividades (💡 NUEVO)
        nombre_tour,                  -- <- para columna "Actividad"
        proveedor,                    -- <- para columna "Operador"
        cantidad_adulto,              -- <- para Pax
        cantidad_nino,                -- <- para Pax
        tipo_actividad,               -- (compat)
        operador_actividad,           -- (compat)

        -- comunes
        nombre_cliente,
        fecha                          -- fecha de registro (Usada como fecha en Actividades)
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