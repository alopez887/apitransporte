import pool from './conexion.js';
import bcrypt from 'bcrypt'; // ✅ Si en el futuro usas hash de contraseña

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

    // ✅ Si usas contraseñas en texto plano
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }

    // ✅ Si más adelante usas hash
    // const validPassword = await bcrypt.compare(password, user.password);
    // if (!validPassword) {
    //   return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    // }

    // Si pasa validación
    res.json({ 
      success: true, 
      message: 'Login exitoso', 
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        rol: user.rol
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}