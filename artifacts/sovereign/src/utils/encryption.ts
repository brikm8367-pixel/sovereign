import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  deriveKeyFromPassword,
  encryptBlobAESGCM,
  decryptBlobAESGCM,
  getOrCreateDeviceSecret,
} from './cryptoHelpers';

const ALGO = 'AES-GCM';
const KEY_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
export const E2E_PREFIX = 'E2Ev1:';

// ---------- Per-user IndexedDB key helpers ----------
function idbKeys(userId: string) {
  return {
    pub: `directly_e2e_public_key_v2_${userId}`,
    blob: `directly_e2e_private_blob_v2_${userId}`,
    salt: `directly_e2e_private_salt_v2_${userId}`,
  };
}

// Legacy plaintext keys (will be migrated and cleared)
const LEGACY_PRIVATE = 'directly_e2e_private_key';
const LEGACY_PUBLIC = 'directly_e2e_public_key';

// ---------- Key generation & import ----------
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(KEY_ALGO, true, ['deriveKey']);
  const publicKeyRaw = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return {
    publicKey: JSON.stringify(publicKeyRaw),
    privateKey: JSON.stringify(privateKeyRaw),
  };
}

async function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', JSON.parse(jwkStr), KEY_ALGO, false, []);
}

async function importPrivateKey(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', JSON.parse(jwkStr), KEY_ALGO, false, ['deriveKey']);
}

async function deriveSharedKey(privateKeyStr: string, publicKeyStr: string): Promise<CryptoKey> {
  const privateKey = await importPrivateKey(privateKeyStr);
  const publicKey = await importPublicKey(publicKeyStr);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Message encryption ----------
export async function encryptMessage(
  plaintext: string,
  senderPrivateKey: string,
  recipientPublicKey: string
): Promise<string> {
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: ALGO, iv }, sharedKey, new TextEncoder().encode(plaintext));
  const ctBytes = new Uint8Array(ct);
  const combined = new Uint8Array(iv.length + ctBytes.length);
  combined.set(iv);
  combined.set(ctBytes, iv.length);
  return E2E_PREFIX + bytesToBase64(combined);
}

export async function decryptMessage(
  encrypted: string,
  recipientPrivateKey: string,
  senderPublicKey: string
): Promise<string> {
  const payload = encrypted.startsWith(E2E_PREFIX) ? encrypted.slice(E2E_PREFIX.length) : encrypted;
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderPublicKey);
  const combined = base64ToBytes(payload);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, sharedKey, ct);
  return new TextDecoder().decode(plain);
}

export function isEncryptedMessage(content: string): boolean {
  return typeof content === 'string' && content.startsWith(E2E_PREFIX);
}

// ---------- Encrypted-at-rest key storage (IndexedDB, per-user) ----------
export async function storeKeysSecure(publicKey: string, privateKey: string, passphrase: string, userId: string): Promise<void> { const testString = 'e2e-store-roundtrip'; try { const testEncrypted = await encryptMessage(testString, privateKey, publicKey); const testDecrypted = await decryptMessage(testEncrypted, privateKey, publicKey); if (testDecrypted !== testString) { throw new Error('roundtrip_mismatch'); } } catch (err) { console.error('[encryption] storeKeysSecure: key pair is INVALID — refusing to store', err); throw new Error('e2e_invalid_key_pair'); } const { key, saltBase64 } = await deriveKeyFromPassword(passphrase); const blob = await encryptBlobAESGCM(key, privateKey); const keys = idbKeys(userId); await idbSet(keys.pub, publicKey); await idbSet(keys.blob, blob); await idbSet(keys.salt, saltBase64); }

export async function getStoredKeysSecure(userId: string, passphrase?: string): Promise<{ publicKey: string; privateKey: string } | null> { const keys = idbKeys(userId); const pub = await idbGet<string>(keys.pub); const blob = await idbGet<string>(keys.blob); const salt = await idbGet<string>(keys.salt); if (!pub || !blob || !salt) return null; const pass = passphrase ?? getOrCreateDeviceSecret(userId); try { const { key } = await deriveKeyFromPassword(pass, salt); const privateKey = await decryptBlobAESGCM(key, blob); const testString = 'e2e-get-roundtrip'; const testEncrypted = await encryptMessage(testString, privateKey, pub); const testDecrypted = await decryptMessage(testEncrypted, privateKey, pub); if (testDecrypted !== testString) { console.warn('[encryption] getStoredKeysSecure: private key does NOT match public key — returning null'); return null; } return { publicKey: pub, privateKey }; } catch { return null; } }

export async function clearKeysSecure(userId: string): Promise<void> {
  const keys = idbKeys(userId);
  await idbDel(keys.pub);
  await idbDel(keys.blob);
  await idbDel(keys.salt);
  localStorage.removeItem(LEGACY_PRIVATE);
  localStorage.removeItem(LEGACY_PUBLIC);
}

/**
 * One-time migration: if old plaintext keys exist in localStorage, move them
 * into encrypted IndexedDB storage and wipe the originals.
 * Requires userId — if not provided, skip migration.
 */
export async function migrateLegacyKeysIfPresent(userId?: string): Promise<boolean> {
  const legacyPub = localStorage.getItem(LEGACY_PUBLIC);
  const legacyPriv = localStorage.getItem(LEGACY_PRIVATE);
  if (!legacyPub || !legacyPriv) return false;
  if (!userId) return false;
  await storeKeysSecure(legacyPub, legacyPriv, getOrCreateDeviceSecret(userId), userId);
  localStorage.removeItem(LEGACY_PUBLIC);
  localStorage.removeItem(LEGACY_PRIVATE);
  return true;
}
