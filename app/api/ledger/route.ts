import { createClient, SupabaseClient } from "@supabase/supabase-js";

type EmployeeRow = {
  id: number;
  name: string;
  department: string;
  join_date: string;
  annual_allowance: number | null;
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

async function readLedger(client: SupabaseClient) {
  const [employeeResult, leaveResult] = await Promise.all([
    client.from("erp_employees").select("*").order("name"),
    client
      .from("erp_leave_entries")
      .select("id, employee_id, leave_date, amount, leave_type, note, created_at, erp_employees(name)")
      .order("leave_date", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (employeeResult.error) throw new Error(employeeResult.error.message);
  if (leaveResult.error) throw new Error(leaveResult.error.message);

  const employees = ((employeeResult.data ?? []) as EmployeeRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    department: row.department,
    joinDate: row.join_date,
    annualAllowance: row.annual_allowance,
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
  return { employees, entries };
}

export async function GET() {
  try {
    return Response.json(await readLedger(database()));
  } catch (error) {
    return fail(error, "대장을 불러오지 못했습니다.");
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
      const joinDate = String(body.joinDate ?? "");
      const raw = body.annualAllowance;
      const annualAllowance = raw === "" || raw === null || raw === undefined ? null : Number(raw);
      if (!name || !department || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) return fail(null, "직원 정보를 모두 입력해주세요.", 400);
      if (annualAllowance !== null && (!Number.isFinite(annualAllowance) || annualAllowance < 0)) return fail(null, "직접 부여 일수를 확인해주세요.", 400);
      const { error } = await client.from("erp_employees").insert({ name, department, join_date: joinDate, annual_allowance: annualAllowance });
      if (error) throw new Error(error.message);
    } else if (action === "leave") {
      const employeeId = Number(body.employeeId);
      const leaveDate = String(body.leaveDate ?? "");
      const leaveType = String(body.leaveType ?? "full");
      const note = String(body.note ?? "").trim();
      if (!Number.isInteger(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) return fail(null, "휴가 정보를 확인해주세요.", 400);
      const { error } = await client.from("erp_leave_entries").insert({ employee_id: employeeId, leave_date: leaveDate, amount: leaveType === "full" ? 1 : 0.5, leave_type: leaveType, note });
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
    const id = Number(body.id);
    const name = String(body.name ?? "").trim();
    const department = String(body.department ?? "").trim();
    const joinDate = String(body.joinDate ?? "");
    const raw = body.annualAllowance;
    const annualAllowance = raw === "" || raw === null || raw === undefined ? null : Number(raw);
    if (!Number.isInteger(id) || !name || !department || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) return fail(null, "직원 정보를 확인해주세요.", 400);
    const { error } = await client.from("erp_employees").update({ name, department, join_date: joinDate, annual_allowance: annualAllowance }).eq("id", id);
    if (error) throw new Error(error.message);
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
    const result = kind === "entry"
      ? await client.from("erp_leave_entries").delete().eq("id", id)
      : kind === "employee"
        ? await client.from("erp_employees").delete().eq("id", id)
        : { error: new Error("삭제 대상을 확인해주세요.") };
    if (result.error) throw new Error(result.error.message);
    return Response.json(await readLedger(client));
  } catch (error) {
    return fail(error, "삭제하지 못했습니다.");
  }
}
