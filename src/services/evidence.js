import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { all, get, run } from '../db/database.js';

export const MAX_EVIDENCE_FILES = 10;
export const MAX_EVIDENCE_BYTES = 100 * 1024 * 1024;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '../..');
const evidenceRoot = path.resolve(process.env.EVIDENCE_UPLOAD_DIR || path.join(appRoot, 'uploads', 'evidence'));
const tempRoot = path.join(evidenceRoot, '.tmp');

function evidenceError(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function getEvidenceTempDir() {
  return tempRoot;
}

export function getEvidenceRoot() {
  return evidenceRoot;
}

export function totalUploadedBytes(files = []) {
  return files.reduce((total, file) => total + (Number(file?.size) || 0), 0);
}

export function validateEvidenceFiles(files = []) {
  if (!Array.isArray(files) || files.length === 0) return;
  if (files.length > MAX_EVIDENCE_FILES) {
    throw evidenceError('evidence_file_count_exceeded', 413);
  }
  if (totalUploadedBytes(files) > MAX_EVIDENCE_BYTES) {
    throw evidenceError('evidence_total_size_exceeded', 413);
  }
}

async function removeFile(filePath) {
  if (!filePath) return;
  await unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export async function cleanupUploadedFiles(files = []) {
  await Promise.all((Array.isArray(files) ? files : []).map((file) => removeFile(file?.path)));
}

function cleanOriginalName(value) {
  const name = path.basename(String(value || 'evidence'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255);
  return name || 'evidence';
}

function extensionFor(file) {
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  return /^[.][a-z0-9]{1,12}$/.test(extension) ? extension : '';
}

function safeStoragePath(storageName) {
  const resolved = path.resolve(evidenceRoot, storageName);
  if (!resolved.startsWith(`${evidenceRoot}${path.sep}`)) throw evidenceError('invalid_evidence_path', 500);
  return resolved;
}

export async function persistEvidence(files, { banIds = [], banRequestId = null, uploadedByUserId = null } = {}) {
  const uploaded = Array.isArray(files) ? files : [];
  validateEvidenceFiles(uploaded);
  if (!uploaded.length) return [];
  if (!banIds.length && !banRequestId) {
    await cleanupUploadedFiles(uploaded);
    return [];
  }

  await mkdir(evidenceRoot, { recursive: true });
  const moved = [];
  const records = [];
  try {
    for (const file of uploaded) {
      const storageName = `${crypto.randomUUID()}${extensionFor(file)}`;
      const destination = safeStoragePath(storageName);
      await rename(file.path, destination);
      moved.push(destination);

      const targets = banIds.length ? banIds.map((banId) => ({ banId, banRequestId: null })) : [{ banId: null, banRequestId }];
      for (const target of targets) {
        const result = await run(`INSERT INTO evidence_files
          (ban_id, ban_request_id, original_name, storage_name, mime_type, byte_size, uploaded_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [
          target.banId,
          target.banRequestId,
          cleanOriginalName(file.originalname),
          storageName,
          String(file.mimetype || 'application/octet-stream').slice(0, 128),
          Number(file.size) || 0,
          uploadedByUserId || null
        ]);
        records.push({ id: result.insertId, storageName, originalName: cleanOriginalName(file.originalname), mimeType: String(file.mimetype || 'application/octet-stream').slice(0, 128), byteSize: Number(file.size) || 0, banId: target.banId, banRequestId: target.banRequestId });
      }
    }
    return records;
  } catch (error) {
    await Promise.all(moved.map((filePath) => removeFile(filePath).catch(() => {})));
    throw error;
  }
}

function decorateEvidence(row, prefix) {
  if (!row) return null;
  const base = prefix === 'ban'
    ? `/api/bans/${row.ban_id}/evidence/${row.id}`
    : `/api/ban-requests/${row.ban_request_id}/evidence/${row.id}`;
  return {
    id: row.id,
    original_name: row.original_name,
    mime_type: row.mime_type,
    byte_size: Number(row.byte_size) || 0,
    created_at: row.created_at,
    download_url: base
  };
}

export async function listBanEvidence(banId) {
  const rows = await all(`SELECT id, ban_id, original_name, storage_name, mime_type, byte_size, created_at
    FROM evidence_files WHERE ban_id=? ORDER BY created_at ASC, id ASC`, [banId]);
  return rows.map((row) => decorateEvidence(row, 'ban'));
}

export async function listBanRequestEvidence(requestId) {
  const rows = await all(`SELECT id, ban_request_id, original_name, storage_name, mime_type, byte_size, created_at
    FROM evidence_files WHERE ban_request_id=? ORDER BY created_at ASC, id ASC`, [requestId]);
  return rows.map((row) => decorateEvidence(row, 'request'));
}

export async function getBanEvidence(banId, evidenceId) {
  return get(`SELECT id, ban_id, original_name, storage_name, mime_type, byte_size, created_at
    FROM evidence_files WHERE ban_id=? AND id=?`, [banId, evidenceId]);
}

export async function getBanRequestEvidence(requestId, evidenceId) {
  return get(`SELECT id, ban_request_id, original_name, storage_name, mime_type, byte_size, created_at
    FROM evidence_files WHERE ban_request_id=? AND id=?`, [requestId, evidenceId]);
}

export function evidenceAbsolutePath(row) {
  return safeStoragePath(row?.storage_name);
}
