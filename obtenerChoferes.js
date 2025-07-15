import pool from './conexion.js';

export async function obtenerChoferes(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, nombre, usuario FROM usuarios_proveedor WHERE tipo_usuario = 'chofer' AND activo = true"
    );
    res.json({ success: true, choferes: result.rows });
  } catch (error) {
    console.error('❌ Error obteniendo choferes:', error);
    res.status(500).json({ success: false, message: 'Error obteniendo choferes' });
  }
}