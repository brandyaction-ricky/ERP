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
  category: string;
  description: string;
  vendor: string;
  amount: number;
  payment_method: string;
  payment_status: string;
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

async function readLedger(client: SupabaseClient) {
  const [employeeResult, leaveResult, contractResult, expenseResult] = await Promise.all([
    client.from("erp_employees").select("*").order("name"),
    client
      .from("erp_leave_entries")
      .select("id, employee_id, leave_date, amount, leave_type, note, created_at, erp_employees(name)")
      .order("leave_date", { ascending: false })
      .order("id", { ascending: false }),
    client.from("erp_employment_contracts").select("*").order("start_date", { ascending: false }),
    client.from("erp_expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false }),
  ]);
  if (employeeResult.error) throw new Error(employeeResult.error.message);
  if (leaveResult.error) throw new Error(leaveResult.error.message);
  const schemaReady = !contractResult.error && !expenseResult.error;

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
    category: row.category,
    description: row.description,
    vendor: row.vendor,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    memo: row.memo,
    createdAt: row.created_at,
  }));
  return { employees, entries, contracts, expenses, schemaReady };
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
      const { error } = await client.from("erp_expenses").insert({
        expense_date: expenseDate,
        category,
        description,
        vendor: String(body.vendor ?? "").trim(),
        amount: nonNegativeNumber(body.amount, "금액"),
        payment_method: String(body.paymentMethod ?? "법인카드"),
        payment_status: String(body.paymentStatus ?? "paid"),
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
      const { error } = await client.from("erp_expenses").update({
        expense_date: String(body.expenseDate ?? ""),
        category: String(body.category ?? "").trim(),
        description: String(body.description ?? "").trim(),
        vendor: String(body.vendor ?? "").trim(),
        amount: nonNegativeNumber(body.amount, "금액"),
        payment_method: String(body.paymentMethod ?? "법인카드"),
        payment_status: String(body.paymentStatus ?? "paid"),
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
            : "";
    if (!table) return fail(null, "삭제 대상을 확인해주세요.", 400);
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json(await readLedger(client));
  } catch (error) {
    return fail(error, "삭제하지 못했습니다.");
  }
}
