-- Clickwrap acceptance log — Nigerian Evidence Act 2011 ss.84,93 + Cybercrimes Act 2015 s.17.
-- Immutable: no UPDATE or DELETE policy. Retained for 6 years (CITA / Lagos Limitation Law).

create type document_type as enum (
  'customer_terms',
  'privacy_policy',
  'vendor_terms',
  'vendor_privacy_policy'
);

create table terms_acceptances (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete restrict,
  document_type    document_type not null,
  document_version text        not null,
  accepted_at      timestamptz not null default now(),
  ip_address       inet,
  user_agent       text
);

alter table terms_acceptances enable row level security;

-- Users insert their own acceptances only
create policy "insert_own_acceptance"
  on terms_acceptances for insert to authenticated
  with check (auth.uid() = user_id);

-- Users read their own acceptance history (consent dashboard)
create policy "select_own_acceptances"
  on terms_acceptances for select to authenticated
  using (auth.uid() = user_id);

-- Admins read all (audit / DSR responses)
create policy "admin_select_acceptances"
  on terms_acceptances for select to authenticated
  using (is_admin());

-- No UPDATE or DELETE policy — records are intentionally immutable.

create index idx_terms_user_doc on terms_acceptances (user_id, document_type, document_version);

-- Landing page clickwrap — vendor lead registration
alter table vendor_leads
  add column if not exists privacy_accepted_at timestamptz;
