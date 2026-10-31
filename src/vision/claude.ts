import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { VisionOutputSchema, type VisionRunner } from './schema';
import { GeometryError, type GeometryExtraction } from '../geometry/types';
import { providerFailure } from './provider-errors';
import { DRAWING_EXTRACTION_PROMPT } from './prompt';
export const PROMPT_VERSION = 'geometry-v2-technical-plan';

/** Inject a server-owned client. SDK retries are disabled so the adapter owns the retry bound. */
export function createClaudeVisionRunner(client: Anthropic, model: string): VisionRunner {
  return { model, async run(image, width, height) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let usage: GeometryExtraction['usage'] | undefined;
      try {
        // Read the raw Message before JSON parsing so a billable but invalid answer retains usage.
        const response = await client.messages.create({
          model, max_tokens: 6000,
          system: DRAWING_EXTRACTION_PROMPT,
          messages: [{ role: 'user', content: [
            { type: 'text', text: `Selected plan raster: ${width} by ${height} pixels. Extract doors, corridors, entrances, exits and rooms with dimension evidence.` },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(image).toString('base64') } },
          ] }],
          output_config: { format: zodOutputFormat(VisionOutputSchema) },
        }, { maxRetries: 0, timeout: 60_000 });
        usage = { model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheHit: false };
        if (response.stop_reason === 'max_tokens') throw new GeometryError('VISION_OUTPUT_TRUNCATED');
        if (response.stop_reason === 'refusal') throw new GeometryError('VISION_REFUSED');
        if (response.stop_reason !== 'end_turn') throw new GeometryError('VISION_SCHEMA_INVALID');
        const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
        let output: unknown;
        try { output = JSON.parse(text); } catch { throw new GeometryError('VISION_SCHEMA_INVALID'); }
        const parsed = VisionOutputSchema.safeParse(output);
        if (!parsed.success) throw new GeometryError('VISION_SCHEMA_INVALID');
        return { output: parsed.data, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
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
