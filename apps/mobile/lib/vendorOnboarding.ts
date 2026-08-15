// ============================================================
// VARS — Vendor onboarding resume logic
// Shared between app/_layout.tsx (cold-start resume) and
// auth/vendor-login.tsx (post-login/signup routing) so both stay
// in sync on which step a vendor resumes at and how the nav stack
// is built to get there.
// ============================================================
import { router } from 'expo-router';

export type VendorOnboardingState = {
  phone_number: string | null;
  paystack_subaccount_code: string | null;
  kyc_status: string | null;
  kyc_submitted_at: string | null;
};

// Returns the correct onboarding route to resume at, or null if onboarding is complete.
// Uses DB state so it never drifts from reality (unlike AsyncStorage which can be cleared).
//
// kyc_status defaults to 'pending' (NOT NULL) at row creation — it is NOT a
// reliable signal for "has this vendor even started KYC." kyc_submitted_at is
// the only field that's actually null until vendor-kyc-init fires a real
// Youverify session, so step 4 (bank + KYC) must be gated on
// paystack_subaccount_code / kyc_submitted_at *before* kyc_status is ever
// consulted — otherwise every vendor gets routed straight to the "verifying"
// screen the moment they finish step 2, regardless of whether they've
// touched step 4 at all.
export function getVendorOnboardingStep(vendor: VendorOnboardingState, hasServices: boolean): string | null {
  // Step 1 incomplete — no phone number yet
  if (!vendor.phone_number) return '/vendor-onboarding/step-1-profile';
  // Step 2 incomplete — no services added yet
  if (!hasServices) return '/vendor-onboarding/step-2-services';
  // Step 4 incomplete — bank not done, KYC never actually submitted, or was rejected
  if (!vendor.paystack_subaccount_code || !vendor.kyc_submitted_at || vendor.kyc_status === 'rejected') {
    return '/vendor-onboarding/step-4-kyc';
  }
  // KYC genuinely submitted (kyc_submitted_at set) but not yet verified
  if (vendor.kyc_status !== 'verified') return '/vendor-onboarding/step-5-pending';
  // All steps complete
  return null;
}

const ONBOARDING_STEP_ORDER = [
  '/vendor-onboarding/step-1-profile',
  '/vendor-onboarding/step-2-services',
  '/vendor-onboarding/step-3-portfolio',
  '/vendor-onboarding/step-4-kyc',
  '/vendor-onboarding/step-5-pending',
];

// Routing straight to the resume step with a single router.replace() leaves nothing
// underneath it in the nav stack, so swipe-back (enabled for already-completed steps)
// has nowhere to go. Rebuilds the stack through every already-completed step first,
// so swipe-back always works, not just for steps completed within the current
// in-app session.
export function resumeOnboardingAt(step: string) {
  const targetIndex = ONBOARDING_STEP_ORDER.indexOf(step);
  if (targetIndex === -1) {
    router.replace(step as any);
    return;
  }
  ONBOARDING_STEP_ORDER.slice(0, targetIndex + 1).forEach((path, i) => {
    if (i === 0) router.replace(path as any);
    else router.push(path as any);
  });
}
