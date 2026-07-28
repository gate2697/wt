import express from 'express';
import { z } from 'zod';
import { get } from '../db/database.js';
import { requirePerm } from '../middleware/auth.js';
import { mapUpload } from '../middleware/mapUpload.js';
import { cleanupMapUpload, createMap, getMap, mapImageAbsolutePath, listMaps, setMapActive } from '../services/maps.js';

export const mapsRouter = express.Router();

// Public catalogue. The bot can use the same response to retrieve the server
// links for its own Discord messages or game-server handoff.
mapsRouter.get('/', async (req, res, next) => {
  try { res.json({ maps: await listMaps({ includeInactive: false }) }); }
  catch (error) { next(error); }
});

mapsRouter.get('/public', async (req, res, next) => {
  try { res.json({ maps: await listMaps({ includeInactive: false }) }); }
  catch (error) { next(error); }
});

mapsRouter.get('/manage', requirePerm('mapCreator'), async (req, res, next) => {
  try { res.json({ maps: await listMaps({ includeInactive: true }) }); }
  catch (error) { next(error); }
});

mapsRouter.post('/', requirePerm('mapCreator'), mapUpload, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().min(1).max(255),
      serverLink: z.string().trim().url().max(2_000),
      imageUrl: z.string().trim().url().max(2_000).optional().or(z.literal(''))
    }).parse(req.body || {});
    const map = await createMap({ ...body, imageFile: req.file }, req.session.user);
    res.status(201).json({ map });
  } catch (error) {
    await cleanupMapUpload(req.file).catch(() => {});
    next(error);
  }
});

mapsRouter.patch('/:id', requirePerm('mapCreator'), async (req, res, next) => {
  try {
    const body = z.object({ active: z.boolean() }).parse(req.body || {});
    const map = await setMapActive(req.params.id, body.active);
    if (!map) return res.status(404).json({ error: 'not_found' });
    res.json({ map });
  } catch (error) { next(error); }
});

mapsRouter.get('/:id/image', async (req, res, next) => {
  try {
    const row = await get('SELECT image_storage_name, image_mime_type FROM maps WHERE id=? LIMIT 1', [req.params.id]);
    if (!row?.image_storage_name) return res.status(404).end();
    res.type(row.image_mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(mapImageAbsolutePath(row));
  } catch (error) { next(error); }
});

mapsRouter.get('/:id', async (req, res, next) => {
  try {
    const map = await getMap(req.params.id, { includeInactive: false });
    if (!map) return res.status(404).json({ error: 'not_found' });
    res.json({ map });
  } catch (error) { next(error); }
});
