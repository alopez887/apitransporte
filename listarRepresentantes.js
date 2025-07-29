// listarRepresentantes.js
import pool from './conexion.js';

export async function listarRepresentantes(req, res) {
  try {
    const result = await pool.query(
      `SELECT usuario, nombre, proveedor 
       FROM usuarios_proveedor
       WHERE tipo_usuario = 'representante' AND activo = true
       ORDER BY nombre ASC`
    );
    res.json({ success: true, representantes: result.rows });
  } catch (err) {
    console.error("❌ Error en listarRepresentantes:", err.message);
    res.status(500).json({ success: false, error: "DB error" });
  }
}