import fs from 'fs';
import path from 'path';

export default function registerCanvasCache(app) {
  const cacheDir = path.join(process.cwd(), 'tmp', 'canvas-cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  const MAX_AGE = 1000 * 60 * 60 * 6; // 6h

  function limpiarViejos() {
    try {
      const ahora = Date.now();
      for (const f of fs.readdirSync(cacheDir)) {
        const p = path.join(cacheDir, f);
        const st = fs.statSync(p);
        if (ahora - st.mtimeMs > MAX_AGE) fs.unlinkSync(p);
      }
    } catch (e) {
      console.error('❌ Limpieza canvas-cache:', e);
    }
  }
  setInterval(limpiarViejos, 1000 * 60 * 60);

  // Guarda PNG recibido como dataURL
  app.post('/api/canvas-cache', (req, res) => {
    try {
      const { filename, dataUrl } = req.body || {};
      if (!filename || !dataUrl || !/^data:image\/png;base64,/.test(dataUrl)) {
        return res.status(400).json({ ok: false, error: 'payload inválido' });
      }

      const safe = String(filename).replace(/\s+/g, '_').replace(/[^\w\-\.]/g, '');
      const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const finalName = `${id}_${safe}`;
      const filePath = path.join(cacheDir, finalName);

      const base64 = dataUrl.split(',')[1];
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

      res.json({ ok: true, url: `/api/canvas/${finalName}` });
    } catch (e) {
      console.error('❌ /api/canvas-cache error:', e);
      res.status(500).json({ ok: false, error: 'error interno' });
    }
  });

  // Descarga PNG
  app.get('/api/canvas/:file', (req, res) => {
    try {
      const file = req.params.file;
      const filePath = path.join(cacheDir, file);
      if (!fs.existsSync(filePath)) return res.status(404).send('No encontrado');

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file)}"`);
      res.sendFile(filePath);
      // si quieres 1 solo uso: fs.unlinkSync(filePath);
    } catch (e) {
      console.error('❌ /api/canvas/:file error:', e);
      res.status(500).send('error interno');
    }
  });
}