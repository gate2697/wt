import { config } from '../config.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function hasAny(userRoleIds = [], userRoleNames = [], accepted = []) {
  const owned = new Set([...userRoleIds, ...userRoleNames].map(normalize).filter(Boolean));
  return accepted.some((role) => owned.has(normalize(role)));
}

export const ROLE_LEVELS = Object.freeze({
  public: 0,
  trial: 1,
  mod: 2,
  hmod: 3,
  admin: 4,
  headAdmin: 5,
  owner: 6
});

const LEVEL_LABELS = Object.freeze({
  0: 'Public',
  1: 'Trial Mod',
  2: 'Mod',
  3: 'HMod',
  4: 'Admin',
  5: 'Head Admin',
  6: 'Owner'
});

function roleMatches(roleIds, roleNames, key) {
  return hasAny(roleIds, roleNames, config.roles[key]);
}

/**
 * Return the highest moderation rank represented by a Discord member.
 * Head Admin and Owner retain distinct ranks so the account menu, audit log,
 * and review hierarchy can show the role the member actually holds.
 */
export function getRoleLevel(roleIds = [], roleNames = []) {
  if (roleMatches(roleIds, roleNames, 'owner')) return ROLE_LEVELS.owner;
  if (roleMatches(roleIds, roleNames, 'headAdmin')) return ROLE_LEVELS.headAdmin;
  if (roleMatches(roleIds, roleNames, 'admin') || roleMatches(roleIds, roleNames, 'legacyHighmod')) return ROLE_LEVELS.admin;
  if (roleMatches(roleIds, roleNames, 'hmod')) return ROLE_LEVELS.hmod;
  if (roleMatches(roleIds, roleNames, 'mod')) return ROLE_LEVELS.mod;
  if (roleMatches(roleIds, roleNames, 'trial')) return ROLE_LEVELS.trial;
  return ROLE_LEVELS.public;
}

export function levelName(level) {
  return LEVEL_LABELS[Math.max(0, Math.min(ROLE_LEVELS.owner, Number(level) || 0))] || LEVEL_LABELS[0];
}

export function maxBanHours(level) {
  const rank = Number(level) || 0;
  if (rank >= ROLE_LEVELS.hmod) return null;
  if (rank === ROLE_LEVELS.mod) return 72;
  if (rank === ROLE_LEVELS.trial) return 24;
  return 0;
}

export function canReviewRank(reviewerLevel, creatorLevel) {
  return Number(reviewerLevel) > Number(creatorLevel);
}

export function computePerms(roleIds = [], roleNames = []) {
  const level = getRoleLevel(roleIds, roleNames);
  const maxHours = maxBanHours(level);
  return {
    // `mod` remains the legacy flag for a regular Mod or above. New callers
    // should use canModerate so Trial Mods are included.
    trial: level >= ROLE_LEVELS.trial,
    mod: level >= ROLE_LEVELS.mod,
    hmod: level >= ROLE_LEVELS.hmod,
    admin: level >= ROLE_LEVELS.admin,
    top: level >= ROLE_LEVELS.admin,
    canModerate: level >= ROLE_LEVELS.trial,
    canReview: level > ROLE_LEVELS.trial,
    canManage: level >= ROLE_LEVELS.hmod,
    canPermanent: level >= ROLE_LEVELS.hmod,
    mapCreator: roleMatches(roleIds, roleNames, 'mapCreator'),
    level,
    rank: level,
    levelName: levelName(level),
    maxBanHours: maxHours,
    maxBanLabel: maxHours == null ? 'Permanent' : maxHours === 72 ? '3 days' : maxHours === 24 ? '24 hours' : 'No ban access'
  };
}
