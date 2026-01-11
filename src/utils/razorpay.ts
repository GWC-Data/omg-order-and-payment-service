import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Razorpay from 'razorpay';

export interface RazorpaySecrets {
  keyId: string;
  keySecret: string;
}

let cachedSecrets: RazorpaySecrets | null = null;
let cachedClient: Razorpay | null = null;

function readSecretsFromDisk(): Partial<RazorpaySecrets> | null {
  const configuredPath =
    process.env.RAZORPAY_KEYS_FILE ?? path.resolve(process.cwd(), 'keys/razorpay.json');
  if (!fs.existsSync(configuredPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(configuredPath, 'utf-8')) as RazorpaySecrets;
  } catch (error) {
    throw new Error(
      `Failed to parse Razorpay secrets from ${configuredPath}: ${(error as Error).message}`
    );
  }
}

export function getRazorpaySecrets(): RazorpaySecrets {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const secretsFromEnv: Partial<RazorpaySecrets> = {
    keyId: process.env.RAZORPAY_KEY_ID ?? undefined,
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? undefined
  };

  const secretsFromDisk = readSecretsFromDisk();

  const resolvedSecrets: RazorpaySecrets = {
    keyId: secretsFromEnv.keyId ?? secretsFromDisk?.keyId ?? '',
    keySecret: secretsFromEnv.keySecret ?? secretsFromDisk?.keySecret ?? ''
  };

  if (!resolvedSecrets.keyId || !resolvedSecrets.keySecret) {
    throw new Error(
      'Missing Razorpay credentials. Provide RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET env vars or keys/razorpay.json.'
    );
  }

  cachedSecrets = resolvedSecrets;
  return resolvedSecrets;
}

export function getRazorpayClient(): Razorpay {
  if (!cachedClient) {
    const secrets = getRazorpaySecrets();
    cachedClient = new Razorpay({
      key_id: secrets.keyId,
      key_secret: secrets.keySecret
    });
  }
  return cachedClient;
}

export function resetRazorpayClient(): void {
  cachedClient = null;
  cachedSecrets = null;
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  try {
    const { keySecret } = getRazorpaySecrets();
    if (!keySecret) {
      throw new Error('Razorpay key secret is not configured');
    }
    const payload = `${orderId}|${paymentId}`;
    const digest = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
    return digest === signature;
  } catch (error) {
    console.error('Error in verifyPaymentSignature:', error);
    throw error; // Re-throw to let caller handle
  }
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET not configured - skipping signature verification');
      console.warn('[WEBHOOK] WARNING: Webhook verification disabled. Configure secret for production security.');
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}


