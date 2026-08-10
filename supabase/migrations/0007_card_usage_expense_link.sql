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

insert into public.erp_expenses (
  expense_date, cost_type, category, description, vendor, amount,
  payment_method, payment_status, is_recurring, recurring_active,
  recurring_day, recurring_parent_id, recurring_month, source_card_usage_id, memo
)
select
  usage.transaction_date,
  'variable',
  coalesce(nullif(trim(usage.purpose), ''), '카드값'),
  usage.merchant,
  usage.merchant,
  usage.amount,
  case
    when card.id is null then '법인카드'
    else coalesce(nullif(trim(card.card_alias), ''), card.card_company) || ' •••• ' || card.card_last4
  end,
  'paid', false, false, null, null, null, usage.id,
  concat_ws(E'\n',
    '카드 사용·증빙에서 자동 연결된 비용입니다.',
    case when nullif(trim(usage.receipt_url), '') is not null then '증빙: ' || usage.receipt_url end,
    nullif(trim(usage.memo), '')
  )
from public.erp_card_usages usage
left join public.erp_company_cards card on card.id = usage.company_card_id
where usage.evidence_status = 'confirmed'
on conflict (source_card_usage_id) do update set
  expense_date = excluded.expense_date,
  category = excluded.category,
  description = excluded.description,
  vendor = excluded.vendor,
  amount = excluded.amount,
  payment_method = excluded.payment_method,
  payment_status = excluded.payment_status,
  memo = excluded.memo;
