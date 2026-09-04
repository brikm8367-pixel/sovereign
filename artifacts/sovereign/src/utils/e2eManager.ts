import { supabase } from '@/integrations/supabase/client';
import {
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  isEncryptedMessage,
  storeKeysSecure,
  getStoredKeysSecure,
  clearKeysSecure,
  migrateLegacyKeysIfPresent,
} from './encryption';
import { getOrCreateDeviceSecret, getOrCreateDeviceId, encryptSessionState, decryptSessionState } from './cryptoHelpers';
import { setCloudSyncHandler, getSession } from './signalProtocol';
import { set, get } from 'idb-keyval';

export type EncryptResult =
  | { success: true; payload: string }
  | { success: false; reason: 'no_local_keys' | 'recipient_no_e2e' | 'encryption_failed' };

export type DecryptResult =
  | { success: true; plaintext: string }
  | { success: false; reason: 'not_encrypted' | 'no_local_keys' | 'sender_no_key' | 'decryption_failed' };

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 300;
const OWN_MESSAGE_KEY_PREFIX = 'directly_own_msg_';

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

// Store sender's own plaintext copy in IndexedDB for later display
export async function storeOwnMessagePlaintext(messageId: string, plaintext: string): Promise<void> {
  try {
    await set(`${OWN_MESSAGE_KEY_PREFIX}${messageId}`, plaintext);
  } catch (err) {
    console.warn('[E2E] Failed to store own message plaintext', err);
  }
}

// Retrieve sender's own plaintext copy from IndexedDB
export async function getOwnMessagePlaintext(messageId: string): Promise<string | null> {
  try {
    const value = await get(`${OWN_MESSAGE_KEY_PREFIX}${messageId}`);
    return value ?? null;
  } catch (err) {
    console.warn('[E2E] Failed to get own message plaintext', err);
    return null;
  }
}

// Initialize E2E keys on login. Encrypted at rest. Registers public key in device_keys
// (does NOT overwrite profiles.public_key — each device gets its own row).
export async function initE2EKeys(userId: string, password?: string): Promise<void> {
  try {
    // 1. Migrate any legacy plaintext keys.
    await migrateLegacyKeysIfPresent();

    const passphrase = getOrCreateDeviceSecret();
    const deviceId = getOrCreateDeviceId();

    let keys = await getStoredKeysSecure(passphrase);

    if (!keys) {
      keys = await generateKeyPair();
      await storeKeysSecure(keys.publicKey, keys.privateKey, passphrase);
    }

    // Upsert this device's public key with retry (one row per device, never overwrites others).
    await withRetry(async () => {
      const { error } = await supabase
        .from('device_keys' as any)
        .upsert(
          {
            user_id: userId,
            device_id: deviceId,
            public_key: keys!.publicKey,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        );
      if (error) throw error;
    });

    // Backwards compatibility: ensure profiles.public_key has *some* key so older
    // recipients (that read profiles.public_key) can still encrypt to us.
    // Only set if profile currently has no public_key — do not overwrite existing.
    await withRetry(async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('public_key')
        .eq('id', userId)
        .single();
      
      if (!profile?.public_key) {
        const { error } = await supabase
          .from('profiles')
          .upsert(
            { id: userId, public_key: keys!.publicKey },
            { onConflict: 'id' }
          );
        if (error) throw error;
      }
    });

    // Restore cloud sessions if password is provided
    if (password) {
      await restoreCloudSessions(userId, password);
    }

    // Setup cloud sync handler
    setCloudSyncHandler(async (partnerId, state) => {
      if (!password) return { success: false, conflict: false };
      const encryptedState = await encryptSessionState(JSON.stringify(state), password);
      
      // Optimistic concurrency: check current version and update conditionally
      const { data: current } = await (supabase as any)
        .from('ratchet_sessions')
        .select('state_version')
        .eq('user_id', userId)
        .eq('partner_id', partnerId)
        .single();

      const currentVersion = current?.state_version || 0;
      const newVersion = state.version || 0;

      if (newVersion < currentVersion) {
        return { success: false, conflict: true };
      }

      const { error } = await (supabase as any).from('ratchet_sessions').upsert({
        user_id: userId,
        partner_id: partnerId,
        encrypted_state: encryptedState,
        state_version: newVersion,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,partner_id' });

      if (error) {
        console.warn('[E2E] Cloud sync upsert failed', error);
        return { success: false, conflict: false };
      }
      return { success: true, conflict: false };
    });

  } catch (e) {
    console.error('[E2E] initE2EKeys failed', e);
    throw e; // Re-throw so caller knows it failed
  }
}

// Restore sessions from cloud
async function restoreCloudSessions(userId: string, password: string) {
  try {
    const { data: cloudSessions } = await (supabase as any)
      .from('ratchet_sessions')
      .select('partner_id, encrypted_state, state_version')
      .eq('user_id', userId);

    if (!cloudSessions || cloudSessions.length === 0) return;

    const localSessions = JSON.parse(localStorage.getItem('directly_ratchet_sessions') || '{}');

    for (const cs of cloudSessions) {
      try {
        const decryptedStateStr = await decryptSessionState(cs.encrypted_state, password);
        const cloudState = JSON.parse(decryptedStateStr);
        
        const localState = localSessions[cs.partner_id];
        
        // Conflict resolution: adopt the state with the higher version
        if (!localState || (cloudState.version || 0) > (localState.version || 0)) {
          localSessions[cs.partner_id] = cloudState;
        }
      } catch (e) {
        console.warn('[E2E] Failed to decrypt/restore session for partner', cs.partner_id, e);
      }
    }

    localStorage.setItem('directly_ratchet_sessions', JSON.stringify(localSessions));
  } catch (e) {
    console.warn('[E2E] restoreCloudSessions failed', e);
  }
}

// Get recipient's most-recently-seen device public key (fallback to profile).
// Returns null if no key exists — caller must handle this (no auto-provisioning).
export async function getRecipientPublicKey(recipientId: string): Promise<string | null> {
  try {
    const result = (await withRetry(() =>
      (supabase as any)
        .from('device_keys')
        .select('public_key, last_seen')
        .eq('user_id', recipientId)
        .order('last_seen', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then((r: any) => r)
    )) as any;
    if (result?.data?.public_key) return result.data.public_key;
  } catch (err) {
    console.warn('[E2E] getRecipientPublicKey device_keys query failed', err);
  }
  try {
    const { data } = await supabase.from('profiles').select('public_key').eq('id', recipientId).single();
    if (data?.public_key) return data.public_key;
  } catch (err) {
    console.warn('[E2E] getRecipientPublicKey profiles query failed', err);
  }
  return null;
}

// Check if a user has valid E2E keys ready for encryption
export async function ensureUserE2EReady(userId: string): Promise<boolean> {
  try {
    // Check device_keys first (most reliable)
    const { data: deviceKey, error: deviceKeyError } = await supabase
      .from('device_keys' as any)
      .select('public_key')
      .eq('user_id', userId)
      .order('last_seen', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (deviceKeyError) {
      console.warn('[E2E] ensureUserE2EReady device_keys query error', deviceKeyError);
    }
    if (deviceKey?.public_key) return true;

    // Fallback to profiles.public_key
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', userId)
      .single();
    
    if (profileError) {
      console.warn('[E2E] ensureUserE2EReady profiles query error', profileError);
    }
    
    return !!profile?.public_key;
  } catch (err) {
    console.error('[E2E] ensureUserE2EReady unexpected error', err);
    return false;
  }
}

// Encrypt — returns explicit status. Caller must handle failure (no silent plaintext fallback).
export async function encryptForRecipient(content: string, recipientId: string): Promise<EncryptResult> {
  const keys = await getStoredKeysSecure();
  if (!keys) return { success: false, reason: 'no_local_keys' };

  const recipientPubKey = await getRecipientPublicKey(recipientId);
  if (!recipientPubKey) return { success: false, reason: 'recipient_no_e2e' };

  try {
    const payload = await encryptMessage(content, keys.privateKey, recipientPubKey);
    return { success: true, payload };
  } catch (err) {
    console.error('[E2E] encryption_failed', err);
    return { success: false, reason: 'encryption_failed' };
  }
}

export async function decryptFromSender(content: string, senderId: string): Promise<DecryptResult> {
  if (!isEncryptedMessage(content)) return { success: false, reason: 'not_encrypted' };

  const keys = await getStoredKeysSecure();
  if (!keys) return { success: false, reason: 'no_local_keys' };

  const senderPubKey = await getRecipientPublicKey(senderId);
  if (!senderPubKey) return { success: false, reason: 'sender_no_key' };

  try {
    const plaintext = await decryptMessage(content, keys.privateKey, senderPubKey);
    return { success: true, plaintext };
  } catch (err) {
    // Try all known device keys for this sender as fallback
    try {
      const { data: deviceKeys } = await supabase
        .from('device_keys' as any)
        .select('public_key')
        .eq('user_id', senderId)
        .order('last_seen', { ascending: false });

      const allKeys: any[] = deviceKeys ?? [];
      for (const dk of allKeys) {
        if (!dk.public_key || dk.public_key === senderPubKey) continue;
        try {
          const plaintext = await decryptMessage(content, keys.privateKey, dk.public_key);
          return { success: true, plaintext };
        } catch {
          continue;
        }
      }
    } catch {
      /* ignore */
    }
    console.error('[E2E] decryption_failed', err);
    return { success: false, reason: 'decryption_failed' };
  }
}

// Re-initialize keys from scratch (recovery flow).
export async function recoverE2EKeys(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const passphrase = getOrCreateDeviceSecret();
    const deviceId = getOrCreateDeviceId();

    const keys = await generateKeyPair();
    await storeKeysSecure(keys.publicKey, keys.privateKey, passphrase);

    await supabase
      .from('device_keys' as any)
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          public_key: keys.publicKey,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' }
      );

    await supabase.from('profiles').upsert({ id: userId, public_key: keys.publicKey }, { onConflict: 'id' });
    return { success: true };
  } catch (e: any) {
    console.error('[E2E] recovery failed', e);
    return { success: false, error: e?.message ?? 'Unknown error' };
  }
}

export async function clearE2EKeysOnSignOut(): Promise<void> {
  try {
    await clearKeysSecure();
  } catch (e) {
    console.warn('[E2E] clearKeysSecure failed on sign-out', e);
  }
}

export { isEncryptedMessage };
