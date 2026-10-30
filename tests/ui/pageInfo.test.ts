import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpArchillesApiClient } from '../../src/ui/api/httpClient';

test('page info uses source headers rather than image size or invented fallback dimensions', async () => {
  let calls = 0;
  const client = new HttpArchillesApiClient({ fetchFn: (async () => {
    calls++;
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png', 'x-source-width': '4000', 'x-source-height': '3000' } });
  }) as typeof fetch });
  const info = await client.getDrawingPageInfo('drawing', 1);
  assert.equal(info.widthPx, 4000); assert.equal(info.heightPx, 3000); assert.equal(calls, 1);
  URL.revokeObjectURL(info.url);
});

test('missing, fractional or oversized source dimensions cannot silently produce an overlay frame', async () => {
  for (const width of [undefined, '0', '1.5', '100000']) {
    const client = new HttpArchillesApiClient({ fetchFn: (async () => new Response(null, { headers: { ...(width === undefined ? {} : { 'x-source-width': width }), 'x-source-height': '3000' } })) as typeof fetch });
    await assert.rejects(client.getDrawingPageInfo('drawing', 1), error => (error as { code?: string }).code === 'PAGE_DIMENSIONS_INVALID');
  }
});
