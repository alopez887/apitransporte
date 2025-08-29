// buscarReservas.js
import pool from "./conexion.js";

// Valida YYYY-MM-DD
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// "Hoy" (YYYY-MM-DD)
const hoyYMD = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Log: distribución de tipo_servicio en el rango (para diagnosticar)
async function logDistribucion(desde, hasta) {
  try {
    const q = `
      SELECT LOWER(TRIM(COALESCE(tipo_servicio,''))) AS tipo_norm, COUNT(*) AS c
      FROM reservaciones
      WHERE fecha::date BETWEEN $1 AND $2
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    const { rows } = await pool.query(q, [desde, hasta]);
    console.log("[buscarReservas][DISTRIB]", rows);
  } catch (e) {
    console.log("[buscarReservas][DISTRIB] error:", e.message);
  }
}

// GET /api/buscarreservas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&servicio=transporte|actividades|ambos
// Nota: 'transporte' en el query del front se mapea aquí a tipo_servicio='Transportacion' en la BD.
export default async function buscarReservas(req, res) {
  const t0 = Date.now();
  const hoy = hoyYMD();

  let { desde, hasta, servicio } = req.query;
  desde = isYMD(desde) ? desde : hoy;
  hasta = isYMD(hasta) ? hasta : hoy;
  const svc = (servicio || "transporte").toString().trim().toLowerCase();

  console.log(`[buscarReservas] params => desde=${desde} hasta=${hasta} servicio=${svc}`);
  await logDistribucion(desde, hasta);

  try {
    // === ACTIVIDADES (tipo_servicio = 'Actividad') ===
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
          AND LOWER(TRIM(tipo_servicio)) IN ('actividad','actividades')
        ORDER BY fecha DESC, folio DESC
      `;
      const { rows, rowCount } = await pool.query(sqlA, [desde, hasta]);
      console.log(`[buscarReservas][ACTIVIDADES] rowCount=${rowCount} t=${Date.now() - t0}ms`);
      return res.json({ ok: true, reservas: rows });
    }

    // === TRANSPORTE (tipo_servicio = 'Transportacion') ===
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
            OR TRIM(tipo_servicio) = ''
            OR LOWER(TRIM(tipo_servicio)) IN ('transportacion','transporte') -- 'Transportacion' es el valor real
          )
        ORDER BY fecha DESC, folio DESC
      `;
      let { rows, rowCount } = await pool.query(sqlT, [desde, hasta]);
      console.log(`[buscarReservas][TRANSPORTE] rowCount=${rowCount} t=${Date.now() - t0}ms`);

      // Fallback legado si por alguna razón no hay 'transportacion' en ese rango
      if (rowCount === 0) {
        const sqlFallback = `
          SELECT
            folio,
            tipo_viaje,
            nombre_cliente,
            fecha_llegada,
            fecha_salida,
            cantidad_pasajeros
          FROM reservaciones
          WHERE fecha::date BETWEEN $1 AND $2
            AND NOT (LOWER(TRIM(tipo_servicio)) IN ('actividad','actividades'))
          ORDER BY fecha DESC, folio DESC
        `;
        const r2 = await pool.query(sqlFallback, [desde, hasta]);
        rows = r2.rows;
        rowCount = r2.rowCount;
        console.log(`[buscarReservas][TRANSPORTE][FALLBACK] rowCount=${rowCount}`);
      }

      return res.json({ ok: true, reservas: rows });
    }

    // === AMBOS ===
    if (svc === "ambos") {
      const sqlT = `
        SELECT folio, tipo_viaje, nombre_cliente, fecha_llegada, fecha_salida, cantidad_pasajeros
        FROM reservaciones
        WHERE fecha::date BETWEEN $1 AND $2
          AND (
            tipo_servicio IS NULL
            OR TRIM(tipo_servicio) = ''
            OR LOWER(TRIM(tipo_servicio)) IN ('transportacion','transporte')
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
          AND LOWER(TRIM(tipo_servicio)) IN ('actividad','actividades')
        ORDER BY fecha DESC, folio DESC
      `;

      const [rt, ra] = await Promise.all([
        pool.query(sqlT, [desde, hasta]),
        pool.query(sqlA, [desde, hasta]),
      ]);

      console.log(`[buscarReservas][AMBOS] T=${rt.rowCount} A=${ra.rowCount} t=${Date.now() - t0}ms`);
      return res.json({
        ok: true,
        reservas_transporte: rt.rows,
        reservas_actividades: ra.rows,
      });
    }

    console.log(`[buscarReservas] servicio desconocido="${svc}" -> []`);
    return res.json({ ok: true, reservas: [] });
  } catch (err) {
    console.error("❌ /api/buscarreservas ERROR:", err);
    return res
      .status(500)
      .json({ ok: false, where: "buscarReservas", message: err?.message || "Error al consultar reservaciones" });
  }
}