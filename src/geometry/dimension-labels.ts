import { unitForMetric, type Metric } from '../domain/common';

const number = String.raw`\d+(?:[.,]\d+)?`;
const pair = new RegExp(`${number}\\s*(?:[/×xX]|\\r?\\n)\\s*${number}`, 'u');
const aliases: Record<string, string> = { m: 'm|м', cm: 'cm|цм|см', mm: 'mm|мм' };

/** The model's proposed value/unit must be supported by the quoted label, not convention. */
export function dimensionLabelIssue(input: {
  metric: Metric; value: number; unit: string; rawLabel: string;
  dimensionKind?: 'MEASURED_SPAN' | 'NOMINAL_OPENING' | 'UNCERTAIN';
}): string | undefined {
  if (input.dimensionKind === 'NOMINAL_OPENING') return 'Opening size is nominal; confirm the actual clear span.';
  if (input.dimensionKind === 'UNCERTAIN') return 'Dimension association is uncertain; confirm the selected span.';
  if (unitForMetric(input.metric) !== 'm') return undefined;
  if (pair.test(input.rawLabel)) return 'Dimension pair requires confirmation of units, association and actual clear span.';
  const units = aliases[input.unit];
  if (!units) return 'Dimension unit is unsupported; provide a confirmed measurement.';
  const explicit = new RegExp(`(?<![\\p{L}\\p{N}.,])(${number})\\s*(?:${units})(?![\\p{L}\\p{N}])`, 'giu');
  const matches = [...input.rawLabel.matchAll(explicit)];
  if (!matches.some((match) => Math.abs(Number(match[1].replace(',', '.')) - input.value) <= 1e-9 * Math.max(1, Math.abs(input.value)))) {
    return 'The quoted label does not establish this value and unit; confirm both.';
  }
  return undefined;
}
