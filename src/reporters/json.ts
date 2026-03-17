import { ComplianceReport } from '../core/types';
import { ValidationResult } from '../core/validator';

export function toJsonReport(report: ComplianceReport): string {
  return JSON.stringify(report, null, 2);
}

export function toJsonValidation(result: ValidationResult, card?: unknown): string {
  return JSON.stringify({
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    card,
  }, null, 2);
}
