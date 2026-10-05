import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';

let webPushArmed = false;
const TRACK_KEY = 'processingSubsections';
const NOTIFIED_KEY = 'notifiedSubsections';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function trackProcessingSubsection(entry) {
  if (!entry?.id || !entry?.sectionId) return;
  const current = readJson(TRACK_KEY, []);
  if (current.some((item) => String(item.id) === String(entry.id))) return;
  writeJson(TRACK_KEY, [
    ...current,
    {
      id: String(entry.id),
      sectionId: String(entry.sectionId),
      label: entry.label || 'Lesson subsection',
    },
  ]);
}

async function showLocalNotification(title, body, url = '/upload-lesson') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: '/favicon.svg',
      data: { url },
    });
  } catch {
    new Notification(title, { body });
  }
}

export const COGNITIVE_LOAD_PERSONALIZATION_MESSAGE =
  'cognitive-load-personalization';

export async function enableWatchNotifications() {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;

  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.warn('Service worker registration failed:', error);
    return false;
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  return Notification.permission === 'granted';
}

export async function showHighLoadPersonalizationNotification({
  courseId,
  subsectionId,
  loadLevel,
  url,
  kind = 'highLoad',
  body,
}) {
  const granted = await enableWatchNotifications();
  if (!granted) return false;

  const title = 'Lesson personalization';
  const text =
    body ||
    `Your cognitive load is ${loadLevel}. Do you need any personalization for this lesson?`;
  const payload = {
    type: COGNITIVE_LOAD_PERSONALIZATION_MESSAGE,
    kind,
    courseId: String(courseId || ''),
    subsectionId: String(subsectionId || ''),
    loadLevel,
    url: url || (typeof window !== 'undefined' ? window.location.href : '/course'),
  };

  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body: text,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'cognitive-load-personalization',
      requireInteraction: true,
      actions: [
        { action: 'yes', title: 'Yes' },
        { action: 'no', title: 'No' },
      ],
      data: payload,
    });
    return true;
  } catch (error) {
    console.warn('High-load notification skipped:', error.message);
    return false;
  }
}

export async function enableTeacherPushNotifications() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

  const token = localStorage.getItem('token');
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    user = null;
  }
  if (!token || user?.role === 'Student') return;

  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.warn('Service worker registration failed:', error);
    return;
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission !== 'granted') return;

  const gateway = getGatewayBaseUrl();
  try {
    const vapidRes = await axios.get(`${gateway}/api/push/vapid-public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const publicKey = vapidRes.data?.data?.publicKey;
    if (!publicKey || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await axios.post(`${gateway}/api/push/subscribe`, subscription.toJSON(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    webPushArmed = true;
  } catch (error) {
    console.warn('Web push subscribe skipped:', error.message);
  }
}

export function startProcessingStatusPoller() {
  if (typeof window === 'undefined') return () => {};
  let timer = null;

  const tick = async () => {
    const token = localStorage.getItem('token');
    const tracked = readJson(TRACK_KEY, []);
    if (!token || !tracked.length) return;
    const gateway = getGatewayBaseUrl();
    const remaining = [];
    const notified = new Set(readJson(NOTIFIED_KEY, []));

    await Promise.all(
      tracked.map(async (item) => {
        try {
          const res = await axios.get(
            `${gateway}/api/sections/${encodeURIComponent(item.sectionId)}/subsections/${encodeURIComponent(item.id)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const status = res.data?.data?.knowledgeStatus || 'processing';
          if (status === 'queued' || status === 'processing' || status === 'rebuilding') {
            remaining.push(item);
            return;
          }
          if (notified.has(item.id)) return;
          notified.add(item.id);
          if (webPushArmed) return;
          const ready = status === 'ready' || status === 'needs_rebuild';
          await showLocalNotification(
            ready ? 'Lesson processing complete' : 'Lesson processing finished with issues',
            ready
              ? `${item.label} is ready for students.`
              : `${item.label} finished, but the knowledge chunk needs a review.`,
            '/upload-lesson'
          );
        } catch {
          remaining.push(item);
        }
      })
    );

    writeJson(TRACK_KEY, remaining);
    writeJson(NOTIFIED_KEY, [...notified].slice(-50));
  };

  tick();
  timer = window.setInterval(tick, 5000);
  return () => {
    if (timer) window.clearInterval(timer);
  };
}
