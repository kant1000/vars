// ============================================================
// VARS — Paystack API Client
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

export interface PaystackSubaccount {
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
}

/** Raw response body from POST /charge_authorization */
export interface ChargeAuthorizationResult {
  /** Paystack transaction-level status field inside data */
  status: string; // 'success' | 'failed' | 'send_otp' | 'send_phone' | ...
  reference: string;
  amount: number;
  authorization: {
    authorization_code: string;
    reusable: boolean;
    card_type: string;
    last4: string;
    bank: string;
  };
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
   * Initialize a transaction.
   * Returns access_code for Paystack inline popup on mobile.
   *
   * In the gate model this is called at gate time for first-time customers
   * (no stored authorization_code). For returning customers use
   * chargeAuthorization instead.
   *
   * With subaccount + bearer: 'account', Paystack splits at payment time.
   */
  async initializeTransaction(params: {
    email: string;
    amount: number;
    reference: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
    channels?: string[];
    subaccount?: string;
    bearer?: 'account' | 'subaccount';
    transaction_charge?: number;
  }): Promise<{ authorization_url: string; access_code: string; reference: string }> {
    return this.request('POST', '/transaction/initialize', {
      ...params,
      channels: params.channels ?? ['card', 'bank', 'ussd', 'mobile_money'],
    });
  }

  /**
   * Charge a stored card authorization directly.
   * Called at gate time for returning customers who have a reusable
   * authorization_code stored on their profile.
   *
   * The `data.status` field of the response indicates the outcome:
   *   'success'    — charge completed; advance booking to on_way
   *   'failed'     — charge declined; open retry window
   *
   * ── PENDING OTP ──────────────────────────────────────────────
   * Paystack may return other status values when the card issuer requires
   * additional authentication (e.g. 'send_otp', 'send_phone'). We have
   * confirmed with Paystack that NGN charge_authorization can require an OTP
   * step, but have not yet received full documentation on the exact status
   * values and follow-up API calls. Do NOT implement OTP handling speculatively.
   * Add a handler here once Paystack provides the complete flow spec.
   * ─────────────────────────────────────────────────────────────
   */
  async chargeAuthorization(params: {
    authorization_code: string;
    email: string;
    amount: number;
    reference: string;
    metadata?: Record<string, unknown>;
    subaccount?: string;
    bearer?: 'account' | 'subaccount';
    transaction_charge?: number;
  }): Promise<ChargeAuthorizationResult> {
    return this.request('POST', '/transaction/charge_authorization', params);
  }

  /** Verify a transaction by reference. */
  async verifyTransaction(reference: string): Promise<PaystackTransaction> {
    return this.request('GET', `/transaction/verify/${reference}`);
  }

  /**
   * Refund a transaction.
   * Used on vendor post-gate cancel and admin dispute resolution.
   * Pre-gate cancellations (pending/accepted, gate not fired) do NOT
   * call this — no charge has occurred so nothing to refund.
   */
  async refundTransaction(params: {
    transaction: string;
    amount?: number;
    merchant_note?: string;
  }): Promise<{ transaction: { reference: string }; amount: number }> {
    return this.request('POST', '/refund', params);
  }

  /**
   * Create a Paystack subaccount for a vendor.
   * Called once during onboarding alongside bank account save.
   *
   * percentage_charge is the PLATFORM's fee percentage — how much goes to the
   * VARS main account. e.g. 20 → VARS gets 20%, vendor subaccount gets 80%.
   * settlement_schedule: 'manual' means funds accumulate in the subaccount
   * balance until VARS triggers settlement from the Paystack dashboard.
   */
  async createSubaccount(params: {
    business_name: string;
    settlement_bank: string;
    account_number: string;
    percentage_charge: number;
    settlement_schedule?: 'auto' | 'weekly' | 'monthly' | 'manual';
    primary_contact_name?: string;
    primary_contact_email?: string;
  }): Promise<PaystackSubaccount> {
    return this.request('POST', '/subaccount', params);
  }

  /**
   * Queue subaccount settlement for a vendor (ops-alert stub).
   *
   * Paystack does NOT expose a public API to programmatically trigger
   * subaccount settlement to the vendor's bank account.
   * settlement_schedule: 'manual' means VARS must trigger from the
   * Paystack dashboard (Settings → Subaccounts → Settle).
   *
   * This method gates on VARS-side conditions and emits an ops log.
   * The actual bank transfer is a manual dashboard action.
   */
  async triggerSubaccountSettlement(params: {
    vendor_id: string;
    subaccount_code: string;
    booking_ids: string[];
    total_amount_kobo: number;
  }): Promise<{ status: 'settlement_queued'; vendor_id: string }> {
    console.log(
      `SETTLEMENT QUEUED — vendor_id=${params.vendor_id} ` +
      `subaccount=${params.subaccount_code} ` +
      `bookings=[${params.booking_ids.join(',')}] ` +
      `total=₦${(params.total_amount_kobo / 100).toLocaleString()} — ` +
      `VARS OPS: trigger settlement from Paystack dashboard → Subaccounts → Settle`
    );
    return { status: 'settlement_queued', vendor_id: params.vendor_id };
  }

  /** Verify a bank account number before saving. */
  async verifyBankAccount(params: {
    account_number: string;
    bank_code: string;
  }): Promise<{ account_number: string; account_name: string }> {
    return this.request(
      'GET',
      `/bank/resolve?account_number=${params.account_number}&bank_code=${params.bank_code}`
    );
  }

  /** List Nigerian banks — for vendor onboarding bank selector. */
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
 * Calculate settlement split on completion.
 * Vendor always receives 80% (Pioneer: 100% for first 3 bookings).
 * All platform costs (Paystack charge fee + stamp duty) come out of VARS's 20%.
 *
 * Paystack charge fee: 1.5% + ₦100 (capped ₦2,000). ₦100 flat waived < ₦2,500.
 * Stamp duty: ₦50 on transactions ≥ ₦10,000 (CBN regulation).
 */
export function calculateSettlement(servicePriceKobo: number): {
  vendorAmountKobo: number;
  varsCommissionKobo: number;
  paystackFeeKobo: number;
  stampDutyKobo: number;
  varsNetKobo: number;
} {
  const vendorAmountKobo = Math.round(servicePriceKobo * 0.8);
  const varsCommissionKobo = servicePriceKobo - vendorAmountKobo;

  const paystackFeeKobo = servicePriceKobo < 250_000
    ? Math.round(servicePriceKobo * 0.015)
    : Math.min(Math.round(servicePriceKobo * 0.015) + 10_000, 200_000);

  const stampDutyKobo = servicePriceKobo >= 1_000_000 ? 5_000 : 0;

  const varsNetKobo = varsCommissionKobo - paystackFeeKobo - stampDutyKobo;

  return { vendorAmountKobo, varsCommissionKobo, paystackFeeKobo, stampDutyKobo, varsNetKobo };
}
