import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../src/config.js');
const { computePerms, getRoleLevel, maxBanHours, canReviewRank } = await import('../src/auth/perms.js');

function configuredRole(key, fallback) {
  return config.roles[key]?.[0] || fallback;
}

test('Discord role names resolve to the requested moderation hierarchy', () => {
  const trial = configuredRole('trial', 'trial mod');
  const mod = configuredRole('mod', 'mod');
  const hmod = configuredRole('hmod', 'head mod');
  const admin = configuredRole('admin', 'admin');
  const headAdmin = configuredRole('headAdmin', 'head admin');
  const owner = configuredRole('owner', 'owner');
  assert.equal(getRoleLevel([], [trial]), 1);
  assert.equal(getRoleLevel([], [mod]), 2);
  assert.equal(getRoleLevel([], [hmod]), 3);
  assert.equal(getRoleLevel([], [admin]), 4);
  assert.equal(getRoleLevel([], [headAdmin]), 5);
  assert.equal(getRoleLevel([], [owner]), 6);
  assert.equal(getRoleLevel([], ['role-not-configured-by-this-test']), 0);
});

test('ban ceilings are 24 hours, 3 days, then permanent', () => {
  assert.equal(maxBanHours(1), 24);
  assert.equal(maxBanHours(2), 72);
  assert.equal(maxBanHours(3), null);
  assert.equal(computePerms([], [configuredRole('trial', 'trial mod')]).maxBanLabel, '24 hours');
  assert.equal(computePerms([], [configuredRole('mod', 'mod')]).maxBanLabel, '3 days');
  assert.equal(computePerms([], [configuredRole('hmod', 'head mod')]).canPermanent, true);
  assert.equal(computePerms([], [configuredRole('admin', 'admin')]).levelName, 'Admin');
  assert.equal(computePerms([], [configuredRole('headAdmin', 'head admin')]).levelName, 'Head Admin');
  assert.equal(computePerms([], [configuredRole('owner', 'owner')]).levelName, 'Owner');
});

test('only HMods and above can process unban requests', () => {
  assert.equal(computePerms([], [configuredRole('mod', 'mod')]).canManage, false);
  assert.equal(computePerms([], [configuredRole('hmod', 'head mod')]).canManage, true);
  assert.equal(computePerms([], [configuredRole('admin', 'admin')]).canManage, true);
});

test('only a strictly higher rank can review a ban', () => {
  assert.equal(canReviewRank(2, 1), true);
  assert.equal(canReviewRank(3, 2), true);
  assert.equal(canReviewRank(4, 3), true);
  assert.equal(canReviewRank(2, 2), false);
  assert.equal(canReviewRank(1, 1), false);
});

test('map creator role grants catalogue access without changing moderation rank', () => {
  const mapCreator = configuredRole('mapCreator', 'map creator');
  const perms = computePerms([], [mapCreator]);
  assert.equal(perms.mapCreator, true);
  assert.equal(perms.level, 0);
  assert.equal(perms.canModerate, false);
});
