import { config } from '../config.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function hasAny(userRoleIds = [], userRoleNames = [], accepted = []) {
  const owned = new Set([...userRoleIds, ...userRoleNames].map(normalize).filter(Boolean));
  return accepted.some((role) => owned.has(normalize(role)));
}

export function computePerms(roleIds = [], roleNames = []) {
  const highmod = hasAny(roleIds, roleNames, config.roles.highmod);
  const hmod = highmod || hasAny(roleIds, roleNames, config.roles.hmod);
  const mod = hmod || hasAny(roleIds, roleNames, config.roles.mod);
  return { mod, hmod, highmod };
}
