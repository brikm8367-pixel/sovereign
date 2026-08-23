import { supabase } from '@/integrations/supabase/client';
import { playWorkNotificationSound, playPrivateNotificationSound, playNotificationSound } from './sounds';

let cachedVapidKey: string | null = null;

async function getVapidKey(): Promise<string | null> {
  if (cachedVapidKey) return cachedVapidKey;
  
  // Try env var first
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (envKey) { cachedVapidKey = envKey; return envKey; }

  // Fetch from edge function
  try {
    const { data, error } = await supabase.functions.invoke('get-vapid-key');
    if (!error && data?.key) {
      cachedVapidKey = data.key;
      return data.key;
    }
  } catch (e) {
    console.error('Failed to fetch VAPID key:', e);
  }
  return null;
}

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // Use the single app service worker (registered once by vite-plugin-pwa).
    // Do NOT register a second worker at the same scope — that causes two
    // workers to fight for control, which previously broke offline caching
    // and caused "not responding" crashes when the PWA was launched.
    const registration = await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.log('VAPID public key not available');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint!;
    const p256dh = subJson.keys!.p256dh;
    const authKey = subJson.keys!.auth;

    // Store subscription with user id and endpoint
    await supabase.from('push_subscriptions').upsert({
      user_id: auth.user.id,
      endpoint,
      p256dh,
      auth: authKey,
    }, { onConflict: 'user_id,endpoint' });

    console.log('Push notifications registered successfully');
  } catch (error) {
    console.error('Push registration error:', error);
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/** Play incoming message sound based on category */
export function playIncomingMessageSound(category: 'work' | 'direct' | 'audience' | string) {
  switch (category) {
    case 'work':
      playWorkNotificationSound();
      break;
    case 'direct':
      playPrivateNotificationSound();
      break;
    case 'audience':
    default:
      playNotificationSound();
      break;
  }
}

/** Send a test push notification to the current user */
export async function sendTestNotification() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        receiverId: auth.user.id,
        senderName: 'Sovereign Test',
        messageType: 'test',
        content: 'This is a test notification from Sovereign',
        notificationType: 'test',
      },
    });

    if (error) {
      console.error('Test notification error:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send test notification:', error);
    return false;
  }
}

/** Show in-app notification with sound when a message arrives */
export function showInAppNotification(title: string, body: string, category?: 'work' | 'direct' | 'audience') {
  if (Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag: 'directly-msg',
    });
    setTimeout(() => n.close(), 5000);
  }
  
  // Play sound based on category
  if (category) {
    playIncomingMessageSound(category);
  }
}
