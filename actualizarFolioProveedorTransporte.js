import pool from './conexion.js';

export default async function validarUsuarioProveedor(req, res) {
  const { usuario } = req.body;

  if (!usuario) {
    return res.status(400).json({ success: false, message: 'Falta usuario' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios_proveedor WHERE UPPER(usuario) = UPPER($1) AND activo = true',
      [usuario.trim()]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, usuario: result.rows[0] });
    } else {
      res.json({ success: false, message: 'Usuario no válido o inactivo.' });
    }
  } catch (error) {
    console.error('❌ Error al validar usuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}