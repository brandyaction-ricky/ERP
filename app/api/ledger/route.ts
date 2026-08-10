import { createClient, SupabaseClient } from "@supabase/supabase-js";

type EmployeeRow = {
  id: number;
  name: string;
  department: string;
  position: string;
  join_date: string;
  annual_allowance: number | null;
  email: string;
  phone: string;
  birth_date: string | null;
  address: string;
  emergency_contact: string;
  employment_status: string;
  memo: string;
  created_at: string;
};

type LeaveRow = {
  id: number;
  employee_id: number;
  leave_date: string;
  amount: number;
  leave_type: string;
  note: string;
  created_at: string;
  erp_employees: { name: string } | Array<{ name: string }> | null;
};

type ContractRow = {
  id: number;
  employee_id: number;
  contract_type: string;
  start_date: string;
  end_date: string | null;
  monthly_salary: number;
  weekly_hours: number;
  work_start_time: string;
  work_end_time: string;
  probation_end_date: string | null;
  status: string;
  memo: string;
  created_at: string;
};

type ExpenseRow = {
  id: number;
  expense_date: string;
  cost_type: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  is_recurring: boolean;
  recurring_active: boolean;
  recurring_day: number | null;
  recurring_parent_id: number | null;
  recurring_month: string | null;
  memo: string;
  created_at: string;
};

type CompanyCardRow = {
  id: number;
  card_company: string;
  card_name: string;
  card_alias: string;
  card_last4: string;
  holder_name: string;
  credit_limit: number;
  status: string;
  issued_date: string | null;
  expiry_month: string | null;
  responsible_employee_id: number | null;
  memo: string;
  created_at: string;
};

type BankAccountRow = {
  id: number;
  bank_name: string;
  account_name: string;
  account_alias: string;
  account_number: string;
  account_type: string;
  balance: number;
  status: string;
  opened_date: string | null;
  responsible_employee_id: number | null;
  purpose: string;
  memo: string;
  created_at: string;
};

type CardUsageRow = {
  id: number;
  company_card_id: number | null;
  evidence_method: string;
  transaction_date: string;
  merchant: string;
  amount: number;
  requested_amount: number;
  purpose: string;
  user_employee_id: number | null;
  evidence_status: string;
  due_date: string | null;
  receipt_url: string;
  memo: string;
  created_at: string;
};

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase 연결 설정을 확인해주세요.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fail(error: unknown, fallback: string, status = 500) {
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

function employeeName(relation: LeaveRow["erp_employees"]) {
  if (Array.isArray(relation)) return relation[0]?.name ?? "알 수 없음";
  return relation?.name ?? "알 수 없음";
}

function optionalDate(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nonNegativeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}을(를) 확인해주세요.`);
  return number;
}

function finiteNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}을(를) 확인해주세요.`);
  return number;
}

function optionalInteger(value: unknown, label = "담당자") {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label}을(를) 확인해주세요.`);
  return number;
}

function oneOf(value: unknown, allowed: string[], label: string, fallback: string) {
  const text = String(value ?? fallback);
  if (!allowed.includes(text)) throw new Error(`${label}을(를) 확인해주세요.`);
  return text;
}

function expenseCostType(value: unknown) {
  const costType = String(value ?? "variable");
  if (costType !== "fixed" && costType !== "variable") throw new Error("비용 구분을 확인해주세요.");
  return costType;
}

function recurringDay(value: unknown) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("매월 등록일을 확인해주세요.");
  return day;
}

function seoulDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function monthDate(month: string, day: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

async function ensureRecurringExpenses(client: SupabaseClient) {
  const currentMonth = seoulDate().slice(0, 7);
  const { data, error } = await client
    .from("erp_expenses")
    .select("*")
    .eq("is_recurring", true)
    .eq("recurring_active", true);
  if (error) throw new Error(error.message);

  for (const source of (data ?? []) as ExpenseRow[]) {
    if (source.expense_date.slice(0, 7) >= currentMonth) continue;
    const { error: insertError } = await client.from("erp_expenses").upsert({
      expense_date: monthDate(currentMonth, source.recurring_day ?? 1),
      cost_type: "fixed",
      category: source.category,
      description: source.description,
      vendor: source.vendor,
      amount: source.amount,
      payment_method: source.payment_method,
      payment_status: "scheduled",
      is_recurring: false,
      recurring_active: false,
      recurring_day: null,
      recurring_parent_id: source.id,
      recurring_month: currentMonth,
      memo: source.memo,
    }, {
      onConflict: "recurring_parent_id,recurring_month",
      ignoreDuplicates: true,
    });
    if (insertError) throw new Error(insertError.message);
  }
}

async function readLedger(client: SupabaseClient) {
  await ensureRecurringExpenses(client);
  const [employeeResult, leaveResult, contractResult, expenseResult, cardResult, accountResult, usageResult] = await Promise.all([
    client.from("erp_employees").select("*").order("name"),
    client
      .from("erp_leave_entries")
      .select("id, employee_id, leave_date, amount, leave_type, note, created_at, erp_employees(name)")
      .order("leave_date", { ascending: false })
      .order("id", { ascending: false }),
    client.from("erp_employment_contracts").select("*").order("start_date", { ascending: false }),
    client.from("erp_expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false }),
    client.from("erp_company_cards").select("*").order("card_company").order("id"),
    client.from("erp_bank_accounts").select("*").order("bank_name").order("id"),
    client.from("erp_card_usages").select("*").order("transaction_date", { ascending: false }).order("id", { ascending: false }),
  ]);
  if (employeeResult.error) throw new Error(employeeResult.error.message);
  if (leaveResult.error) throw new Error(leaveResult.error.message);
  const schemaReady = !contractResult.error && !expenseResult.error && !cardResult.error && !accountResult.error && !usageResult.error;

  const employees = ((employeeResult.data ?? []) as EmployeeRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    department: row.department,
    position: row.position,
    joinDate: row.join_date,
    annualAllowance: row.annual_allowance,
    email: row.email,
    phone: row.phone,
    birthDate: row.birth_date,
    address: row.address,
    emergencyContact: row.emergency_contact,
    employmentStatus: row.employment_status,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  const entries = ((leaveResult.data ?? []) as unknown as LeaveRow[]).map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: employeeName(row.erp_employees),
    leaveDate: row.leave_date,
    amount: Number(row.amount),
    leaveType: row.leave_type,
    note: row.note,
    createdAt: row.created_at,
  }));
  const contracts = ((contractResult.data ?? []) as ContractRow[]).map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    contractType: row.contract_type,
    startDate: row.start_date,
    endDate: row.end_date,
    monthlySalary: Number(row.monthly_salary),
    weeklyHours: Number(row.weekly_hours),
    workStartTime: row.work_start_time.slice(0, 5),
    workEndTime: row.work_end_time.slice(0, 5),
    probationEndDate: row.probation_end_date,
    status: row.status,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  const expenses = ((expenseResult.data ?? []) as ExpenseRow[]).map((row) => ({
    id: row.id,
    expenseDate: row.expense_date,
    costType: row.cost_type,
    category: row.category,
    description: row.description,
    vendor: row.vendor,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    isRecurring: row.is_recurring,
    recurringActive: row.recurring_active,
    recurringDay: row.recurring_day,
    recurringParentId: row.recurring_parent_id,
    recurringMonth: row.recurring_month,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  const cards = ((cardResult.data ?? []) as CompanyCardRow[]).map((row) => ({
    id: row.id,
    cardCompany: row.card_company,
    cardName: row.card_name,
    cardAlias: row.card_alias,
    cardLast4: row.card_last4,
    holderName: row.holder_name,
    creditLimit: Number(row.credit_limit),
    status: row.status,
    issuedDate: row.issued_date,
    expiryMonth: row.expiry_month,
    responsibleEmployeeId: row.responsible_employee_id,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  const bankAccounts = ((accountResult.data ?? []) as BankAccountRow[]).map((row) => ({
    id: row.id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountAlias: row.account_alias,
    accountNumber: row.account_number,
    accountType: row.account_type,
    balance: Number(row.balance),
    status: row.status,
    openedDate: row.opened_date,
    responsibleEmployeeId: row.responsible_employee_id,
    purpose: row.purpose,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  const cardUsages = ((usageResult.data ?? []) as CardUsageRow[]).map((row) => ({
    id: row.id,
    companyCardId: row.company_card_id,
    evidenceMethod: row.evidence_method,
    transactionDate: row.transaction_date,
    merchant: row.merchant,
    amount: Number(row.amount),
    requestedAmount: Number(row.requested_amount),
    purpose: row.purpose,
    userEmployeeId: row.user_employee_id,
    evidenceStatus: row.evidence_status,
    dueDate: row.due_date,
    receiptUrl: row.receipt_url,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  return { employees, entries, contracts, expenses, cards, bankAccounts, cardUsages, schemaReady };
}

export async function GET() {
  try {
    return Response.json(await readLedger(database()));
  } catch (error) {
    return fail(error, "ERP 정보를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const client = database();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "employee") {
      const name = String(body.name ?? "").trim();
      const department = String(body.department ?? "").trim();
      const position = String(body.position ?? "").trim();
      const joinDate = String(body.joinDate ?? "");
      const rawAllowance = body.annualAllowance;
      const annualAllowance = rawAllowance === "" || rawAllowance === null || rawAllowance === undefined
        ? null
        : nonNegativeNumber(rawAllowance, "직접 부여 연차");
      if (!name || !department || !position || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) {
        return fail(null, "필수 직원 정보를 모두 입력해주세요.", 400);
      }
      const { error } = await client.from("erp_employees").insert({
        name,
        department,
        position,
        join_date: joinDate,
        annual_allowance: annualAllowance,
        email: String(body.email ?? "").trim(),
        phone: String(body.phone ?? "").trim(),
        birth_date: optionalDate(body.birthDate),
        address: String(body.address ?? "").trim(),
        emergency_contact: String(body.emergencyContact ?? "").trim(),
        employment_status: String(body.employmentStatus ?? "active"),
        memo: String(body.memo ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else if (action === "leave") {
      const employeeId = Number(body.employeeId);
      const leaveDate = String(body.leaveDate ?? "");
      const leaveType = String(body.leaveType ?? "full");
      if (!Number.isInteger(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
        return fail(null, "연차 정보를 확인해주세요.", 400);
      }
      const { error } = await client.from("erp_leave_entries").insert({
        employee_id: employeeId,
        leave_date: leaveDate,
        amount: leaveType === "full" ? 1 : 0.5,
        leave_type: leaveType,
        note: String(body.note ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else if (action === "contract") {
      const employeeId = Number(body.employeeId);
      const startDate = String(body.startDate ?? "");
      if (!Number.isInteger(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return fail(null, "근로계약 필수 정보를 확인해주세요.", 400);
      }
      const { error } = await client.from("erp_employment_contracts").insert({
        employee_id: employeeId,
        contract_type: String(body.contractType ?? "permanent"),
        start_date: startDate,
        end_date: optionalDate(body.endDate),
        monthly_salary: nonNegativeNumber(body.monthlySalary, "월 급여"),
        weekly_hours: nonNegativeNumber(body.weeklyHours, "주 근로시간"),
        work_start_time: String(body.workStartTime ?? "09:00"),
        work_end_time: String(body.workEndTime ?? "18:00"),
        probation_end_date: optionalDate(body.probationEndDate),
        status: String(body.status ?? "active"),
        memo: String(body.memo ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else if (action === "expense") {
      const expenseDate = String(body.expenseDate ?? "");
      const category = String(body.category ?? "").trim();
      const description = String(body.description ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || !category || !description) {
        return fail(null, "비용 필수 정보를 확인해주세요.", 400);
      }
      const costType = expenseCostType(body.costType);
      const repeatMonthly = costType === "fixed" && body.repeatMonthly === true;
      const { error } = await client.from("erp_expenses").insert({
        expense_date: expenseDate,
        cost_type: costType,
        category,
        description,
        vendor: String(body.vendor ?? "").trim(),
        amount: nonNegativeNumber(body.amount, "금액"),
        payment_method: String(body.paymentMethod ?? "법인카드"),
        payment_status: String(body.paymentStatus ?? "paid"),
        is_recurring: repeatMonthly,
        recurring_active: repeatMonthly,
        recurring_day: repeatMonthly ? recurringDay(body.recurringDay) : null,
        recurring_parent_id: null,
        recurring_month: null,
        memo: String(body.memo ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else if (action === "card") {
      const cardCompany = String(body.cardCompany ?? "").trim();
      const cardAlias = String(body.cardAlias ?? "").trim();
      const cardLast4 = String(body.cardLast4 ?? "").replace(/\D/g, "");
      const expiryMonth = String(body.expiryMonth ?? "").trim();
      if (!cardCompany || !cardAlias || !/^\d{4}$/.test(cardLast4)) {
        return fail(null, "카드사·별칭·끝 4자리를 확인해주세요.", 400);
      }
      if (expiryMonth && !/^\d{4}-\d{2}$/.test(expiryMonth)) return fail(null, "카드 유효기간을 확인해주세요.", 400);
      const { error } = await client.from("erp_company_cards").insert({
        card_company: cardCompany,
        card_name: String(body.cardName ?? "").trim(),
        card_alias: cardAlias,
        card_last4: cardLast4,
        holder_name: String(body.holderName ?? "").trim(),
        credit_limit: nonNegativeNumber(body.creditLimit, "카드 한도"),
        status: oneOf(body.status, ["active", "inactive"], "카드 상태", "active"),
        issued_date: optionalDate(body.issuedDate),
        expiry_month: expiryMonth || null,
        responsible_employee_id: optionalInteger(body.responsibleEmployeeId),
        memo: String(body.memo ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else if (action === "bankAccount") {
      const bankName = String(body.bankName ?? "").trim();
      const accountAlias = String(body.accountAlias ?? "").trim();
      const accountNumber = String(body.accountNumber ?? "").trim();
      if (!bankName || !accountAlias || !accountNumber) return fail(null, "은행·통장 별칭·계좌번호를 확인해주세요.", 400);
      const { error } = await client.from("erp_bank_accounts").insert({
        bank_name: bankName,
        account_name: String(body.accountName ?? "").trim(),
        account_alias: accountAlias,
        account_number: accountNumber,
        account_type: oneOf(body.accountType, ["checking", "savings", "loan", "other"], "통장 유형", "checking"),
        balance: finiteNumber(body.balance, "현재 잔액"),
        status: oneOf(body.status, ["active", "inactive"], "통장 상태", "active"),
        opened_date: optionalDate(body.openedDate),
        responsible_employee_id: optionalInteger(body.responsibleEmployeeId),
        purpose: String(body.purpose ?? "").trim(),
        memo: String(body.memo ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else if (action === "cardUsage") {
      const transactionDate = String(body.transactionDate ?? "");
      const merchant = String(body.merchant ?? "").trim();
      const purpose = String(body.purpose ?? "").trim();
      const evidenceMethod = oneOf(body.evidenceMethod, ["corporate-card", "tax-invoice", "cash-receipt", "other"], "증빙 수단", "corporate-card");
      const companyCardId = evidenceMethod === "corporate-card" ? optionalInteger(body.companyCardId, "카드") : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !merchant || !purpose) {
        return fail(null, "거래일·사용처·용도를 확인해주세요.", 400);
      }
      if (evidenceMethod === "corporate-card" && companyCardId === null) return fail(null, "사용한 법인카드를 선택해주세요.", 400);
      const { error } = await client.from("erp_card_usages").insert({
        company_card_id: companyCardId,
        evidence_method: evidenceMethod,
        transaction_date: transactionDate,
        merchant,
        amount: nonNegativeNumber(body.amount, "합계 금액"),
        requested_amount: nonNegativeNumber(body.requestedAmount, "요청 금액"),
        purpose,
        user_employee_id: optionalInteger(body.userEmployeeId, "사용자"),
        evidence_status: oneOf(body.evidenceStatus, ["missing", "submitted", "confirmed"], "증빙 상태", "missing"),
        due_date: optionalDate(body.dueDate),
        receipt_url: String(body.receiptUrl ?? "").trim(),
        memo: String(body.memo ?? "").trim(),
      });
      if (error) throw new Error(error.message);
    } else {
      return fail(null, "지원하지 않는 요청입니다.", 400);
    }
    return Response.json(await readLedger(client), { status: 201 });
  } catch (error) {
    return fail(error, "저장하지 못했습니다.");
  }
}

export async function PATCH(request: Request) {
  try {
    const client = database();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "employee");
    const id = Number(body.id);
    if (!Number.isInteger(id)) return fail(null, "수정 대상을 확인해주세요.", 400);

    if (action === "employee") {
      const name = String(body.name ?? "").trim();
      const department = String(body.department ?? "").trim();
      const position = String(body.position ?? "").trim();
      const joinDate = String(body.joinDate ?? "");
      const rawAllowance = body.annualAllowance;
      const annualAllowance = rawAllowance === "" || rawAllowance === null || rawAllowance === undefined
        ? null
        : nonNegativeNumber(rawAllowance, "직접 부여 연차");
      if (!name || !department || !position || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) {
        return fail(null, "필수 직원 정보를 확인해주세요.", 400);
      }
      const { error } = await client.from("erp_employees").update({
        name,
        department,
        position,
        join_date: joinDate,
        annual_allowance: annualAllowance,
        email: String(body.email ?? "").trim(),
        phone: String(body.phone ?? "").trim(),
        birth_date: optionalDate(body.birthDate),
        address: String(body.address ?? "").trim(),
        emergency_contact: String(body.emergencyContact ?? "").trim(),
        employment_status: String(body.employmentStatus ?? "active"),
        memo: String(body.memo ?? "").trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "contract") {
      const { error } = await client.from("erp_employment_contracts").update({
        contract_type: String(body.contractType ?? "permanent"),
        start_date: String(body.startDate ?? ""),
        end_date: optionalDate(body.endDate),
        monthly_salary: nonNegativeNumber(body.monthlySalary, "월 급여"),
        weekly_hours: nonNegativeNumber(body.weeklyHours, "주 근로시간"),
        work_start_time: String(body.workStartTime ?? "09:00"),
        work_end_time: String(body.workEndTime ?? "18:00"),
        probation_end_date: optionalDate(body.probationEndDate),
        status: String(body.status ?? "active"),
        memo: String(body.memo ?? "").trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "expense") {
      const costType = expenseCostType(body.costType);
      const repeatMonthly = costType === "fixed" && body.repeatMonthly === true;
      const { error } = await client.from("erp_expenses").update({
        expense_date: String(body.expenseDate ?? ""),
        cost_type: costType,
        category: String(body.category ?? "").trim(),
        description: String(body.description ?? "").trim(),
        vendor: String(body.vendor ?? "").trim(),
        amount: nonNegativeNumber(body.amount, "금액"),
        payment_method: String(body.paymentMethod ?? "법인카드"),
        payment_status: String(body.paymentStatus ?? "paid"),
        is_recurring: repeatMonthly,
        recurring_active: repeatMonthly,
        recurring_day: repeatMonthly ? recurringDay(body.recurringDay) : null,
        memo: String(body.memo ?? "").trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "card") {
      const cardCompany = String(body.cardCompany ?? "").trim();
      const cardAlias = String(body.cardAlias ?? "").trim();
      const cardLast4 = String(body.cardLast4 ?? "").replace(/\D/g, "");
      const expiryMonth = String(body.expiryMonth ?? "").trim();
      if (!cardCompany || !cardAlias || !/^\d{4}$/.test(cardLast4)) return fail(null, "카드 필수 정보를 확인해주세요.", 400);
      const { error } = await client.from("erp_company_cards").update({
        card_company: cardCompany,
        card_name: String(body.cardName ?? "").trim(),
        card_alias: cardAlias,
        card_last4: cardLast4,
        holder_name: String(body.holderName ?? "").trim(),
        credit_limit: nonNegativeNumber(body.creditLimit, "카드 한도"),
        status: oneOf(body.status, ["active", "inactive"], "카드 상태", "active"),
        issued_date: optionalDate(body.issuedDate),
        expiry_month: expiryMonth || null,
        responsible_employee_id: optionalInteger(body.responsibleEmployeeId),
        memo: String(body.memo ?? "").trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "bankAccount") {
      const bankName = String(body.bankName ?? "").trim();
      const accountAlias = String(body.accountAlias ?? "").trim();
      const accountNumber = String(body.accountNumber ?? "").trim();
      if (!bankName || !accountAlias || !accountNumber) return fail(null, "통장 필수 정보를 확인해주세요.", 400);
      const { error } = await client.from("erp_bank_accounts").update({
        bank_name: bankName,
        account_name: String(body.accountName ?? "").trim(),
        account_alias: accountAlias,
        account_number: accountNumber,
        account_type: oneOf(body.accountType, ["checking", "savings", "loan", "other"], "통장 유형", "checking"),
        balance: finiteNumber(body.balance, "현재 잔액"),
        status: oneOf(body.status, ["active", "inactive"], "통장 상태", "active"),
        opened_date: optionalDate(body.openedDate),
        responsible_employee_id: optionalInteger(body.responsibleEmployeeId),
        purpose: String(body.purpose ?? "").trim(),
        memo: String(body.memo ?? "").trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "cardUsage") {
      const evidenceMethod = oneOf(body.evidenceMethod, ["corporate-card", "tax-invoice", "cash-receipt", "other"], "증빙 수단", "corporate-card");
      const companyCardId = evidenceMethod === "corporate-card" ? optionalInteger(body.companyCardId, "카드") : null;
      const { error } = await client.from("erp_card_usages").update({
        company_card_id: companyCardId,
        evidence_method: evidenceMethod,
        transaction_date: String(body.transactionDate ?? ""),
        merchant: String(body.merchant ?? "").trim(),
        amount: nonNegativeNumber(body.amount, "합계 금액"),
        requested_amount: nonNegativeNumber(body.requestedAmount, "요청 금액"),
        purpose: String(body.purpose ?? "").trim(),
        user_employee_id: optionalInteger(body.userEmployeeId, "사용자"),
        evidence_status: oneOf(body.evidenceStatus, ["missing", "submitted", "confirmed"], "증빙 상태", "missing"),
        due_date: optionalDate(body.dueDate),
        receipt_url: String(body.receiptUrl ?? "").trim(),
        memo: String(body.memo ?? "").trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      return fail(null, "지원하지 않는 수정 요청입니다.", 400);
    }
    return Response.json(await readLedger(client));
  } catch (error) {
    return fail(error, "수정하지 못했습니다.");
  }
}

export async function DELETE(request: Request) {
  try {
    const client = database();
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id)) return fail(null, "삭제 대상을 확인해주세요.", 400);
    const table = kind === "entry"
      ? "erp_leave_entries"
      : kind === "employee"
        ? "erp_employees"
        : kind === "contract"
          ? "erp_employment_contracts"
          : kind === "expense"
            ? "erp_expenses"
            : kind === "card"
              ? "erp_company_cards"
              : kind === "bankAccount"
                ? "erp_bank_accounts"
                : kind === "cardUsage"
                  ? "erp_card_usages"
            : "";
    if (!table) return fail(null, "삭제 대상을 확인해주세요.", 400);
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json(await readLedger(client));
  } catch (error) {
    return fail(error, "삭제하지 못했습니다.");
  }
}
