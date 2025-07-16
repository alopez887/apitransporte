import pool from './conexion.js';

export async function obtenerServiciosAsignadosEstatus(req, res) {
  const { usuario, estatus = 'asignado' } = req.query;

  if (!usuario) {
    return res.status(400).json({ success: false, message: 'Falta parámetro usuario' });
  }

  try {
    // 🔥 PRUEBA: solo devolver primeros 5 registros para revisar columnas
    const result = await pool.query(`SELECT * FROM reservas_transporte LIMIT 5`);
    console.log("✅ Datos de prueba:", result.rows);

    // Enviar a frontend para verificar columnas
    res.json({ success: true, servicios: result.rows });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener servicios' });
  }
}
