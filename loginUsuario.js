import pool from './conexion.js';

export default async function loginUsuario(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({ success: false, message: 'Faltan usuario o contraseña' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios_proveedor WHERE UPPER(usuario) = UPPER($1) AND activo = true',
      [usuario.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no válido o inactivo' });
    }

    const user = result.rows[0];

    // ✅ Comparar contraseña simple (sin hash)
    if (password !== user.password) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }

    // ✅ Respuesta estandarizada
    res.json({ 
      success: true, 
      message: 'Login exitoso', 
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        tipo_usuario: user.tipo_usuario,   // 👈 mantenemos este
        rol: user.tipo_usuario,            // 👈 compatibilidad con front
        provider: user.proveedor_slug || null,
        provider_name: user.proveedor_nombre || null
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}
