import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { VisionOutputSchema, cleanVisionOutput, type VisionOutput, type VisionRunner } from './schema';
import { GeometryError, type GeometryExtraction } from '../geometry/types';
import { providerFailure } from './provider-errors';
import { DRAWING_EXTRACTION_PROMPT } from './prompt';
import { frameToRaster, grayRaster, renderVisionFrame, visionFrame, withinRaster } from './frame';
import { refineGeometry } from '../geometry/refine';
import type { ElementType } from '../domain/common';
export const PROMPT_VERSION = 'geometry-v4-suggested-categories';
export const VISION_MAX_OUTPUT_TOKENS = 16_000;

/** A review category of an active rule that Vision may suggest; a person confirms it. */
export interface VisionCategory { elementType: ElementType; subtype: string; description: string }

const OTHER_CATEGORY = 'OTHER';

function categoryText(categories: readonly VisionCategory[]): string {
  if (!categories.length) return 'No review categories are defined; omit subtype.';
  return ['Review categories by element type (suggest at most one per element, or OTHER):',
    ...categories.map(c => `- ${c.elementType} ${c.subtype}: ${c.description}`)].join('\n');
}

/** Keeps a suggested subtype only when it is a listed category for that element type, or OTHER. */
function allowedSubtypes(output: VisionOutput, categories: readonly VisionCategory[]): VisionOutput {
  const allowed = new Set(categories.map(c => `${c.elementType}:${c.subtype}`));
  return { ...output, elements: output.elements.map(({ subtype, ...element }) =>
    subtype && (subtype === OTHER_CATEGORY || allowed.has(`${element.type}:${subtype}`)) ? { ...element, subtype } : element) };
}

/** Inject a server-owned client. SDK retries are disabled so the adapter owns the retry bound. */
export function createClaudeVisionRunner(client: Anthropic, model: string, options: { categories?: readonly VisionCategory[] } = {}): VisionRunner {
  const categories = options.categories ?? [];
  const version = createHash('sha256').update(JSON.stringify(categories)).digest('hex').slice(0, 16);
  return { model, version, async run(image, width, height) {
    const frame = visionFrame(model, width, height);
    let framed: Buffer, pixels: Awaited<ReturnType<typeof grayRaster>>;
    try { [framed, pixels] = await Promise.all([renderVisionFrame(image, frame), grayRaster(image)]); }
    catch { throw new GeometryError('INVALID_RASTER'); }
    for (let attempt = 0; attempt < 2; attempt++) {
      let usage: GeometryExtraction['usage'] | undefined;
      try {
        // Read the raw Message before JSON parsing so a billable but invalid answer retains usage.
        const response = await client.messages.create({
          model, max_tokens: VISION_MAX_OUTPUT_TOKENS,
          system: DRAWING_EXTRACTION_PROMPT,
          messages: [{ role: 'user', content: [
            { type: 'text', text: `Drawing area: ${frame.width} by ${frame.height} pixels inside a ${frame.margin}-pixel white ruler margin. Magenta rulers marked every ${frame.gridStep} pixels give drawing coordinates; (0,0) is the drawing's top-left corner inside the margin. Return every coordinate in this drawing coordinate system. Extract doors, corridors, entrances, exits and rooms with dimension evidence.\n\n${categoryText(categories)}` },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: framed.toString('base64') } },
          ] }],
          output_config: { format: zodOutputFormat(VisionOutputSchema) },
        }, { maxRetries: 0, timeout: 180_000 });
        // Gateways may report prompt-cache tokens separately; all of them are billable input.
        const inputTokens = response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
        usage = { model, inputTokens, outputTokens: response.usage.output_tokens, cacheHit: false };
        if (response.stop_reason === 'max_tokens') throw new GeometryError('VISION_OUTPUT_TRUNCATED');
        if (response.stop_reason === 'refusal') throw new GeometryError('VISION_REFUSED');
        if (response.stop_reason !== 'end_turn') throw new GeometryError('VISION_SCHEMA_INVALID');
        const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
        let output: unknown;
        try { output = JSON.parse(text); } catch { throw new GeometryError('VISION_SCHEMA_INVALID'); }
        const answer = cleanVisionOutput(output);
        if (!answer) throw new GeometryError('VISION_SCHEMA_INVALID');
        const refined = refineGeometry(withinRaster(frameToRaster(allowedSubtypes(answer, categories), frame, width, height), width, height), pixels);
        return { output: cleanVisionOutput(refined)!, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
      } catch (error) {
        if (error instanceof GeometryError) throw new GeometryError(error.code, error.retryable, usage);
        const failure = providerFailure(error);
        if (failure.retryable && attempt === 0) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
        throw new GeometryError(failure.retryable ? 'VISION_UNAVAILABLE' : failure.code, failure.retryable, usage);
      }
    }
    throw new GeometryError('VISION_UNAVAILABLE', true);
  } };
}
