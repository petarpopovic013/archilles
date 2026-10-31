import assert from 'node:assert/strict';
import test from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { createClaudeVisionRunner } from '../../src/vision/claude';
import { frameToRaster, visionFrame, withinRaster } from '../../src/vision/frame';
import { cleanVisionOutput } from '../../src/vision/schema';
import { plainRaster } from './raster';

const outer = (frame: ReturnType<typeof visionFrame>) => ({ width: frame.width + 2 * frame.margin, height: frame.height + 2 * frame.margin });

test('the framed image stays inside the model limits so the API never resizes it', () => {
  const standard = outer(visionFrame('claude-sonnet-4-6', 1800, 1863));
  assert.ok(Math.max(standard.width, standard.height) <= 1568);
  assert.ok(standard.width * standard.height <= 1_150_000);
  const highRes = outer(visionFrame('claude-opus-5-5', 1800, 1863));
  assert.ok(highRes.width * highRes.height <= 3_750_000 && highRes.width > standard.width);
});

test('small plans are upscaled for legibility, at most three times', () => {
  const frame = visionFrame('claude-sonnet-4-6', 455, 1222);
  assert.ok(frame.height > 1222 && frame.height + 2 * frame.margin <= 1568);
  assert.equal(visionFrame('claude-sonnet-4-6', 100, 80).width, 300);
});

test('frame coordinates map back to raster pixels; slight overshoot is clamped', () => {
  const frame = { width: 500, height: 400, margin: 34, gridStep: 50 };
  const output = frameToRaster({
    elements: [{ ref: 'r', type: 'ROOM', geometry: { kind: 'BBOX', x: 100, y: 40, width: 405, height: 100 }, measurements: [] }],
    warnings: [],
  }, frame, 1000, 800);
  assert.deepEqual(output.elements[0].geometry, { kind: 'BBOX', x: 200, y: 80, width: 800, height: 200 });
});

test('elements outside the drawing are discarded with a warning instead of failing the floor', () => {
  const output = withinRaster({
    elements: [
      { ref: 'in', type: 'ROOM', geometry: { kind: 'BBOX', x: 10, y: 10, width: 50, height: 50 }, measurements: [] },
      { ref: 'out', type: 'DOOR', geometry: { kind: 'BBOX', x: 90, y: 10, width: 50, height: 5 }, measurements: [] },
    ],
    warnings: [],
  }, 100, 100);
  assert.deepEqual(output.elements.map(e => e.ref), ['in']);
  assert.match(output.warnings[0], /1 element\(s\) placed outside/);
});

test('malformed elements are discarded while the rest of the answer is kept', () => {
  const output = cleanVisionOutput({
    elements: [
      { ref: 'ok', type: 'DOOR', label: '  ', geometry: { kind: 'BBOX', x: 1, y: 1, width: 5, height: 5 }, measurements: [] },
      { ref: 'flat', type: 'ROOM', geometry: { kind: 'POLYGON', points: [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, measurements: [] },
    ],
    warnings: ['legend missing'],
  });
  assert.deepEqual(output?.elements.map(e => e.ref), ['ok']);
  assert.equal(output?.elements[0].label, undefined, 'blank labels are removed');
  assert.deepEqual(output?.warnings, ['1 malformed element(s) were discarded.', 'legend missing']);
  assert.equal(cleanVisionOutput({ nothing: true }), undefined);
});

test('an element clamped flat at the drawing edge is discarded, not fatal', () => {
  const frame = { width: 100, height: 100, margin: 34, gridStep: 10 };
  const clamped = frameToRaster({
    elements: [{ ref: 'edge', type: 'OPENING', geometry: { kind: 'BBOX', x: 100.5, y: 10, width: 1, height: 20 }, measurements: [] }],
    warnings: [],
  }, frame, 100, 100);
  assert.deepEqual(cleanVisionOutput(clamped)?.elements, []);
});

test('the adapter sends a framed image with rulers and returns raster coordinates', async () => {
  let request: { messages: Array<{ content: Array<{ type: string; text?: string; source?: { data: string } }> }> } | undefined;
  const client = { messages: { create: async (body: typeof request) => {
    request = body;
    const frame = visionFrame('claude-sonnet-4-6', 2000, 1000);
    const answer = { elements: [{ ref: 'r', type: 'ROOM', geometry: { kind: 'BBOX', x: 0, y: 0, width: frame.width / 2, height: frame.height / 2 }, measurements: [] }], warnings: [] };
    return { stop_reason: 'end_turn', usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 20 }, content: [{ type: 'text', text: JSON.stringify(answer) }] };
  } } } as unknown as Anthropic;
  const result = await createClaudeVisionRunner(client, 'claude-sonnet-4-6').run(await plainRaster(2000, 1000), 2000, 1000);
  const image = await sharp(Buffer.from(request!.messages[0].content.find(c => c.type === 'image')!.source!.data, 'base64')).metadata();
  assert.ok(Math.max(image.width!, image.height!) <= 1568 && image.width! * image.height! <= 1_150_000);
  assert.match(request!.messages[0].content[0].text!, /ruler/);
  assert.equal(result.inputTokens, 15, 'cache-read tokens are billable input');
  const geometry = (result.output as { elements: Array<{ geometry: { x: number; width: number; height: number } }> }).elements[0].geometry;
  assert.equal(geometry.x, 0);
  assert.ok(Math.abs(geometry.width - 1000) <= 2 && Math.abs(geometry.height - 500) <= 2);
});

test('suggested categories are kept only when listed for that element type, or OTHER', async () => {
  let prompt = '';
  const client = { messages: { create: async (body: { messages: Array<{ content: Array<{ type: string; text?: string }> }> }) => {
    prompt = body.messages[0].content[0].text!;
    const element = (ref: string, type: string, subtype: string) => ({ ref, type, subtype, geometry: { kind: 'BBOX', x: 10 + 100 * (ref.charCodeAt(0) - 97), y: 10, width: 10, height: 10 }, measurements: [] });
    const answer = { elements: [element('a', 'DOOR', 'ACCESSIBLE_INTERNAL_DOOR_ART22'), element('b', 'DOOR', 'ABOVE_GROUND_STAIR_FLIGHT'), element('c', 'CORRIDOR', 'OTHER')], warnings: [] };
    return { stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(answer) }] };
  } } } as unknown as Anthropic;
  const categories = [{ elementType: 'DOOR' as const, subtype: 'ACCESSIBLE_INTERNAL_DOOR_ART22', description: 'internal accessible door' }];
  const runner = createClaudeVisionRunner(client, 'claude-sonnet-4-6', { categories });
  const result = await runner.run(await plainRaster(400, 300), 400, 300);
  assert.match(prompt, /DOOR ACCESSIBLE_INTERNAL_DOOR_ART22: internal accessible door/);
  const subtypes = (result.output as { elements: Array<{ ref: string; subtype?: string }> }).elements.map(e => [e.ref, e.subtype]);
  assert.deepEqual(subtypes, [['a', 'ACCESSIBLE_INTERNAL_DOOR_ART22'], ['b', undefined], ['c', 'OTHER']]);
  assert.notEqual(runner.version, createClaudeVisionRunner(client, 'claude-sonnet-4-6').version, 'the category list is part of the cache identity');
});

test('closed-ring model polygons normalize without an artificial zero-length edge', () => {
  const output=cleanVisionOutput({elements:[{ref:'r',type:'ROOM',geometry:{kind:'POLYGON',points:[{x:10,y:10},{x:100,y:10},{x:100,y:100},{x:10,y:100},{x:10,y:10}]},measurements:[]}],warnings:[]});
  const g=output!.elements[0].geometry;
  assert.equal(g.kind,'POLYGON');if(g.kind==='POLYGON')assert.equal(g.points.length,4);
});
