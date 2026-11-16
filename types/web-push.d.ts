declare module 'web-push' {
  export type PushSubscription = { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } };
  export type PushSendOptions = { TTL?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string };
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(subscription: PushSubscription, payload?: string, options?: PushSendOptions): Promise<{ statusCode: number; body?: string }>;
}
