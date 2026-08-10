alter table public.erp_expenses
  add column if not exists cost_type text;

update public.erp_expenses
set cost_type = case
  when category in ('인건비', '임대료·관리비', '보험료', '소프트웨어·구독료', '통신비', '세금·공과금', '기타 고정비') then 'fixed'
  else 'variable'
end
where cost_type is null or cost_type not in ('fixed', 'variable');

alter table public.erp_expenses
  alter column cost_type set default 'variable',
  alter column cost_type set not null;

alter table public.erp_expenses
  drop constraint if exists erp_expenses_cost_type_check;

alter table public.erp_expenses
  add constraint erp_expenses_cost_type_check
  check (cost_type in ('fixed', 'variable'));

create index if not exists erp_expenses_cost_type_idx
  on public.erp_expenses(cost_type);
