import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import { verifyAgentCardSignatures } from '../src/core/signature';

/** Helper: base64url encode */
function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

/** Helper: generate an EC key pair and sign an agent card */
function signAgentCard(card: Record<string, unknown>): {
  signedCard: Record<string, unknown>;
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });

  const jwk = publicKey.export({ format: 'jwk' });
  const protectedHeader = base64urlEncode(JSON.stringify({ alg: 'ES256', jwk }));
  const payload = base64urlEncode(JSON.stringify(card));
  const signingInput = `${protectedHeader}.${payload}`;

  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  const signature = base64urlEncode(signer.sign(privateKey));

  const signedCard = {
    ...card,
    signatures: [{ protected: protectedHeader, signature }],
  };

  return { signedCard, publicKey, privateKey };
}

describe('verifyAgentCardSignatures', () => {
  const baseCard = {
    name: 'Test Agent',
    description: 'A test agent',
    version: '1.0.0',
    supportedInterfaces: [{ url: 'http://localhost:3000', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' }],
    capabilities: { streaming: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{ id: 'echo', name: 'Echo', description: 'Echoes back', tags: ['test'] }],
  };

  it('should return valid with zero signatures when no signatures present', async () => {
    const result = await verifyAgentCardSignatures(baseCard);
    expect(result.valid).toBe(true);
    expect(result.signatureCount).toBe(0);
    expect(result.verified).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should return valid with zero signatures for empty signatures array', async () => {
    const result = await verifyAgentCardSignatures({ ...baseCard, signatures: [] });
    expect(result.valid).toBe(true);
    expect(result.signatureCount).toBe(0);
  });

  it('should verify a valid EC P-256 (ES256) signature', async () => {
    const { signedCard } = signAgentCard(baseCard);
    const result = await verifyAgentCardSignatures(signedCard);
    expect(result.valid).toBe(true);
    expect(result.signatureCount).toBe(1);
    expect(result.verified).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail verification with a tampered card', async () => {
    const { signedCard } = signAgentCard(baseCard);
    // Tamper with the card after signing
    (signedCard as Record<string, unknown>).name = 'Tampered Agent';
    const result = await verifyAgentCardSignatures(signedCard);
    expect(result.valid).toBe(false);
    expect(result.verified).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report error for signature with missing protected header', async () => {
    const card = {
      ...baseCard,
      signatures: [{ signature: 'some-signature' }],
    };
    const result = await verifyAgentCardSignatures(card);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing "protected" or "signature" field');
  });

  it('should report error for signature with missing signature value', async () => {
    const card = {
      ...baseCard,
      signatures: [{ protected: 'some-header' }],
    };
    const result = await verifyAgentCardSignatures(card);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing "protected" or "signature" field');
  });

  it('should report error for unsupported algorithm', async () => {
    const protectedHeader = base64urlEncode(JSON.stringify({ alg: 'UNSUPPORTED', jwk: {} }));
    const card = {
      ...baseCard,
      signatures: [{ protected: protectedHeader, signature: 'fake' }],
    };
    const result = await verifyAgentCardSignatures(card);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report error for missing public key in header', async () => {
    const protectedHeader = base64urlEncode(JSON.stringify({ alg: 'ES256' }));
    const card = {
      ...baseCard,
      signatures: [{ protected: protectedHeader, signature: 'fake' }],
    };
    const result = await verifyAgentCardSignatures(card);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('No public key found');
  });

  it('should handle RSA key pair (RS256)', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const jwk = publicKey.export({ format: 'jwk' });
    const protectedHeader = base64urlEncode(JSON.stringify({ alg: 'RS256', jwk }));
    const payload = base64urlEncode(JSON.stringify(baseCard));
    const signingInput = `${protectedHeader}.${payload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = base64urlEncode(signer.sign(privateKey));

    const signedCard = {
      ...baseCard,
      signatures: [{ protected: protectedHeader, signature }],
    };

    const result = await verifyAgentCardSignatures(signedCard);
    expect(result.valid).toBe(true);
    expect(result.verified).toBe(1);
  });
});
