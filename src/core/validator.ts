import { AgentCard, AgentInterface, AgentSkill } from './types';

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateAgentCard(card: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!card || typeof card !== 'object') {
    errors.push({ path: '', message: 'Agent Card must be a JSON object', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  const c = card as Record<string, unknown>;

  // Required top-level fields
  requireString(c, 'name', errors);
  requireString(c, 'description', errors);
  requireString(c, 'version', errors);

  // supportedInterfaces
  if (!Array.isArray(c.supportedInterfaces) || c.supportedInterfaces.length === 0) {
    errors.push({ path: 'supportedInterfaces', message: 'Must be a non-empty array of AgentInterface objects', severity: 'error' });
  } else {
    (c.supportedInterfaces as unknown[]).forEach((iface, i) => {
      validateInterface(iface, `supportedInterfaces[${i}]`, errors, warnings);
    });
  }

  // capabilities
  if (!c.capabilities || typeof c.capabilities !== 'object') {
    errors.push({ path: 'capabilities', message: 'capabilities is required and must be an object', severity: 'error' });
  }

  // defaultInputModes
  if (!Array.isArray(c.defaultInputModes) || c.defaultInputModes.length === 0) {
    errors.push({ path: 'defaultInputModes', message: 'Must be a non-empty array of media type strings', severity: 'error' });
  } else {
    validateMediaTypes(c.defaultInputModes as string[], 'defaultInputModes', warnings);
  }

  // defaultOutputModes
  if (!Array.isArray(c.defaultOutputModes) || c.defaultOutputModes.length === 0) {
    errors.push({ path: 'defaultOutputModes', message: 'Must be a non-empty array of media type strings', severity: 'error' });
  } else {
    validateMediaTypes(c.defaultOutputModes as string[], 'defaultOutputModes', warnings);
  }

  // skills
  if (!Array.isArray(c.skills)) {
    errors.push({ path: 'skills', message: 'skills is required and must be an array', severity: 'error' });
  } else {
    (c.skills as unknown[]).forEach((skill, i) => {
      validateSkill(skill, `skills[${i}]`, errors, warnings);
    });
  }

  // Optional fields validation
  if (c.provider !== undefined) {
    validateProvider(c.provider, errors);
  }

  if (c.documentationUrl !== undefined) {
    validateUrl(c.documentationUrl, 'documentationUrl', warnings);
  }

  if (c.iconUrl !== undefined) {
    validateUrl(c.iconUrl, 'iconUrl', warnings);
  }

  // Security schemes
  if (c.securitySchemes !== undefined) {
    if (typeof c.securitySchemes !== 'object' || Array.isArray(c.securitySchemes)) {
      errors.push({ path: 'securitySchemes', message: 'Must be an object mapping scheme names to SecurityScheme objects', severity: 'error' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateInterface(iface: unknown, path: string, errors: ValidationIssue[], warnings: ValidationIssue[]) {
  if (!iface || typeof iface !== 'object') {
    errors.push({ path, message: 'Must be an AgentInterface object', severity: 'error' });
    return;
  }
  const f = iface as Record<string, unknown>;

  requireString(f, 'url', errors, path);
  requireString(f, 'protocolBinding', errors, path);
  requireString(f, 'protocolVersion', errors, path);

  if (typeof f.url === 'string') {
    validateUrl(f.url, `${path}.url`, warnings);
  }

  const validBindings = ['JSONRPC', 'GRPC', 'HTTP+JSON'];
  if (typeof f.protocolBinding === 'string' && !validBindings.includes(f.protocolBinding)) {
    warnings.push({
      path: `${path}.protocolBinding`,
      message: `Non-standard protocol binding "${f.protocolBinding}". Standard bindings: ${validBindings.join(', ')}`,
      severity: 'warning',
    });
  }
}

function validateSkill(skill: unknown, path: string, errors: ValidationIssue[], warnings: ValidationIssue[]) {
  if (!skill || typeof skill !== 'object') {
    errors.push({ path, message: 'Must be an AgentSkill object', severity: 'error' });
    return;
  }
  const s = skill as Record<string, unknown>;

  requireString(s, 'id', errors, path);
  requireString(s, 'name', errors, path);
  requireString(s, 'description', errors, path);

  if (!Array.isArray(s.tags)) {
    errors.push({ path: `${path}.tags`, message: 'tags is required and must be an array of strings', severity: 'error' });
  }

  if (s.examples !== undefined && !Array.isArray(s.examples)) {
    warnings.push({ path: `${path}.examples`, message: 'examples should be an array of strings', severity: 'warning' });
  }

  if (s.inputModes !== undefined) {
    if (!Array.isArray(s.inputModes)) {
      warnings.push({ path: `${path}.inputModes`, message: 'inputModes should be an array of media type strings', severity: 'warning' });
    } else {
      validateMediaTypes(s.inputModes as string[], `${path}.inputModes`, warnings);
    }
  }

  if (s.outputModes !== undefined) {
    if (!Array.isArray(s.outputModes)) {
      warnings.push({ path: `${path}.outputModes`, message: 'outputModes should be an array of media type strings', severity: 'warning' });
    } else {
      validateMediaTypes(s.outputModes as string[], `${path}.outputModes`, warnings);
    }
  }
}

function validateProvider(provider: unknown, errors: ValidationIssue[]) {
  if (!provider || typeof provider !== 'object') {
    errors.push({ path: 'provider', message: 'Must be an AgentProvider object', severity: 'error' });
    return;
  }
  const p = provider as Record<string, unknown>;
  requireString(p, 'url', errors, 'provider');
  requireString(p, 'organization', errors, 'provider');
}

function validateMediaTypes(types: string[], path: string, warnings: ValidationIssue[]) {
  const mediaTypeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/;
  for (const t of types) {
    if (typeof t !== 'string' || !mediaTypeRegex.test(t)) {
      warnings.push({
        path,
        message: `"${t}" does not look like a valid media type (e.g., "text/plain", "application/json")`,
        severity: 'warning',
      });
    }
  }
}

function validateUrl(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== 'string') return;
  try {
    new URL(value);
  } catch {
    issues.push({ path, message: `"${value}" is not a valid URL`, severity: 'warning' });
  }
}

function requireString(obj: Record<string, unknown>, field: string, errors: ValidationIssue[], parentPath?: string) {
  const path = parentPath ? `${parentPath}.${field}` : field;
  if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
    errors.push({ path, message: `${field} is required and must be a non-empty string`, severity: 'error' });
  }
}
