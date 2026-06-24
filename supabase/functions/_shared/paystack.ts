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

export interface PaystackSubaccount {
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
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
   *
   * With subaccount + bearer: 'account', Paystack splits the charge at
   * payment time. The vendor's share lands in their subaccount balance;
   * VARS's share (percentage_charge set on the subaccount) stays in the
   * VARS main account. VARS bears the Paystack fee.
   *
   * transaction_charge (kobo): flat amount to VARS main account, overrides
   * percentage_charge. Pass 0 for Pioneer bookings so VARS takes ₦0 and
   * 100% goes to the subaccount.
   */
  async initializeTransaction(params: {
    email: string;
    amount: number; // kobo
    reference: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
    channels?: string[];
    subaccount?: string;          // vendor's subaccount_code (ACCT_xxx)
    bearer?: 'account' | 'subaccount'; // who bears Paystack fees; use 'account' so VARS bears
    transaction_charge?: number;  // flat kobo to main account, overrides percentage_charge
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
   * Create a Paystack subaccount for a vendor.
   * Called once during onboarding (§6.1 Step 4) alongside createTransferRecipient.
   *
   * percentage_charge is the PLATFORM's fee percentage — how much goes to the
   * VARS main account. e.g. 20 → VARS gets 20%, vendor subaccount gets 80%.
   * settlement_schedule: 'manual' means funds accumulate in the subaccount
   * balance until VARS triggers settlement from the Paystack dashboard.
   * There is no public Paystack API to trigger this programmatically.
   */
  async createSubaccount(params: {
    business_name: string;
    settlement_bank: string;   // bank code, e.g. '044' for GTBank
    account_number: string;
    percentage_charge: number; // VARS's fee %, e.g. 20 → vendor gets 80%
    settlement_schedule?: 'auto' | 'weekly' | 'monthly' | 'manual';
    primary_contact_name?: string;
    primary_contact_email?: string;
  }): Promise<PaystackSubaccount> {
    return this.request('POST', '/subaccount', params);
  }

  /**
   * Queue subaccount settlement for a vendor.
   *
   * Paystack does NOT expose a public API to programmatically trigger settlement
   * of a subaccount's accumulated balance to the vendor's bank account.
   * settlement_schedule: 'manual' means VARS must trigger this from the
   * Paystack dashboard (Settings → Subaccounts → Settle).
   *
   * This method handles the VARS-side gating (dispute check, booking completion)
   * and emits a prominent ops log. The actual bank transfer is a dashboard action.
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
 * Vendor always receives 80%. All platform costs (Paystack charge fee +
 * stamp duty) come out of VARS' 20% commission.
 *
 * Paystack charge fee: 1.5% + ₦100 (capped ₦2,000). The ₦100 flat is
 * waived on transactions below ₦2,500.
 * Stamp duty: ₦50 on transactions ≥ ₦10,000 (per CBN regulation).
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
