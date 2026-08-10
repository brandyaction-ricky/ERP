alter table public.erp_expenses
  add column if not exists source_card_usage_id bigint;

alter table public.erp_expenses
  drop constraint if exists erp_expenses_source_card_usage_id_fkey;

alter table public.erp_expenses
  add constraint erp_expenses_source_card_usage_id_fkey
  foreign key (source_card_usage_id)
  references public.erp_card_usages(id)
  on delete cascade;

create unique index if not exists erp_expenses_source_card_usage_id_uidx
  on public.erp_expenses(source_card_usage_id);
