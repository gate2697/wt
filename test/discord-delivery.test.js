import test from 'node:test';
import assert from 'node:assert/strict';

const { discordDeliveryMessage } = await import('../src/services/discordMessaging.js');
const { buildBanNotice } = await import('../src/services/notifications.js');

test('Discord delivery status has a useful in-site fallback message', () => {
  assert.equal(discordDeliveryMessage('sent', 'Sent through the CB Discord bot.'), 'Sent through the CB Discord bot.');
  assert.match(discordDeliveryMessage('blocked', 'The member has disabled direct messages.'), /disabled direct messages/);
  assert.match(discordDeliveryMessage('not_configured', ''), /in-site notification inbox/);
});

test('linked War Thunder ban notice includes the stable ID and reason', () => {
  const notice = buildBanNotice({
    warthunder_username: 'Pilot@live',
    warthunder_id: 'wt-123',
    reason: 'Repeated teamkilling',
    starts_at: '2026-07-24 12:00:00',
    ends_at: null
  });
  assert.match(notice.discord, /Pilot@live/);
  assert.match(notice.discord, /wt-123/);
  assert.match(notice.discord, /Repeated teamkilling/);
  assert.match(notice.discord, /Permanent/);
});
