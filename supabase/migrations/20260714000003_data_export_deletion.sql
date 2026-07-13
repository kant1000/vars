-- Data export rate-limiting column (Item 13)
alter table profiles
  add column if not exists last_data_export_at timestamptz;

alter table vendors
  add column if not exists last_data_export_at timestamptz;

-- Account deletion soft-delete columns (Item 14)
alter table profiles
  add column if not exists is_deleted            boolean    not null default false,
  add column if not exists deleted_at            timestamptz,
  add column if not exists deletion_requested_at timestamptz;

alter table vendors
  add column if not exists is_deleted            boolean    not null default false,
  add column if not exists deleted_at            timestamptz,
  add column if not exists deletion_requested_at timestamptz;

-- Index: admin soft-delete audit
create index if not exists idx_profiles_deleted on profiles (is_deleted) where is_deleted = true;
create index if not exists idx_vendors_deleted  on vendors  (is_deleted) where is_deleted = true;
