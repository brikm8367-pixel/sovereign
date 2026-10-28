/**
 * E2EE Key Backup — lets a user export their private key as an encrypted file
 * (protected by a passphrase they choose) and restore it on another device.
 *
 * The exported blob is AES-GCM encrypted with a PBKDF2-derived key, so the file
 * is useless without the passphrase. On import we re-store the keys in this
 * device's encrypted IndexedDB and re-register the public key.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  deriveKeyFromPassword,
  encryptBlobAESGCM,
  decryptBlobAESGCM,
  getOrCreateDeviceSecret,
  getOrCreateDeviceId,
} from './cryptoHelpers';
import { getStoredKeysSecure, storeKeysSecure } from './encryption';

const BACKUP_MAGIC = 'sovereign-e2e-key-backup';

export interface E2EBackupFile {
  app: 'sovereign';
  type: typeof BACKUP_MAGIC;
  v: 1;
  salt: string;
  blob: string;
  createdAt: string;
}

export type ExportResult =
  | { success: true; file: E2EBackupFile }
  | { success: false; reason: 'no_local_keys' | 'export_failed' };

export type ImportResult =
  | { success: true }
  | { success: false; reason: 'invalid_file' | 'wrong_passphrase' | 'import_failed' };

/** Export the local private/public key pair as a passphrase-encrypted backup file. */
export async function exportKeyBackup(passphrase: string): Promise<ExportResult> {
  try {
    const keys = await getStoredKeysSecure();
    if (!keys) return { success: false, reason: 'no_local_keys' };

    const { key, saltBase64 } = await deriveKeyFromPassword(passphrase);
    const blob = await encryptBlobAESGCM(
      key,
      JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey }),
    );

    return {
      success: true,
      file: {
        app: 'sovereign',
        type: BACKUP_MAGIC,
        v: 1,
        salt: saltBase64,
        blob,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    console.error('[E2E] export_failed', e);
    return { success: false, reason: 'export_failed' };
  }
}

/** Restore keys from a backup file + passphrase, then re-register the device key. */
export async function importKeyBackup(
  raw: string,
  passphrase: string,
): Promise<ImportResult> {
  let parsed: E2EBackupFile;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, reason: 'invalid_file' };
  }
  if (!parsed || parsed.type !== BACKUP_MAGIC || !parsed.salt || !parsed.blob) {
    return { success: false, reason: 'invalid_file' };
  }

  let publicKey: string;
  let privateKey: string;
  try {
    const { key } = await deriveKeyFromPassword(passphrase, parsed.salt);
    const decrypted = await decryptBlobAESGCM(key, parsed.blob);
    const obj = JSON.parse(decrypted);
    publicKey = obj.publicKey;
    privateKey = obj.privateKey;
    if (!publicKey || !privateKey) throw new Error('missing keys');
  } catch {
    return { success: false, reason: 'wrong_passphrase' };
  }

  try {
    // Store restored keys encrypted-at-rest under this device's secret.
    await storeKeysSecure(publicKey, privateKey, getOrCreateDeviceSecret());

    // Re-register this device's public key so others can encrypt to us.
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (userId) {
      await supabase.from('device_keys' as any).upsert(
        {
          user_id: userId,
          device_id: getOrCreateDeviceId(),
          public_key: publicKey,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' },
      );
    }
    return { success: true };
  } catch (e) {
    console.error('[E2E] import_failed', e);
    return { success: false, reason: 'import_failed' };
  }
}

/** Upload encrypted key backup to cloud (encrypted with user password). */
export async function uploadKeyBackup(password: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const keys = await getStoredKeysSecure();
    if (!keys) return { success: false, error: 'no_local_keys' };
    await supabase.from('device_keys' as any).upsert({ user_id: userId, device_id: getOrCreateDeviceId(), public_key: keys.publicKey, last_seen: new Date().toISOString() }, { onConflict: 'user_id,device_id' });
    await supabase.from('profiles').upsert({ id: userId, public_key: keys.publicKey }, { onConflict: 'id' });
    const { key, saltBase64 } = await deriveKeyFromPassword(password);
    const encryptedPrivateKey = await encryptBlobAESGCM(key, keys.privateKey);
    const encryptedPublicKey = await encryptBlobAESGCM(key, keys.publicKey);
    const { error } = await supabase.from('encrypted_key_backups' as any).upsert({
      user_id: userId,
      encrypted_private_key: encryptedPrivateKey,
      encrypted_public_key: encryptedPublicKey,
      salt: saltBase64,
      kdf_iterations: 200000,
      version: 1,
    }, { onConflict: 'user_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'upload_failed' };
  }
}

/** Download encrypted key backup from cloud and restore locally if needed. */
export async function downloadKeyBackup(password: string, userId: string): Promise<{ success: boolean; restored?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.from('encrypted_key_backups' as any).select('encrypted_private_key, encrypted_public_key, salt').eq('user_id', userId).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'no_backup_found' };
    const { key } = await deriveKeyFromPassword(password, data.salt);
    let privateKey: string;
    let publicKey: string;
    try {
      privateKey = await decryptBlobAESGCM(key, data.encrypted_private_key);
      publicKey = await decryptBlobAESGCM(key, data.encrypted_public_key);
    } catch {
      return { success: false, error: 'wrong_password' };
    }
    const existing = await getStoredKeysSecure();
    if (existing && existing.privateKey === privateKey) return { success: true, restored: false };
    await storeKeysSecure(publicKey, privateKey, getOrCreateDeviceSecret());
    await supabase.from('device_keys' as any).upsert({
      user_id: userId,
      device_id: getOrCreateDeviceId(),
      public_key: publicKey,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' });
    return { success: true, restored: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'download_failed' };
  }
}

/** Trigger a browser download of the backup file. */
export function downloadBackupFile(file: E2EBackupFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sovereign-key-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
