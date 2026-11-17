'use client';
import { useEffect } from 'react';
import { getOrCreateAnonymousDeviceId } from '@/lib/clientIdentity';
const SESSION_VISIT_KEY = 'lawdiploma:analytics:visit-sent:v1';
export default function AnalyticsTracker() {
  useEffect(() => {
    const deviceId = getOrCreateAnonymousDeviceId();
    const send = (event: 'visit' | 'heartbeat') => {
      void fetch('/api/analytics/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, deviceId }), keepalive: true,
      }).catch(() => undefined);
    };
    try {
      if (!window.sessionStorage.getItem(SESSION_VISIT_KEY)) {
        window.sessionStorage.setItem(SESSION_VISIT_KEY, '1');
        send('visit');
      }
    } catch { send('visit'); }
    send('heartbeat');
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') send('heartbeat');
    }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') send('heartbeat'); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
