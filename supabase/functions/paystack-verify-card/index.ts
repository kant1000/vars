// ============================================================
// VARS — paystack-verify-card
// One-time card verification for new customers before their first booking.
// Charges ₦50 (non-refundable) via Paystack WebView checkout and stores
// the reusable authorization_code on the customer's profile so future gate
// charges can be silent (chargeAuthorization).
//
// Flow:
//   1. Check if customer already has paystack_authorization_code — skip if set.
//   2. Initialize a ₦50 Paystack transaction with callback_url = vars://card-verify-complete.
//   3. Return access_code to the app for WebView presentation.
//   4. Customer completes checkout → Paystack fires charge.success webhook.
//   5. paystack-webhook sees metadata.vars_card_verify=true and stores auth_code on profile.
//
// Only called for customers with no stored authorization_code.
// Returning customers skip this step entirely.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient, generateReference } from '../_shared/paystack.ts';

const CARD_VERIFY_AMOUNT_KOBO = 5_000; // ₦50 — non-refundable

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const supabase = createAdminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('paystack_authorization_code, email')
      .eq('id', user.id)
      .single();

    if (profile?.paystack_authorization_code) {
      return jsonResponse({ already_verified: true });
    }

    const email = profile?.email ?? user.email;
    if (!email) return errorResponse('Customer email not found', 500);

    const reference = generateReference('VARS_VERIFY');
    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    const transaction = await paystack.initializeTransaction({
      email,
      amount: CARD_VERIFY_AMOUNT_KOBO,
      reference,
      callback_url: 'vars://card-verify-complete',
      metadata: {
        vars_card_verify: true,
        user_id: user.id,
      },
    });

    return jsonResponse({
      access_code: transaction.access_code,
      reference,
      amount_kobo: CARD_VERIFY_AMOUNT_KOBO,
    });
  } catch (err) {
    console.error('paystack-verify-card error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
