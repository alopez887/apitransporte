import pool from './conexion.js';

export default async function loginUsuario(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Faltan usuario o contraseña'
    });
  }

  try {
    // 👇 YA NO filtramos por activo aquí
    const result = await pool.query(
      `
      SELECT *
      FROM usuarios_proveedor
      WHERE UPPER(usuario) = UPPER($1)
      LIMIT 1
      `,
      [usuario.trim()]
    );

    const user = result.rows[0];

    // 🔴 Usuario NO existe
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    // 🔴 Usuario existe pero está INACTIVO
    if (!user.activo) {
      return res.status(403).json({
        success: false,
        code: 'USUARIO_INACTIVO',
        message: 'Usuario inactivo.',
        inactivo: true,           // 👈 el iframe lo usa para mostrar "Usuario inactivo"
        error: 'USUARIO_INACTIVO' // 👈 por si quieres checar por código
      });
    }

    // ✅ Comparar contraseña simple (sin hash)
    const storedPass = String(user.password ?? '');
    const inputPass  = String(password);

    if (storedPass !== inputPass) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    // ✅ Respuesta estandarizada
    return res.json({
      success: true,
      message: 'Login exitoso',
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        tipo_usuario: user.tipo_usuario,    // 👈 mantenemos este
        rol: user.tipo_usuario,            // 👈 compatibilidad con front
        provider: user.proveedor_slug || null,
        provider_name: user.proveedor_nombre || null
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor'
    });
  }
}
