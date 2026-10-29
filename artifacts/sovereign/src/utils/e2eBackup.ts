/**
 * E2EE Key Backup — lets a user export their private key as an encrypted file
 * (protected by a passphrase they choose) and restore it on another device.
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

export async function exportKeyBackup(passphrase: string, userId: string): Promise<ExportResult> {
  try {
    const keys = await getStoredKeysSecure(userId);
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

export async function importKeyBackup(
  raw: string,
  passphrase: string,
  userId: string,
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
    await storeKeysSecure(publicKey, privateKey, getOrCreateDeviceSecret(userId), userId);

    await supabase.from('device_keys' as any).upsert(
      {
        user_id: userId,
        device_id: getOrCreateDeviceId(),
        public_key: publicKey,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' },
    );
    return { success: true };
  } catch (e) {
    console.error('[E2E] import_failed', e);
    return { success: false, reason: 'import_failed' };
  }
}

export async function uploadKeyBackup(password: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const keys = await getStoredKeysSecure(userId);
    if (!keys) return { success: false, error: 'no_local_keys' };
    await supabase.from('device_keys' as any).upsert({ user_id: userId, device_id: getOrCreateDeviceId(), public_key: keys.publicKey, last_seen: new Date().toISOString() }, { onConflict: 'user_id,device_id' });
    const { key, saltBase64 } = await deriveKeyFromPassword(password);
    const encryptedPrivateKey = await encryptBlobAESGCM(key, JSON.stringify({ privateKey: keys.privateKey, deviceId: getOrCreateDeviceId() }));
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

export async function downloadKeyBackup(password: string, userId: string): Promise<{ success: boolean; restored?: boolean; error?: string }> {
  try {
    const { data: rawData, error } = await supabase.from('encrypted_key_backups' as any).select('encrypted_private_key, encrypted_public_key, salt').eq('user_id', userId).maybeSingle();
    const data = rawData as any;
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'no_backup_found' };
    const { key } = await deriveKeyFromPassword(password, data.salt);
    let privateKeyRaw: string;
    let publicKey: string;
    try {
      privateKeyRaw = await decryptBlobAESGCM(key, data.encrypted_private_key);
      publicKey = await decryptBlobAESGCM(key, data.encrypted_public_key);
    } catch {
      return { success: false, error: 'wrong_password' };
    }
    let privateKey: string;
    let recoveredDeviceId: string;
    try {
      const parsed = JSON.parse(privateKeyRaw);
      if (parsed && typeof parsed === 'object' && parsed.privateKey && parsed.deviceId) {
        privateKey = parsed.privateKey;
        recoveredDeviceId = parsed.deviceId;
      } else {
        throw new Error('invalid format');
      }
    } catch {
      privateKey = privateKeyRaw;
      recoveredDeviceId = getOrCreateDeviceId();
    }
    const existing = await getStoredKeysSecure(userId);
    if (existing && existing.privateKey === privateKey) return { success: true, restored: false };
    const currentDeviceId = getOrCreateDeviceId();
    if (recoveredDeviceId !== currentDeviceId) {
      localStorage.setItem('directly_device_id_v1', recoveredDeviceId);
    }
    await storeKeysSecure(publicKey, privateKey, getOrCreateDeviceSecret(userId), userId);
    await supabase.from('device_keys' as any).upsert({
      user_id: userId,
      device_id: recoveredDeviceId,
      public_key: publicKey,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' });
    return { success: true, restored: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'download_failed' };
  }
}

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
