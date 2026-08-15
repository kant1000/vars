// Lets a screen that's about to trigger legitimate system dialogs/camera
// access (which can cause a real AppState background transition, not just
// the transient 'inactive' used for simple permission prompts — confirmed
// live during vendor KYC identity capture) suspend the biometric re-lock
// for its duration, rather than useBiometricLock trying to distinguish
// every possible transition cause.
let suspended = false;

export function suspendBiometricLock() {
  suspended = true;
}

export function resumeBiometricLock() {
  suspended = false;
}

export function isBiometricLockSuspended() {
  return suspended;
}
