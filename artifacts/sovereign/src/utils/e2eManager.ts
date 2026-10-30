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
  | { success: false; reason: 'no_local_keys' | 'recipient_no_e2e' | 'encryption_failed'; error?: string };

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

export async function storeOwnMessagePlaintext(messageId: string, plaintext: string): Promise<void> {
  try {
    await set(`${OWN_MESSAGE_KEY_PREFIX}${messageId}`, plaintext);
  } catch (err) {
    console.warn('[E2E] Failed to store own message plaintext', err);
  }
}

export async function getOwnMessagePlaintext(messageId: string): Promise<string | null> {
  try {
    const value = await get(`${OWN_MESSAGE_KEY_PREFIX}${messageId}`);
    return value ?? null;
  } catch (err) {
    console.warn('[E2E] Failed to get own message plaintext', err);
    return null;
  }
}

export async function initE2EKeys(userId: string, password?: string): Promise<void> {
  try {
    await migrateLegacyKeysIfPresent(userId);

    const passphrase = getOrCreateDeviceSecret(userId);
    const deviceId = getOrCreateDeviceId();

    let keys = await getStoredKeysSecure(userId, passphrase);

    if (!keys) {
      keys = await generateKeyPair();
      await storeKeysSecure(keys.publicKey, keys.privateKey, passphrase, userId);
    }

    try { const privJwk = JSON.parse(keys.privateKey); const pubJwk = JSON.parse(keys.publicKey); if (!privJwk?.d || !privJwk?.x || !privJwk?.y || !pubJwk?.x || !pubJwk?.y) { throw new Error('missing_private_components'); } const imported = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: privJwk.x, y: privJwk.y, d: privJwk.d, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); const reExported = await crypto.subtle.exportKey('jwk', imported); if (reExported.x !== pubJwk.x || reExported.y !== pubJwk.y) { throw new Error('priv_pub_mismatch'); } } catch (err) { console.error('[E2E] Key pair JWK validation failed — NOT regenerating automatically.', err); throw new Error('e2e_key_pair_corrupted'); }

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

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', userId)
      .maybeSingle();
    if (!existingProfile?.public_key || existingProfile.public_key === keys!.publicKey) {
      await withRetry(async () => {
        const { error } = await supabase
          .from('profiles')
          .upsert(
            { id: userId, public_key: keys!.publicKey },
            { onConflict: 'id' }
          );
        if (error) throw error;
      });
    }

    if (password) {
      const { uploadKeyBackup } = await import('./e2eBackup');
      const backupResult = await uploadKeyBackup(password, userId);
      if (!backupResult.success) {
        console.warn('[E2E] auto backup upload failed', backupResult.error);
      }
    }

    if (password) {
      await restoreCloudSessions(userId, password);
    }

    setCloudSyncHandler(async (partnerId, state) => {
      if (!password) return { success: false, conflict: false };
      const encryptedState = await encryptSessionState(JSON.stringify(state), password);

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
    throw e;
  }
}

export async function autoRecoverKeys(userId: string, password: string): Promise<{ recovered: boolean; regenerated: boolean }> {
  try {
    const localKeys = await getStoredKeysSecure(userId);
    if (!localKeys) {
      await initE2EKeys(userId, password);
      return { recovered: false, regenerated: true };
    }

    // Real roundtrip test — verifies Priv actually decrypts what Pub encrypts
    let roundtripOk = false; try { const privJwk = JSON.parse(localKeys.privateKey); const pubJwk = JSON.parse(localKeys.publicKey); if (!privJwk?.d || !privJwk?.x || !privJwk?.y || !pubJwk?.x || !pubJwk?.y) { throw new Error('missing_private_components'); } const imported = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: privJwk.x, y: privJwk.y, d: privJwk.d, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); const reExported = await crypto.subtle.exportKey('jwk', imported); roundtripOk = reExported.x === pubJwk.x && reExported.y === pubJwk.y; } catch { roundtripOk = false; }

    const serverPublicKey = await getRecipientPublicKey(userId);

    if (roundtripOk && serverPublicKey && localKeys.publicKey === serverPublicKey) {
      return { recovered: false, regenerated: false };
    }

    if (!roundtripOk) {
      console.warn('[E2E] autoRecoverKeys: local private key does NOT match public key — attempting recovery');
    } else if (serverPublicKey && localKeys.publicKey !== serverPublicKey) {
      console.warn('[E2E] autoRecoverKeys: local public key differs from server — attempting recovery');
    }

    const { downloadKeyBackup } = await import('./e2eBackup');
    const result = await downloadKeyBackup(password, userId);
    if (result.success) {
      return { recovered: true, regenerated: false };
    }

    await clearKeysSecure(userId);
    localStorage.removeItem(`directly_device_secret_v1_${userId}`);
    localStorage.removeItem('directly_device_id_v1');
    await initE2EKeys(userId, password);
    return { recovered: false, regenerated: true };
  } catch (err) {
    console.error('[E2E] autoRecoverKeys failed', err);
    return { recovered: false, regenerated: false };
  }
}

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
    const { data: profile } = await supabase.from('profiles').select('public_key').eq('id', recipientId).single();
    if (profile?.public_key) return profile.public_key;
  } catch (err) {
    console.warn('[E2E] getRecipientPublicKey profiles query failed', err);
  }
  return null;
}

export async function ensureUserE2EReady(userId: string): Promise<boolean> {
  try {
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
    if ((deviceKey as any)?.public_key) return true;

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

export async function encryptForRecipient(content: string, recipientId: string, userId: string): Promise<EncryptResult> {
  const keys = await getStoredKeysSecure(userId);
  console.log('[E2E-DIAG] Local keys:', keys ? `FOUND (privateKey length: ${keys.privateKey?.length})` : 'MISSING');
  if (!keys) return { success: false, reason: 'no_local_keys' };

  const recipientPubKey = await getRecipientPublicKey(recipientId);
  if (!recipientPubKey) return { success: false, reason: 'recipient_no_e2e' };

  try {
    const payload = await encryptMessage(content, keys.privateKey, recipientPubKey);
    return { success: true, payload };
  } catch (err) {
    console.error('[E2E] encryption_failed', err);
    return { success: false, reason: 'encryption_failed', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function decryptFromSender(content: string, senderId: string, userId: string): Promise<DecryptResult> {
  if (!isEncryptedMessage(content)) {
    console.log('[E2E-DIAG] Not encrypted');
    return { success: false, reason: 'not_encrypted' };
  }

  const keys = await getStoredKeysSecure(userId);
  if (!keys) return { success: false, reason: 'no_local_keys' };

  const senderPubKey = await getRecipientPublicKey(senderId);
  console.log('[E2E-DIAG] Sender pubkey:', senderPubKey ? `FOUND (length: ${senderPubKey.length})` : 'MISSING', 'senderId:', senderId);
  if (!senderPubKey) return { success: false, reason: 'sender_no_key' };

  try {
    const plaintext = await decryptMessage(content, keys.privateKey, senderPubKey);
    return { success: true, plaintext };
  } catch (err) {
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
    console.log('[E2E-DIAG] Decrypt failed:', err?.message || err);
    console.error('[E2E] decryption_failed', err);
    return { success: false, reason: 'decryption_failed' };
  }
}

export async function recoverE2EKeys(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const passphrase = getOrCreateDeviceSecret(userId);
    const deviceId = getOrCreateDeviceId();

    const keys = await generateKeyPair();
    await storeKeysSecure(keys.publicKey, keys.privateKey, passphrase, userId);

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
    return { success: false, error: e?.message ?? 'Unknown error' };
  }
}

export async function clearE2EKeysOnSignOut(userId: string): Promise<void> {
  try {
    await clearKeysSecure(userId);
  } catch (e) {
    console.warn('[E2E] clearKeysSecure failed on sign-out', e);
  }
}

export { isEncryptedMessage };
