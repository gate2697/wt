import crypto from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import multer from 'multer';
import {
  cleanupUploadedFiles,
  getEvidenceTempDir,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  totalUploadedBytes,
  validateEvidenceFiles
} from '../services/evidence.js';

const blockedExtensions = new Set(['.ade', '.app', '.bat', '.cmd', '.com', '.cpl', '.dll', '.exe', '.hta', '.htm', '.html', '.inf', '.ins', '.jar', '.js', '.jse', '.lnk', '.msi', '.msp', '.mst', '.php', '.ps1', '.scr', '.sh', '.sys', '.vbe', '.vbs', '.wsf']);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const directory = getEvidenceTempDir();
    mkdir(directory, { recursive: true }).then(() => callback(null, directory)).catch(callback);
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${crypto.randomUUID()}.upload`);
  }
});

const uploader = multer({
  storage,
  limits: {
    files: MAX_EVIDENCE_FILES,
    fileSize: MAX_EVIDENCE_BYTES,
    parts: 24,
    fieldSize: 1024 * 1024
  },
  fileFilter(req, file, callback) {
    const extension = String(file.originalname || '').toLowerCase().match(/[.][a-z0-9]+$/)?.[0] || '';
    if (blockedExtensions.has(extension)) {
      const error = new Error('evidence_file_type_not_allowed');
      error.code = 'evidence_file_type_not_allowed';
      error.statusCode = 415;
      return callback(error);
    }
    callback(null, true);
  }
});

export function evidenceUpload(req, res, next) {
  uploader.array('evidence', MAX_EVIDENCE_FILES)(req, res, async (error) => {
    if (error) {
      await cleanupUploadedFiles(req.files).catch(() => {});
      if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_PART_COUNT') error.statusCode = 413;
      return next(error);
    }
    try {
      validateEvidenceFiles(req.files || []);
      if (totalUploadedBytes(req.files || []) > MAX_EVIDENCE_BYTES) {
        await cleanupUploadedFiles(req.files);
        const sizeError = new Error('evidence_total_size_exceeded');
        sizeError.statusCode = 413;
        sizeError.code = 'evidence_total_size_exceeded';
        return next(sizeError);
      }
      return next();
    } catch (validationError) {
      await cleanupUploadedFiles(req.files).catch(() => {});
      return next(validationError);
    }
  });
}
