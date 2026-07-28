import test from 'node:test';
import assert from 'node:assert/strict';

const { validateBanWindow } = await import('../src/services/bans.js');

const actor = (level) => ({ id: level, username: `rank-${level}`, perms: { level, rank: level } });

test('Trial Mod cannot create a permanent ban', () => {
  assert.throws(
    () => validateBanWindow({ startsAt: '2026-07-20T00:00:00.000Z', endsAt: null }, actor(1)),
    (error) => error.message === 'permanent_ban_not_allowed' && error.statusCode === 403
  );
});

test('Mod is capped at 72 hours while HMod can create permanent bans', () => {
  const modWindow = validateBanWindow({ startsAt: '2026-07-20T00:00:00.000Z', durationHours: 72 }, actor(2));
  assert.equal(modWindow.durationHours, 72);
  assert.throws(
    () => validateBanWindow({ startsAt: '2026-07-20T00:00:00.000Z', durationHours: 72.1 }, actor(2)),
    (error) => error.message === 'ban_duration_exceeds_3_days'
  );
  const permanent = validateBanWindow({ startsAt: '2026-07-20T00:00:00.000Z', endsAt: null }, actor(3));
  assert.equal(permanent.endsAt, null);
});
