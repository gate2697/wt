import { config } from '../config.js';

function hasAny(roles, accepted) {
  const normalizedRoles = new Set((roles || []).map((r) => String(r).toLowerCase()));
  return accepted.some((r) => normalizedRoles.has(String(r).toLowerCase()));
}

export function computePerms(roles = []) {
  const highmod = hasAny(roles, config.roles.highmod);
  const hmod = highmod || hasAny(roles, config.roles.hmod);
  const mod = hmod || hasAny(roles, config.roles.mod);
  return { mod, hmod, highmod };
}
