import { gcm } from "@noble/ciphers/aes";
import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils";
import { getRandomBytesAsync } from "expo-crypto";

export const LOCAL_INVENTORY_KEY_BYTES = 32;
const LOCAL_INVENTORY_IV_BYTES = 12;

export type LocalInventoryEnvelope = {
  alg: "A256GCM";
  ivB64u: string;
  ciphertextB64u: string;
  keyVersion: 1;
  payloadVersion: 1;
  aadVersion: 1;
  revision: number;
  createdAt: string;
};

export type LocalInventoryCipherContext = {
  practiceId: string;
  revision: number;
};

export interface LocalInventoryCipher {
  encrypt(key: Uint8Array, plaintext: string, context: LocalInventoryCipherContext): Promise<LocalInventoryEnvelope>;
  decrypt(key: Uint8Array, envelope: LocalInventoryEnvelope, context: LocalInventoryCipherContext): Promise<string>;
}

export const localInventoryCipher: LocalInventoryCipher = {
  async encrypt(key, plaintext, context) {
    assertKey(key);
    const createdAt = new Date().toISOString();
    const envelopeMetadata = {
      alg: "A256GCM" as const,
      keyVersion: 1 as const,
      payloadVersion: 1 as const,
      aadVersion: 1 as const,
      revision: context.revision,
      createdAt
    };
    const iv = await getRandomBytesAsync(LOCAL_INVENTORY_IV_BYTES);
    const aad = inventoryEnvelopeAad(context.practiceId, envelopeMetadata);
    const ciphertext = gcm(key, iv, aad).encrypt(utf8ToBytes(plaintext));

    return {
      ...envelopeMetadata,
      ivB64u: bytesToBase64Url(iv),
      ciphertextB64u: bytesToBase64Url(ciphertext)
    };
  },

  async decrypt(key, envelope, context) {
    assertKey(key);
    assertEnvelope(envelope, context.revision);
    const aad = inventoryEnvelopeAad(context.practiceId, envelope);
    const plaintext = gcm(key, base64UrlToBytes(envelope.ivB64u), aad)
      .decrypt(base64UrlToBytes(envelope.ciphertextB64u));
    return bytesToUtf8(plaintext);
  }
};

export function parseLocalInventoryEnvelope(value: string): LocalInventoryEnvelope | null {
  if (value.length > MAX_ENVELOPE_LENGTH) return null;
  try {
    const candidate = JSON.parse(value) as Partial<LocalInventoryEnvelope>;
    if (
      candidate.alg !== "A256GCM"
      || candidate.keyVersion !== 1
      || candidate.payloadVersion !== 1
      || candidate.aadVersion !== 1
      || !Number.isSafeInteger(candidate.revision)
      || (candidate.revision ?? 0) < 1
      || typeof candidate.createdAt !== "string"
      || Number.isNaN(Date.parse(candidate.createdAt))
      || typeof candidate.ivB64u !== "string"
      || typeof candidate.ciphertextB64u !== "string"
    ) {
      return null;
    }
    const iv = base64UrlToBytes(candidate.ivB64u);
    const ciphertext = base64UrlToBytes(candidate.ciphertextB64u);
    if (iv.length !== LOCAL_INVENTORY_IV_BYTES || ciphertext.length < gcm.tagLength) return null;
    return candidate as LocalInventoryEnvelope;
  } catch {
    return null;
  }
}

export function inventoryEnvelopeAad(
  practiceId: string,
  metadata: Pick<LocalInventoryEnvelope, "alg" | "keyVersion" | "payloadVersion" | "aadVersion" | "revision" | "createdAt">
) {
  return utf8ToBytes(canonicalFields([
    "praxisshield-local-inventory",
    practiceId,
    metadata.alg,
    String(metadata.keyVersion),
    String(metadata.payloadVersion),
    String(metadata.aadVersion),
    String(metadata.revision),
    metadata.createdAt
  ]));
}

export function bytesToBase64Url(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const value = (a << 16) | (b << 8) | c;
    output += BASE64URL[(value >>> 18) & 63];
    output += BASE64URL[(value >>> 12) & 63];
    if (index + 1 < bytes.length) output += BASE64URL[(value >>> 6) & 63];
    if (index + 2 < bytes.length) output += BASE64URL[value & 63];
  }
  return output;
}

export function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) throw new Error("invalid_base64url");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    const index = BASE64URL.indexOf(char);
    if (index < 0) throw new Error("invalid_base64url");
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  const result = Uint8Array.from(bytes);
  if (bytesToBase64Url(result) !== value) throw new Error("invalid_base64url");
  return result;
}

function assertKey(key: Uint8Array) {
  if (key.length !== LOCAL_INVENTORY_KEY_BYTES) throw new Error("invalid_inventory_key");
}

function assertEnvelope(envelope: LocalInventoryEnvelope, expectedRevision: number) {
  if (envelope.revision !== expectedRevision) throw new Error("inventory_revision_mismatch");
  if (!parseLocalInventoryEnvelope(JSON.stringify(envelope))) throw new Error("invalid_inventory_envelope");
}

function canonicalFields(fields: string[]) {
  return fields.map((field) => `${utf8ToBytes(field).length}:${field}`).join("|");
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const MAX_ENVELOPE_LENGTH = 12 * 1024 * 1024;
