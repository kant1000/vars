-- Bug found via live testing: signing in with an existing customer phone
-- number always routed through OTP + finish_account (treated as a brand
-- new signup) instead of the password screen — then finish_account's
-- unconditional updateUser({ password }) collided with GoTrue's
-- password-reuse check ("New password should be different from the old
-- password") the moment the customer re-typed their existing password.
--
-- Root cause: check_customer_identity has only ever returned a scalar
-- text ('has_account'/'not_found') via `SELECT CASE ...`, but
-- customer-check-identity/index.ts has always read the RPC result as a
-- row array — `(data as {status, has_password}[])[0]` — expecting a
-- TABLE-returning function. Against a scalar, the client received a bare
-- string; `[0]` indexed into the string itself (JS string indexing),
-- `.status`/`.has_password` came back undefined, and login.tsx's
-- `status === 'has_account' && hasPassword` check was always false —
-- every existing account fell through to the OTP-signup branch.
--
-- auth.users.encrypted_password can't be used as the "has a real
-- password" signal — GoTrue populates a bcrypt hash for every row
-- regardless of whether the user ever chose one — so a dedicated
-- tracking column is the only reliable source of truth.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT false;

-- Backfill: both existing customer profiles today have a real,
-- user-chosen password — one via the legacy email/password signup
-- (signUpWithEmail, which always sets a real password), the other
-- via finishCustomerSignup already completed earlier this session.
-- Rows created after this migration default to false and only flip
-- once finishCustomerSignup actually runs.
UPDATE public.profiles SET password_set = true;

DROP FUNCTION IF EXISTS public.check_customer_identity(text);

CREATE FUNCTION public.check_customer_identity(p_phone text)
 RETURNS TABLE(status text, has_password boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM auth.users u JOIN profiles p ON p.id = u.id
      WHERE u.phone = normalise_nigerian_phone(p_phone)
         OR p.phone_number = normalise_nigerian_phone(p_phone)
    ) THEN 'has_account' ELSE 'not_found' END,
    COALESCE((
      SELECT p.password_set FROM auth.users u JOIN profiles p ON p.id = u.id
      WHERE u.phone = normalise_nigerian_phone(p_phone)
         OR p.phone_number = normalise_nigerian_phone(p_phone)
      LIMIT 1
    ), false)
$function$;
