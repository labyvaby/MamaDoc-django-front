import type { CalcModel } from '../types';
import type { CalcStrategy } from './types';
import { legacyV1Strategy } from './legacyV1Strategy';

// Registry: add one line here when a new strategy is created.
// Strategy files are co-located in this folder.
const registry = new Map<CalcModel, CalcStrategy>([
  ['legacy_v1', legacyV1Strategy],
]);

export function getStrategy(model: CalcModel): CalcStrategy {
  const strategy = registry.get(model);
  if (!strategy) {
    throw new Error(
      `Unknown payroll calc model: "${model}". ` +
      `Register it in src/features/payroll/strategies/index.ts.`
    );
  }
  return strategy;
}
