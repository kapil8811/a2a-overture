import * as crypto from 'crypto';

/**
 * Agent Card signature verification.
 *
 * Supports JWS JSON Serialization with public keys sourced from:
 * - Inline `jwk` in the protected header
 * - `x5c` certificate chain in the protected header
 * - `jku` (JSON Key URL) + `kid` — fetches keys from remote URL
 *
 * Handles both DER and IEEE P1363 (raw R||S) ECDSA signature formats,
 * and canonicalizes the card payload per RFC 8785 (JCS) conventions.
 */

export interface SignatureVerificationResult {
  valid: boolean;
  signatureCount: number;
  verified: number;
  errors: string[];
}

/** Base64url decode to Buffer */
function base64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

/** Map JWS algorithm to Node.js algorithm name */
const algMap: Record<string, string> = {
  'RS256': 'RSA-SHA256',
  'RS384': 'RSA-SHA384',
  'RS512': 'RSA-SHA512',
  'ES256': 'SHA256',
  'ES384': 'SHA384',
  'ES512': 'SHA512',
  'PS256': 'RSA-SHA256',
  'PS384': 'RSA-SHA384',
  'PS512': 'RSA-SHA512',
  'EdDSA': 'ed25519',
};

/** EC algorithms that use IEEE P1363 signature format in JWS */
const ecAlgorithms = new Set(['ES256', 'ES384', 'ES512']);

/** Recursively sort object keys for canonical JSON */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

/** Recursively remove empty strings, empty arrays, empty objects, and null/undefined */
function cleanEmpty(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    const cleaned = obj.map(cleanEmpty).filter(v => v != null);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (obj && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const cv = cleanEmpty(v);
      if (cv != null) cleaned[k] = cv;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  if (typeof obj === 'string' && obj === '') return undefined;
  return obj;
}

/**
 * Build a canonical payload for signature verification.
 * Matches the Python a2a-sdk canonicalize_agent_card behavior:
 * - Remove `signatures`
 * - Remove known default fields (preferredTransport, protocolVersion)
 * - Remove empty values
 * - Sort keys recursively
 * - Compact JSON serialization
 */
function canonicalizeAgentCard(card: Record<string, unknown>): string {
  const { signatures: _s, preferredTransport: _pt, protocolVersion: _pv, ...rest } = card;
  const cleaned = cleanEmpty(rest);
  return JSON.stringify(sortKeys(cleaned));
}

/** Fetch a public key from a JKU endpoint, looking up by kid */
async function fetchJkuKey(jku: string, kid: string): Promise<crypto.KeyObject> {
  const url = new URL(jku);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Invalid JKU protocol: ${url.protocol}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(jku, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`JKU fetch failed: HTTP ${response.status}`);
    }
    const keys = await response.json() as Record<string, unknown>;

    // Support two formats:
    // 1. JWK Set: { keys: [{ kid, kty, ... }] }
    // 2. PEM Map: { "kid": "-----BEGIN PUBLIC KEY-----..." }
    if (keys.keys && Array.isArray(keys.keys)) {
      const jwk = (keys.keys as Array<Record<string, unknown>>).find(k => k.kid === kid);
      if (!jwk) throw new Error(`Key "${kid}" not found in JWK Set at ${jku}`);
      return crypto.createPublicKey({ key: jwk, format: 'jwk' });
    }

    // PEM map format (used by Python a2a-sdk signing sample)
    const pem = keys[kid] as string | undefined;
    if (pem && typeof pem === 'string' && pem.includes('-----BEGIN')) {
      return crypto.createPublicKey(pem);
    }

    throw new Error(`Key "${kid}" not found at ${jku}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Verify a cryptographic signature with proper encoding for the algorithm */
function verifySignatureBytes(
  alg: string,
  nodeAlg: string,
  publicKey: crypto.KeyObject,
  signingInput: string,
  signatureBytes: Buffer,
): boolean {
  if (ecAlgorithms.has(alg)) {
    // JWS uses IEEE P1363 (raw R||S) for EC signatures — try that first
    try {
      if (crypto.verify(
        nodeAlg,
        Buffer.from(signingInput),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signatureBytes,
      )) return true;
    } catch { /* fall through */ }
    // Fallback to DER encoding
    try {
      const verifier = crypto.createVerify(nodeAlg);
      verifier.update(signingInput);
      if (verifier.verify(publicKey, signatureBytes)) return true;
    } catch { /* fall through */ }
    return false;
  }
  // RSA and EdDSA use the standard DER encoding
  const verifier = crypto.createVerify(nodeAlg);
  verifier.update(signingInput);
  return verifier.verify(publicKey, signatureBytes);
}

/** Verify a single JWS signature against the Agent Card payload */
async function verifyJwsSignature(
  payloads: string[],
  protectedHeader: string,
  signature: string,
): Promise<{ valid: boolean; algorithm?: string; error?: string }> {
  try {
    const headerJson = JSON.parse(base64urlDecode(protectedHeader).toString('utf-8'));
    const alg = headerJson.alg as string;

    if (!alg) {
      return { valid: false, error: 'Missing "alg" in protected header' };
    }

    // Extract the public key from the header (jwk, x5c, or jku+kid)
    let publicKey: crypto.KeyObject | undefined;

    if (headerJson.jwk) {
      publicKey = crypto.createPublicKey({ key: headerJson.jwk, format: 'jwk' });
    } else if (headerJson.x5c && Array.isArray(headerJson.x5c) && headerJson.x5c.length > 0) {
      const certDer = Buffer.from(headerJson.x5c[0], 'base64');
      const certPem = `-----BEGIN CERTIFICATE-----\n${certDer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
      publicKey = crypto.createPublicKey(certPem);
    } else if (headerJson.jku && headerJson.kid) {
      publicKey = await fetchJkuKey(headerJson.jku, headerJson.kid);
    }

    if (!publicKey) {
      return { valid: false, error: 'No public key found in protected header (expected jwk, x5c, or jku+kid)' };
    }

    const nodeAlg = algMap[alg];
    if (!nodeAlg) {
      return { valid: false, error: `Unsupported algorithm: ${alg}` };
    }

    const signatureBytes = base64urlDecode(signature);

    // Try each payload candidate (canonical first, then raw)
    for (const payload of payloads) {
      const signingInput = `${protectedHeader}.${payload}`;
      try {
        if (verifySignatureBytes(alg, nodeAlg, publicKey, signingInput, signatureBytes)) {
          return { valid: true, algorithm: alg };
        }
      } catch {
        // Try next payload
      }
    }

    return { valid: false, algorithm: alg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Verification error: ${msg}` };
  }
}

/**
 * Verify all signatures on an Agent Card.
 * Supports async key resolution via JKU URLs.
 * Tries both canonical (RFC 8785-style) and raw payloads.
 *
 * @param agentCard - The raw Agent Card object
 * @returns Verification result with details for each signature
 */
export async function verifyAgentCardSignatures(agentCard: Record<string, unknown>): Promise<SignatureVerificationResult> {
  const signatures = agentCard.signatures as Array<Record<string, unknown>> | undefined;

  if (!signatures || !Array.isArray(signatures) || signatures.length === 0) {
    return { valid: true, signatureCount: 0, verified: 0, errors: [] };
  }

  const errors: string[] = [];
  let verified = 0;

  // Build payload candidates:
  // 1. Canonical (sorted keys, cleaned empty values, no defaults) — matches Python a2a-sdk
  const canonicalPayload = Buffer.from(canonicalizeAgentCard(agentCard)).toString('base64url');
  // 2. Raw (card minus just the signatures field) — for inline-JWK signers
  const { signatures: _sigs, ...cardWithoutSignatures } = agentCard;
  const rawPayload = Buffer.from(JSON.stringify(cardWithoutSignatures)).toString('base64url');

  const payloads = [canonicalPayload, rawPayload];

  // Only verify the most recent signature (signers append on each request)
  // But if only one exists, verify that one
  const sigsToVerify = signatures.length === 1 ? [signatures[0]] : [signatures[signatures.length - 1]];

  for (let i = 0; i < sigsToVerify.length; i++) {
    const sig = sigsToVerify[i];
    const protectedHeader = sig.protected as string;
    const signatureValue = sig.signature as string;

    if (!protectedHeader || !signatureValue) {
      errors.push(`signatures[${i}]: missing "protected" or "signature" field`);
      continue;
    }

    const result = await verifyJwsSignature(payloads, protectedHeader, signatureValue);
    if (result.valid) {
      verified++;
    } else {
      errors.push(`signatures[${i}]: ${result.error || 'verification failed'}${result.algorithm ? ` (alg: ${result.algorithm})` : ''}`);
    }
  }

  return {
    valid: errors.length === 0,
    signatureCount: signatures.length,
    verified,
    errors,
  };
}
