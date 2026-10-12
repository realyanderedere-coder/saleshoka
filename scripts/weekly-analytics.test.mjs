import test from 'node:test';
import assert from 'node:assert/strict';
import { windowFor, graphql, validateRows, render, verifySchema } from './weekly-analytics.mjs';

test('JST week boundaries include Sunday and exclude Monday, including year rollover', () => {
  assert.deepEqual(windowFor(new Date('2026-10-13T03:00:00Z')), { start: '2026-10-04T15:00:00.000Z', end: '2026-10-11T15:00:00.000Z' });
  assert.equal(windowFor(new Date('2026-10-11T14:59:59Z')).end, '2026-10-04T15:00:00.000Z');
  assert.equal(windowFor(new Date('2026-01-01T00:00:00Z')).start, '2025-12-21T15:00:00.000Z');
});
test('HTTP and partial GraphQL errors never become zero metrics or expose response secrets', async () => {
  await assert.rejects(graphql('', {}, 'PRIVATE', async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(graphql('', {}, 'PRIVATE', async () => ({ ok: true, json: async () => ({ data: {}, errors: [{ message: 'PRIVATE' }] }) })), e => !e.message.includes('PRIVATE'));
});
test('missing fields, invalid numeric values and unavailable schema fail closed', () => {
  assert.throws(() => validateRows([{ count: 1, sum: {} }]), /Invalid/);
  assert.throws(() => validateRows(null), /Missing/);
  assert.throws(() => verifySchema([]), /unavailable/);
  assert.deepEqual(validateRows([]), []);
});
test('report keeps API estimates unscaled and escapes untrusted dimension labels', () => {
  const row = { count: 10, sum: { visits: 3 }, avg: { sampleInterval: 10 }, dimensions: { requestPath: '/a|<script>\n', refererHost: 'example.com' } };
  const text = render({ total: [row], pages: [row], referrers: [row] }, windowFor(new Date('2026-10-13T00:00:00Z')));
  assert.match(text, /Page Views: 10/);
  assert.match(text, /Visits: 3/);
  assert.ok(!text.includes('<script>'));
  assert.match(render({ total: [], pages: [], referrers: [] }, windowFor()), /ゼロアクセスとは断定しません/);
});
