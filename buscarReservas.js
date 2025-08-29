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

// GET /api/buscarreservas
// Soporta ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&servicio=transporte|actividades|ambos
export default async function buscarReservas(req, res) {
  try {
    const hoy = hoyYMD();
    let { desde, hasta, servicio } = req.query;

    desde = isYMD(desde) ? desde : hoy;
    hasta = isYMD(hasta) ? hasta : hoy;

    // Default robusto: transporte
    const svc = (servicio || "transporte").toString().trim().toLowerCase();

    // === ACTIVIDADES ===
    if (svc === "actividades" || svc === "actividad") {
      const sqlA = `
        SELECT
          folio,
          nombre_tour,                         -- Actividad
          proveedor,                            -- Operador
          nombre_cliente,
          fecha::date AS fecha,                 -- Fecha de reservación
          COALESCE(cantidad_adulto, 0) AS cantidad_adulto,
          COALESCE(cantidad_nino,   0) AS cantidad_nino
        FROM reservaciones
        WHERE fecha::date BETWEEN $1 AND $2
          AND LOWER(tipo_servicio) = 'actividad'
        ORDER BY fecha DESC, folio DESC
      `;
      const { rows } = await pool.query(sqlA, [desde, hasta]);
      return res.json({ ok: true, reservas: rows });
    }

    // === TRANSPORTE (igual que siempre) ===
    if (svc === "transporte") {
      const sqlT = `
        SELECT
          folio,
          tipo_viaje,
          nombre_cliente,
          fecha_llegada,
          fecha_salida,
          cantidad_pasajeros
        FROM reservaciones
        WHERE fecha::date BETWEEN $1 AND $2
          AND (
            tipo_servicio IS NULL
            OR tipo_servicio = ''
            OR LOWER(tipo_servicio) = 'transporte'
          )
        ORDER BY fecha DESC, folio DESC
      `;
      const { rows } = await pool.query(sqlT, [desde, hasta]);
      return res.json({ ok: true, reservas: rows });
    }

    // === AMBOS (opcional; el front hoy hace 2 llamadas separadas) ===
    if (svc === "ambos") {
      const sqlT = `
        SELECT folio, tipo_viaje, nombre_cliente, fecha_llegada, fecha_salida, cantidad_pasajeros
        FROM reservaciones
        WHERE fecha::date BETWEEN $1 AND $2
          AND (
            tipo_servicio IS NULL
            OR tipo_servicio = ''
            OR LOWER(tipo_servicio) = 'transporte'
          )
        ORDER BY fecha DESC, folio DESC
      `;
      const sqlA = `
        SELECT
          folio, nombre_tour, proveedor, nombre_cliente, fecha::date AS fecha,
          COALESCE(cantidad_adulto,0) AS cantidad_adulto,
          COALESCE(cantidad_nino,0)   AS cantidad_nino
        FROM reservaciones
        WHERE fecha::date BETWEEN $1 AND $2
          AND LOWER(tipo_servicio) = 'actividad'
        ORDER BY fecha DESC, folio DESC
      `;
      const [rt, ra] = await Promise.all([
        pool.query(sqlT, [desde, hasta]),
        pool.query(sqlA, [desde, hasta]),
      ]);
      return res.json({
        ok: true,
        reservas_transporte: rt.rows,
        reservas_actividades: ra.rows,
      });
    }

    // Si llega algo raro en 'servicio'
    return res.json({ ok: true, reservas: [] });
  } catch (err) {
    console.error("❌ /api/buscarreservas:", err);
    res.status(500).json({ ok: false, msg: "Error al consultar reservaciones" });
  }
}