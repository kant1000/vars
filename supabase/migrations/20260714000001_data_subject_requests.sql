-- DSR intake table — NDPA 2023 / GAID 2025 s.2.1 (30-day response deadline).
-- Admin-only. Data subjects trigger requests via in-app flows (export, delete).
-- Manual entry supported for email/phone requests received outside the app.

create type dsr_requester_type as enum ('customer', 'vendor', 'external', 'admin');
create type dsr_request_type  as enum ('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'withdraw_consent', 'other');
create type dsr_status        as enum ('open', 'in_progress', 'completed', 'rejected', 'withdrawn');

create table data_subject_requests (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null    default now(),
  requester_type   dsr_requester_type not null,
  request_type     dsr_request_type   not null,
  status           dsr_status         not null default 'open',
  user_id          uuid        references auth.users(id) on delete set null,
  requester_email  text,
  requester_name   text,
  details          text,
  deadline_at      timestamptz not null generated always as (created_at + interval '30 days') stored,
  resolved_at      timestamptz,
  resolved_by      uuid        references auth.users(id) on delete set null,
  resolution_notes text,
  inserted_by      text        not null default 'system'
);

alter table data_subject_requests enable row level security;

create policy "admin_all_dsr"
  on data_subject_requests
  for all
  to authenticated
  using   (is_admin())
  with check (is_admin());

create index idx_dsr_status_deadline on data_subject_requests (status, deadline_at);
create index idx_dsr_user_id         on data_subject_requests (user_id) where user_id is not null;
