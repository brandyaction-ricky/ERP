alter table public.erp_expenses
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_active boolean not null default false,
  add column if not exists recurring_day smallint,
  add column if not exists recurring_parent_id bigint,
  add column if not exists recurring_month text;

alter table public.erp_expenses
  drop constraint if exists erp_expenses_recurring_day_check;

alter table public.erp_expenses
  add constraint erp_expenses_recurring_day_check
  check (recurring_day is null or recurring_day between 1 and 31);

alter table public.erp_expenses
  drop constraint if exists erp_expenses_recurring_parent_fkey;

alter table public.erp_expenses
  add constraint erp_expenses_recurring_parent_fkey
  foreign key (recurring_parent_id)
  references public.erp_expenses(id)
  on delete set null;

create unique index if not exists erp_expenses_recurring_month_unique
  on public.erp_expenses(recurring_parent_id, recurring_month);

create index if not exists erp_expenses_recurring_active_idx
  on public.erp_expenses(is_recurring, recurring_active)
  where is_recurring = true;
