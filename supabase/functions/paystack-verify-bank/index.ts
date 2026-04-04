// ============================================================
// VARS — paystack-verify-bank
// Called during vendor onboarding Step 4 (§6.1).
// Verifies bank account via Paystack, creates a Transfer recipient,
// and saves the recipient_code to the vendor record.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const { action } = body;

    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    // ---- List banks ----
    if (action === 'list_banks') {
      const banks = await paystack.listBanks();
      return jsonResponse({ banks: banks.filter((b) => b.active) });
    }

    // ---- Verify account number ----
    if (action === 'verify') {
      const { account_number, bank_code } = body;
      if (!account_number || !bank_code) {
        return errorResponse('Missing account_number or bank_code');
      }

      const result = await paystack.verifyBankAccount({ account_number, bank_code });
      return jsonResponse({
        account_number: result.account_number,
        account_name: result.account_name,
      });
    }

    // ---- Save verified bank account and create Paystack recipient ----
    if (action === 'save') {
      const { account_number, bank_code, bank_name, account_name } = body;
      if (!account_number || !bank_code || !bank_name || !account_name) {
        return errorResponse('Missing required bank account fields');
      }

      const supabase = createAdminClient();

      // Confirm vendor exists
      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('id, full_name')
        .eq('id', user.id)
        .single();

      if (vendorError || !vendor) return errorResponse('Vendor not found', 404);

      // Create Paystack Transfer recipient for this bank account
      const recipient = await paystack.createTransferRecipient({
        type: 'nuban',
        name: account_name,
        account_number,
        bank_code,
        currency: 'NGN',
      });

      // Save to vendor record
      await supabase
        .from('vendors')
        .update({
          bank_account_number: account_number,
          bank_name,
          bank_account_name: account_name,
          paystack_recipient_code: recipient.recipient_code,
        })
        .eq('id', user.id);

      console.log(`Bank account saved for vendor ${user.id}: ${recipient.recipient_code}`);

      return jsonResponse({
        success: true,
        recipient_code: recipient.recipient_code,
        account_name,
      });
    }

    return errorResponse('Invalid action. Use: list_banks | verify | save');
  } catch (err) {
    console.error('paystack-verify-bank error:', err);
    // Surface Paystack error messages to user (e.g. "Invalid account number")
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
