import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { all, get, run } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '../..');
const mapRoot = path.resolve(process.env.MAP_UPLOAD_DIR || path.join(appRoot, 'uploads', 'maps'));
const mapTempRoot = path.join(mapRoot, '.tmp');

export const MAX_MAP_IMAGE_BYTES = 10 * 1024 * 1024;

function mapError(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function getMapTempDir() { return mapTempRoot; }
export function getMapRoot() { return mapRoot; }

export async function cleanupMapUpload(file) {
  if (!file?.path) return;
  await unlink(file.path).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
}

function extensionFor(file) {
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : '';
}

function safeMapPath(storageName) {
  const resolved = path.resolve(mapRoot, String(storageName || ''));
  if (!resolved.startsWith(`${mapRoot}${path.sep}`)) throw mapError('invalid_map_image_path', 500);
  return resolved;
}

export function mapImageAbsolutePath(row) {
  return safeMapPath(row?.image_storage_name);
}

export async function persistMapImage(file) {
  if (!file) return null;
  if (Number(file.size) > MAX_MAP_IMAGE_BYTES) throw mapError('map_image_too_large', 413);
  await mkdir(mapRoot, { recursive: true });
  const storageName = `${crypto.randomUUID()}${extensionFor(file)}`;
  const destination = safeMapPath(storageName);
  await rename(file.path, destination);
  return storageName;
}

function validImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') throw mapError('map_image_url_must_use_https');
    return parsed.href.slice(0, 2_000);
  } catch (error) {
    if (error?.code === 'map_image_url_must_use_https') throw error;
    throw mapError('valid_map_image_url_required');
  }
}

export function decorateMap(row, currentMapId = null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    image_url: row.image_storage_name ? `/api/maps/${row.id}/image` : row.image_url,
    server_link: row.server_link,
    // Friendly aliases keep the payload convenient for Discord bot clients
    // that use the shorter `link`/`image` names.
    link: row.server_link,
    image: row.image_storage_name ? `/api/maps/${row.id}/image` : row.image_url,
    active: Boolean(row.active),
    created_by_label: row.created_by_label || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_current: currentMapId != null && Number(row.id) === Number(currentMapId),
    image_storage_name: undefined
  };
}

export async function getMap(id, { includeInactive = true } = {}) {
  const rows = await all(`SELECT * FROM maps WHERE id=?${includeInactive ? '' : ' AND active=1'} LIMIT 1`, [id]);
  return decorateMap(rows[0]);
}

export async function listMaps({ includeInactive = false, currentMapId = null } = {}) {
  const rows = await all(`SELECT * FROM maps ${includeInactive ? '' : 'WHERE active=1'} ORDER BY active DESC, name ASC, id ASC`);
  return rows.map((row) => decorateMap(row, currentMapId));
}

export async function createMap({ name, serverLink, imageUrl, imageFile }, actor) {
  const cleanNameValue = cleanName(name);
  const cleanLink = String(serverLink || '').trim().slice(0, 2_000);
  if (cleanNameValue.length < 1) throw mapError('map_name_required');
  if (cleanLink.length < 1) throw mapError('map_server_link_required');
  let link;
  try {
    const parsed = new URL(cleanLink);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    link = parsed.href;
  }
  catch { throw mapError('valid_map_server_link_required'); }
  const externalImageUrl = imageFile ? null : validImageUrl(imageUrl);
  if (!imageFile && !externalImageUrl) throw mapError('map_image_required');

  let storageName = null;
  try {
    storageName = await persistMapImage(imageFile);
    const result = await run(`INSERT INTO maps
      (name, image_url, image_storage_name, image_mime_type, server_link, created_by_user_id, created_by_label)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      cleanNameValue,
      externalImageUrl || null,
      storageName,
      imageFile?.mimetype ? String(imageFile.mimetype).slice(0, 128) : null,
      link,
      actor?.id || null,
      actor?.username || actor?.label || 'Map creator'
    ]);
    return getMap(result.insertId);
  } catch (error) {
    if (storageName) await unlink(safeMapPath(storageName)).catch(() => {});
    throw error;
  }
}

export async function setMapActive(id, active) {
  const result = await run('UPDATE maps SET active=? WHERE id=?', [active ? 1 : 0, id]);
  if (!result.affectedRows) return null;
  return getMap(id);
}
