import crypto from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import multer from 'multer';
import { cleanupMapUpload, getMapTempDir, MAX_MAP_IMAGE_BYTES } from '../services/maps.js';

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const directory = getMapTempDir();
    mkdir(directory, { recursive: true }).then(() => callback(null, directory)).catch(callback);
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${crypto.randomUUID()}.upload`);
  }
});

const uploader = multer({
  storage,
  limits: { files: 1, fileSize: MAX_MAP_IMAGE_BYTES, parts: 8, fieldSize: 2 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
      const error = new Error('map_image_type_not_allowed');
      error.code = 'map_image_type_not_allowed';
      error.statusCode = 415;
      return callback(error);
    }
    callback(null, true);
  }
});

export function mapUpload(req, res, next) {
  uploader.single('image')(req, res, async (error) => {
    if (error) {
      await cleanupMapUpload(req.file).catch(() => {});
      if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_PART_COUNT') error.statusCode = 413;
      return next(error);
    }
    next();
  });
}

