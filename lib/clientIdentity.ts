const DEVICE_KEY = 'lawdiploma:anonymous-device:v1';
export function getOrCreateAnonymousDeviceId(): string {
  try {
    let value = window.localStorage.getItem(DEVICE_KEY);
    if (!value || !/^[a-zA-Z0-9_-]{20,64}$/.test(value)) {
      value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      window.localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
