'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ============================================================
// Named, validated vendor actions — replaces a generic patch-any-field
// updateVendor(vendorId, patch) that let the client pass arbitrary keys.
// Two of these enforce invariants a bare patch couldn't:
//   - overrideApproveVendor: is_active dual-gate (kyc_status=verified AND
//     paystack_subaccount_code present) — see vendor-kyc-webhook /
//     paystack-verify-bank for the other two writers of this invariant.
//   - clearSettlementHold: blocked while the vendor has open/under_review
//     disputes, so ops can't accidentally release a payout mid-investigation.
// ============================================================

export async function overrideApproveVendor(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();

  const { data: vendor, error: fetchErr } = await db
    .from('vendors')
    .select('paystack_subaccount_code')
    .eq('id', vendorId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  // Only flip is_active if the subaccount side of the gate is already satisfied —
  // otherwise the vendor stays kyc_status=verified but is_active=false until
  // paystack-verify-bank completes and flips it itself.
  const { error } = await db
    .from('vendors')
    .update({
      kyc_status: 'verified',
      is_active: vendor?.paystack_subaccount_code != null,
    })
    .eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}

export async function resetVendorKyc(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendors').update({ kyc_status: 'pending' }).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}

export async function clearSettlementHold(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();

  const { data: bookingRows } = await db.from('bookings').select('id').eq('vendor_id', vendorId);
  const bookingIds = (bookingRows ?? []).map((b) => b.id);

  const { count: openDisputes } = await db
    .from('disputes')
    .select('id', { count: 'exact', head: true })
    .in('booking_id', bookingIds)
    .in('status', ['open', 'under_review']);

  if ((openDisputes ?? 0) > 0) {
    throw new Error(
      `Cannot clear settlement hold — ${openDisputes} open/under-review dispute(s) remain for this vendor. Resolve them first.`
    );
  }

  const { error } = await db.from('vendors').update({ settlement_on_hold: false }).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}

export async function clearCancellationFlag(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendors').update({ cancellation_flagged: false }).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}

export async function toggleVarsChoiceBadge(vendorId: string, current: boolean) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendors').update({ badge_vars_choice: !current }).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}

// is_suspended is checked at discovery (get_nearby_vendors), booking init
// (paystack-initialize), and RLS — but nothing in the app ever set it. This
// is the admin control that actually flips it.
export async function suspendVendor(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendors').update({ is_suspended: true }).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}

export async function unsuspendVendor(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendors').update({ is_suspended: false }).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}
