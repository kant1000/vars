// ============================================================
// VARS — Paystack API Client
// Handles all Paystack interactions for escrow, settlement, refunds
// ============================================================

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  paid_at: string;
  authorization: {
    authorization_code: string;
    card_type: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    reusable: boolean;
    bank: string;
  };
  customer: {
    email: string;
    customer_code: string;
  };
  metadata: Record<string, unknown>;
}

export interface PaystackTransfer {
  transfer_code: string;
  reference: string;
  status: string;
  amount: number;
  recipient: { recipient_code: string };
}

export interface PaystackRecipient {
  recipient_code: string;
  name: string;
  account_number: string;
  bank_code: string;
}

export class PaystackClient {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!data.status) {
      throw new Error(data.message ?? 'Paystack API error');
    }

    return data.data as T;
  }

  /**
   * Step 1 — Initialize a transaction.
   * Returns access_code for Paystack inline popup on mobile.
   * Funds are captured immediately into VARS Paystack account (escrow).
   */
  async initializeTransaction(params: {
    email: string;
    amount: number; // kobo
    reference: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
    channels?: string[];
  }): Promise<{ authorization_url: string; access_code: string; reference: string }> {
    return this.request('POST', '/transaction/initialize', {
      ...params,
      channels: params.channels ?? ['card', 'bank', 'ussd', 'mobile_money'],
    });
  }

  /**
   * Verify a transaction by reference.
   * Called after webhook confirms charge.success to cross-check.
   */
  async verifyTransaction(reference: string): Promise<PaystackTransaction> {
    return this.request('GET', `/transaction/verify/${reference}`);
  }

  /**
   * Refund a transaction — used on vendor decline/timeout and cancellations.
   * Amount is in kobo. If omitted, full refund is issued.
   */
  async refundTransaction(params: {
    transaction: string; // reference
    amount?: number; // partial refund in kobo
    merchant_note?: string;
  }): Promise<{ transaction: { reference: string }; amount: number }> {
    return this.request('POST', '/refund', params);
  }

  /**
   * Create a transfer recipient for a vendor's bank account.
   * Called during vendor onboarding (§6.1 Step 4).
   */
  async createTransferRecipient(params: {
    type: 'nuban';
    name: string;
    account_number: string;
    bank_code: string;
    currency: 'NGN';
  }): Promise<PaystackRecipient> {
    return this.request('POST', '/transferrecipient', params);
  }

  /**
   * Initiate a bank transfer — used for vendor settlement.
   * Per spec §8: "direct to registered bank account on every settlement"
   */
  async initiateTransfer(params: {
    source: 'balance';
    amount: number; // kobo
    recipient: string; // recipient_code
    reason?: string;
    reference?: string;
  }): Promise<PaystackTransfer> {
    return this.request('POST', '/transfer', params);
  }

  /**
   * Verify a bank account number before saving.
   * Called during vendor bank account setup (§6.1 Step 4).
   */
  async verifyBankAccount(params: {
    account_number: string;
    bank_code: string;
  }): Promise<{ account_number: string; account_name: string }> {
    return this.request(
      'GET',
      `/bank/resolve?account_number=${params.account_number}&bank_code=${params.bank_code}`
    );
  }

  /**
   * List Nigerian banks — for vendor onboarding bank selector.
   */
  async listBanks(): Promise<Array<{ name: string; code: string; active: boolean }>> {
    return this.request('GET', '/bank?country=nigeria&use_cursor=false&perPage=100');
  }
}

// ============================================================
// UTILITIES
// ============================================================

/** Generate a unique VARS-prefixed Paystack reference */
export function generateReference(prefix = 'VARS'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Verify Paystack webhook HMAC-SHA512 signature.
 * MUST be called before processing any webhook.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === signature;
}

/**
 * Calculate cancellation fee split per spec §5 policy table.
 * All amounts returned in kobo.
 */
export function calculateCancellationFee(params: {
  servicePriceKobo: number;
  bookingCreatedAt: Date;
  scheduledAt: Date;
  cancelledAt?: Date;
}): {
  feePercent: number;
  varsAmountKobo: number;
  vendorAmountKobo: number;
  refundAmountKobo: number;
} {
  const { servicePriceKobo, bookingCreatedAt, scheduledAt } = params;
  const cancelledAt = params.cancelledAt ?? new Date();

  const minsSinceBooking = (cancelledAt.getTime() - bookingCreatedAt.getTime()) / 60000;
  const minsToService = (scheduledAt.getTime() - cancelledAt.getTime()) / 60000;

  let feePercent: number;
  let varsSharePercent: number;
  let vendorSharePercent: number;

  if (minsToService <= 60) {
    // Within 1 hour of service — non-refundable
    feePercent = 100;
    varsSharePercent = 30;
    vendorSharePercent = 70;
  } else if (minsSinceBooking <= 15) {
    // 0–15 mins after booking
    feePercent = 15;
    varsSharePercent = 10;
    vendorSharePercent = 5;
  } else if (minsSinceBooking <= 60) {
    // 15 mins – 1 hour after booking
    feePercent = 50;
    varsSharePercent = 30;
    vendorSharePercent = 20;
  } else {
    // Default: same as 15min–1hr band
    feePercent = 50;
    varsSharePercent = 30;
    vendorSharePercent = 20;
  }

  const feeAmountKobo = Math.round((servicePriceKobo * feePercent) / 100);
  const varsAmountKobo = Math.round((servicePriceKobo * varsSharePercent) / 100);
  const vendorAmountKobo = Math.round((servicePriceKobo * vendorSharePercent) / 100);
  const refundAmountKobo = servicePriceKobo - feeAmountKobo;

  return { feePercent, varsAmountKobo, vendorAmountKobo, refundAmountKobo };
}

/**
 * Calculate settlement split on completion.
 * VARS takes 20% commission per spec §8.
 */
export function calculateSettlement(servicePriceKobo: number): {
  vendorAmountKobo: number;
  varsCommissionKobo: number;
} {
  const varsCommissionKobo = Math.round(servicePriceKobo * 0.2);
  const vendorAmountKobo = servicePriceKobo - varsCommissionKobo;
  return { vendorAmountKobo, varsCommissionKobo };
}
