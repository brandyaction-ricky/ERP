"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Employee = {
  id: number;
  name: string;
  department: string;
  position: string;
  joinDate: string;
  annualAllowance: number | null;
  email: string;
  phone: string;
  birthDate: string | null;
  address: string;
  emergencyContact: string;
  employmentStatus: "active" | "leave" | "retired";
  memo: string;
  createdAt: string;
};

type LeaveEntry = {
  id: number;
  employeeId: number;
  employeeName: string;
  leaveDate: string;
  amount: number;
  leaveType: "full" | "half-am" | "half-pm";
  note: string;
  createdAt: string;
};

type Contract = {
  id: number;
  employeeId: number;
  contractType: "permanent" | "fixed" | "part-time" | "freelance";
  startDate: string;
  endDate: string | null;
  monthlySalary: number;
  weeklyHours: number;
  workStartTime: string;
  workEndTime: string;
  probationEndDate: string | null;
  status: "draft" | "active" | "expired";
  memo: string;
  createdAt: string;
};

type Expense = {
  id: number;
  expenseDate: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: "paid" | "scheduled";
  memo: string;
  createdAt: string;
};

type ERPData = { employees: Employee[]; entries: LeaveEntry[]; contracts: Contract[]; expenses: Expense[]; schemaReady?: boolean };
type Section = "dashboard" | "employees" | "leave" | "expenses";
type EmployeeTab = "info" | "contract" | "leave";

const EMPTY_DATA: ERPData = { employees: [], entries: [], contracts: [], expenses: [], schemaReady: true };
const DEPARTMENTS = ["콘텐츠팀", "마케팅팀", "디자인팀", "개발팀", "경영지원"];
const EXPENSE_CATEGORIES = ["인건비", "임대료·관리비", "광고비", "소프트웨어·구독료", "외주비", "세금·수수료", "복리후생비", "출장·교통비", "기타 비용"];

function localIsoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string | null, withYear = true) {
  if (!value) return "미설정";
  return new Intl.DateTimeFormat("ko-KR", {
    ...(withYear ? { year: "numeric" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${value}T12:00:00+09:00`));
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function calcFullMonths(start: Date, end: Date) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function calcAccrued(joinDate: string, manual: number | null, asOf: Date) {
  if (manual !== null) return manual;
  const fullMonths = calcFullMonths(new Date(`${joinDate}T00:00:00`), asOf);
  if (fullMonths < 12) return Math.min(11, fullMonths);
  return Math.min(25, 15 + Math.floor((Math.floor(fullMonths / 12) - 1) / 2));
}

function tenure(joinDate: string) {
  const months = calcFullMonths(new Date(`${joinDate}T00:00:00`), new Date());
  if (months < 12) return `${months}개월 재직`;
  const years = Math.floor(months / 12);
  return months % 12 ? `${years}년 ${months % 12}개월 재직` : `${years}년 재직`;
}

function leaveLabel(type: LeaveEntry["leaveType"]) {
  return type === "half-am" ? "오전 반차" : type === "half-pm" ? "오후 반차" : "연차";
}

function contractLabel(type: Contract["contractType"]) {
  return { permanent: "정규직", fixed: "계약직", "part-time": "파트타임", freelance: "프리랜서" }[type];
}

function employeeStatusLabel(status: Employee["employmentStatus"]) {
  return { active: "재직", leave: "휴직", retired: "퇴사" }[status];
}

function initials(name: string) {
  return name.slice(-2);
}

function employeeDraft(employee?: Employee) {
  return {
    id: employee?.id,
    name: employee?.name ?? "",
    department: employee?.department ?? "콘텐츠팀",
    position: employee?.position ?? "담당자",
    joinDate: employee?.joinDate ?? localIsoDate(),
    annualAllowance: employee?.annualAllowance === null || employee?.annualAllowance === undefined ? "" : String(employee.annualAllowance),
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    birthDate: employee?.birthDate ?? "",
    address: employee?.address ?? "",
    emergencyContact: employee?.emergencyContact ?? "",
    employmentStatus: employee?.employmentStatus ?? ("active" as Employee["employmentStatus"]),
    memo: employee?.memo ?? "",
  };
}

function contractDraft(employeeId: number, contract?: Contract) {
  return {
    id: contract?.id,
    employeeId: String(employeeId),
    contractType: contract?.contractType ?? ("permanent" as Contract["contractType"]),
    startDate: contract?.startDate ?? localIsoDate(),
    endDate: contract?.endDate ?? "",
    monthlySalary: contract ? String(contract.monthlySalary) : "",
    weeklyHours: contract ? String(contract.weeklyHours) : "40",
    workStartTime: contract?.workStartTime ?? "09:00",
    workEndTime: contract?.workEndTime ?? "18:00",
    probationEndDate: contract?.probationEndDate ?? "",
    status: contract?.status ?? ("active" as Contract["status"]),
    memo: contract?.memo ?? "",
  };
}

function expenseDraft(expense?: Expense) {
  return {
    id: expense?.id,
    expenseDate: expense?.expenseDate ?? localIsoDate(),
    category: expense?.category ?? "소프트웨어·구독료",
    description: expense?.description ?? "",
    vendor: expense?.vendor ?? "",
    amount: expense ? String(expense.amount) : "",
    paymentMethod: expense?.paymentMethod ?? "법인카드",
    paymentStatus: expense?.paymentStatus ?? ("paid" as Expense["paymentStatus"]),
    memo: expense?.memo ?? "",
  };
}

export default function Home() {
  const today = localIsoDate();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = today.slice(0, 7);
  const [data, setData] = useState<ERPData>(EMPTY_DATA);
  const [section, setSection] = useState<Section>("dashboard");
  const [employeeTab, setEmployeeTab] = useState<EmployeeTab>("info");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expenseMonth, setExpenseMonth] = useState(currentMonth);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("전체 팀");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [employeeModal, setEmployeeModal] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(employeeDraft());
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", leaveDate: today, leaveType: "full" as LeaveEntry["leaveType"], note: "" });
  const [contractForm, setContractForm] = useState(contractDraft(0));
  const [expenseForm, setExpenseForm] = useState(expenseDraft());

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ledger", { cache: "no-store" });
      const result = (await response.json()) as ERPData & { error?: string };
      if (!response.ok) throw new Error(result.error || "ERP 정보를 불러오지 못했습니다.");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ERP 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeEmployees = useMemo(() => data.employees.filter((employee) => employee.employmentStatus === "active"), [data.employees]);
  const yearEntries = useMemo(() => data.entries.filter((entry) => Number(entry.leaveDate.slice(0, 4)) === selectedYear), [data.entries, selectedYear]);
  const selectedEmployee = data.employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const selectedEmployeeContracts = data.contracts.filter((contract) => contract.employeeId === selectedEmployeeId);
  const selectedEmployeeEntries = yearEntries.filter((entry) => entry.employeeId === selectedEmployeeId);

  const employeeRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.employees.filter((employee) =>
      (department === "전체 팀" || employee.department === department) &&
      (!query || `${employee.name} ${employee.department} ${employee.position} ${employee.email}`.toLowerCase().includes(query)),
    );
  }, [data.employees, search, department]);

  const leaveRows = useMemo(() => data.employees.map((employee) => {
    const employeeEntries = yearEntries.filter((entry) => entry.employeeId === employee.id);
    const accrued = calcAccrued(employee.joinDate, employee.annualAllowance, new Date());
    const used = employeeEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    return { employee, accrued, used, remaining: accrued - used, entries: employeeEntries };
  }), [data.employees, yearEntries]);

  const monthExpenses = useMemo(() => data.expenses.filter((expense) => expense.expenseDate.startsWith(expenseMonth)), [data.expenses, expenseMonth]);
  const monthlyExpenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const annualExpenseTotal = data.expenses.filter((expense) => expense.expenseDate.startsWith(String(currentYear))).reduce((sum, expense) => sum + expense.amount, 0);
  const upcomingLeaves = data.entries.filter((entry) => entry.leaveDate >= today).slice(0, 5);
  const expiringContracts = data.contracts.filter((contract) => contract.endDate && contract.endDate >= today && contract.endDate <= localIsoDate(new Date(Date.now() + 60 * 86_400_000)));

  async function save(payload: Record<string, unknown>, method: "POST" | "PATCH" = "POST") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ledger", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ERPData & { error?: string };
      if (!response.ok) throw new Error(result.error || "저장하지 못했습니다.");
      setData(result);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: "employee" | "entry" | "contract" | "expense", id: number) {
    const message = kind === "employee" ? "직원과 연결된 계약·연차 기록을 모두 삭제할까요?" : "선택한 기록을 삭제할까요?";
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/ledger?kind=${kind}&id=${id}`, { method: "DELETE" });
      const result = (await response.json()) as ERPData & { error?: string };
      if (!response.ok) throw new Error(result.error || "삭제하지 못했습니다.");
      setData(result);
      if (kind === "employee") setSelectedEmployeeId(null);
      setToast("삭제되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openEmployee(employee?: Employee) {
    setEmployeeForm(employeeDraft(employee));
    setEmployeeModal(true);
  }

  function openLeave(employeeId?: number) {
    setLeaveForm({ employeeId: String(employeeId ?? activeEmployees[0]?.id ?? ""), leaveDate: today, leaveType: "full", note: "" });
    setLeaveModal(true);
  }

  function openContract(employeeId: number, contract?: Contract) {
    setContractForm(contractDraft(employeeId, contract));
    setContractModal(true);
  }

  function openExpense(expense?: Expense) {
    setExpenseForm(expenseDraft(expense));
    setExpenseModal(true);
  }

  function viewEmployee(employee: Employee) {
    setSelectedEmployeeId(employee.id);
    setEmployeeTab("info");
    setSection("employees");
  }

  async function submitEmployee(event: FormEvent) {
    event.preventDefault();
    if (await save({ action: "employee", ...employeeForm }, employeeForm.id ? "PATCH" : "POST")) {
      setEmployeeModal(false);
      setToast(employeeForm.id ? "직원 정보가 수정되었습니다." : "새 직원이 등록되었습니다.");
    }
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();
    if (await save({ action: "leave", ...leaveForm })) {
      setLeaveModal(false);
      setToast("연차 사용 내역이 등록되었습니다.");
    }
  }

  async function submitContract(event: FormEvent) {
    event.preventDefault();
    if (await save({ action: "contract", ...contractForm }, contractForm.id ? "PATCH" : "POST")) {
      setContractModal(false);
      setToast(contractForm.id ? "근로계약이 수정되었습니다." : "근로계약이 등록되었습니다.");
    }
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    if (await save({ action: "expense", ...expenseForm }, expenseForm.id ? "PATCH" : "POST")) {
      setExpenseModal(false);
      setExpenseMonth(expenseForm.expenseDate.slice(0, 7));
      setToast(expenseForm.id ? "비용 내역이 수정되었습니다." : "회사 비용이 등록되었습니다.");
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  const sectionCopy = {
    dashboard: ["운영 대시보드", "사람과 비용을 한눈에 확인합니다."],
    employees: ["직원 관리", "기본 정보부터 근로계약까지 직원별로 관리합니다."],
    leave: ["연차 관리", "직원별 발생·사용·잔여 연차를 확인합니다."],
    expenses: ["회사 비용", "매월 발생한 회사 비용을 직접 입력하고 집계합니다."],
  }[section];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setSection("dashboard"); setSelectedEmployeeId(null); }}>
          <span className="brand-mark">B</span><span>BRANDYACTION <b>ERP</b></span>
        </button>
        <nav className="desktop-nav" aria-label="관리 메뉴">
          {(["dashboard", "employees", "leave", "expenses"] as Section[]).map((item) => (
            <button key={item} className={section === item ? "active" : ""} onClick={() => { setSection(item); if (item !== "employees") setSelectedEmployeeId(null); }}>
              {{ dashboard: "대시보드", employees: "직원 관리", leave: "연차 관리", expenses: "회사 비용" }[item]}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="admin-badge"><i /> 관리자 전용</span>
          <button className="logout-button" onClick={logout}>로그아웃</button>
        </div>
      </header>

      <main className="page">
        <section className="intro">
          <div>
            <p className="eyebrow">INTERNAL MANAGEMENT</p>
            <h1>{selectedEmployee ? selectedEmployee.name : sectionCopy[0]}</h1>
            <p className="intro-copy">{selectedEmployee ? `${selectedEmployee.department} · ${selectedEmployee.position} · ${tenure(selectedEmployee.joinDate)}` : sectionCopy[1]}</p>
          </div>
          <div className="intro-actions">
            {selectedEmployee && <button className="secondary-button" onClick={() => setSelectedEmployeeId(null)}>← 직원 목록</button>}
            {section === "employees" && <button className="primary-button" onClick={() => openEmployee()}>+ 직원 등록</button>}
            {section === "leave" && <button className="primary-button" onClick={() => openLeave()}>+ 연차 등록</button>}
            {section === "expenses" && <button className="primary-button" onClick={() => openExpense()}>+ 비용 등록</button>}
          </div>
        </section>

        {error && <div className="error-banner"><span>!</span><p>{error}</p><button onClick={() => setError("")}>닫기</button></div>}
        {data.schemaReady === false && <div className="error-banner"><span>!</span><p>직원 계약·회사 비용 데이터베이스 업데이트가 아직 적용되지 않았습니다. 기존 연차 정보는 정상적으로 조회할 수 있습니다.</p></div>}

        {loading ? <div className="workspace loading-block">ERP 데이터를 불러오고 있습니다.</div> : (
          <>
            {section === "dashboard" && (
              <Dashboard
                activeCount={activeEmployees.length}
                upcomingCount={upcomingLeaves.length}
                monthlyExpense={monthlyExpenseTotal}
                contractCount={expiringContracts.length}
                upcomingLeaves={upcomingLeaves}
                expenses={monthExpenses}
                contracts={expiringContracts}
                employees={data.employees}
                onEmployee={viewEmployee}
                onSection={setSection}
              />
            )}

            {section === "employees" && !selectedEmployee && (
              <EmployeeList
                employees={employeeRows}
                search={search}
                department={department}
                onSearch={setSearch}
                onDepartment={setDepartment}
                onView={viewEmployee}
                onEdit={openEmployee}
              />
            )}

            {section === "employees" && selectedEmployee && (
              <EmployeeDetail
                employee={selectedEmployee}
                tab={employeeTab}
                contracts={selectedEmployeeContracts}
                entries={selectedEmployeeEntries}
                year={selectedYear}
                onTab={setEmployeeTab}
                onYear={setSelectedYear}
                onEdit={() => openEmployee(selectedEmployee)}
                onContract={(contract) => openContract(selectedEmployee.id, contract)}
                onLeave={() => openLeave(selectedEmployee.id)}
                onDeleteEmployee={() => remove("employee", selectedEmployee.id)}
                onDeleteContract={(id) => remove("contract", id)}
                onDeleteEntry={(id) => remove("entry", id)}
              />
            )}

            {section === "leave" && (
              <LeaveManagement rows={leaveRows} entries={yearEntries} year={selectedYear} onYear={setSelectedYear} onLeave={openLeave} onEmployee={viewEmployee} onDelete={(id) => remove("entry", id)} />
            )}

            {section === "expenses" && (
              <ExpenseManagement expenses={monthExpenses} month={expenseMonth} monthlyTotal={monthlyExpenseTotal} annualTotal={annualExpenseTotal} onMonth={setExpenseMonth} onEdit={openExpense} onDelete={(id) => remove("expense", id)} />
            )}
          </>
        )}
      </main>

      <footer><span>BRANDYACTION ERP</span><p>직원 정보와 회사 비용은 승인된 관리자만 열람할 수 있습니다.</p></footer>

      {employeeModal && (
        <Modal title={employeeForm.id ? "직원 정보 수정" : "새 직원 등록"} description="운영에 필요한 기본 인사 정보를 입력합니다." onClose={() => setEmployeeModal(false)}>
          <form className="modal-form" onSubmit={submitEmployee}>
            <div className="form-grid two"><Field label="이름 *"><input required value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></Field><Field label="재직 상태"><select value={employeeForm.employmentStatus} onChange={(e) => setEmployeeForm({ ...employeeForm, employmentStatus: e.target.value as Employee["employmentStatus"] })}><option value="active">재직</option><option value="leave">휴직</option><option value="retired">퇴사</option></select></Field></div>
            <div className="form-grid two"><Field label="부서 *"><select value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="직책·직급 *"><input required value={employeeForm.position} onChange={(e) => setEmployeeForm({ ...employeeForm, position: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="입사일 *"><input required type="date" value={employeeForm.joinDate} onChange={(e) => setEmployeeForm({ ...employeeForm, joinDate: e.target.value })} /></Field><Field label="생년월일"><input type="date" value={employeeForm.birthDate} onChange={(e) => setEmployeeForm({ ...employeeForm, birthDate: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="회사 이메일"><input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} /></Field><Field label="휴대전화"><input value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} /></Field></div>
            <Field label="주소"><input value={employeeForm.address} onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })} /></Field>
            <div className="form-grid two"><Field label="비상 연락처"><input value={employeeForm.emergencyContact} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContact: e.target.value })} /></Field><Field label="직접 부여 연차"><input type="number" min="0" step="0.5" value={employeeForm.annualAllowance} onChange={(e) => setEmployeeForm({ ...employeeForm, annualAllowance: e.target.value })} placeholder="자동 계산" /></Field></div>
            <Field label="인사 메모"><textarea value={employeeForm.memo} onChange={(e) => setEmployeeForm({ ...employeeForm, memo: e.target.value })} /></Field>
            <ModalActions saving={saving} onCancel={() => setEmployeeModal(false)} label="직원 정보 저장" />
          </form>
        </Modal>
      )}

      {leaveModal && (
        <Modal title="연차 사용 등록" description="연차와 반차 사용 내역을 기록합니다." onClose={() => setLeaveModal(false)}>
          <form className="modal-form" onSubmit={submitLeave}>
            <Field label="직원 *"><select required value={leaveForm.employeeId} onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}><option value="">직원을 선택하세요</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></Field>
            <Field label="사용일 *"><input required type="date" value={leaveForm.leaveDate} onChange={(e) => setLeaveForm({ ...leaveForm, leaveDate: e.target.value })} /></Field>
            <Field label="사용 유형"><select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value as LeaveEntry["leaveType"] })}><option value="full">연차 1일</option><option value="half-am">오전 반차 0.5일</option><option value="half-pm">오후 반차 0.5일</option></select></Field>
            <Field label="메모"><textarea value={leaveForm.note} onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })} placeholder="필요한 경우 사유나 참고사항을 기록하세요." /></Field>
            <ModalActions saving={saving} onCancel={() => setLeaveModal(false)} label="연차 등록" />
          </form>
        </Modal>
      )}

      {contractModal && (
        <Modal title={contractForm.id ? "근로계약 수정" : "근로계약 등록"} description="계약 기간, 급여와 근로 조건을 기록합니다." onClose={() => setContractModal(false)} wide>
          <form className="modal-form" onSubmit={submitContract}>
            <div className="form-grid two"><Field label="계약 유형"><select value={contractForm.contractType} onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value as Contract["contractType"] })}><option value="permanent">정규직</option><option value="fixed">계약직</option><option value="part-time">파트타임</option><option value="freelance">프리랜서</option></select></Field><Field label="계약 상태"><select value={contractForm.status} onChange={(e) => setContractForm({ ...contractForm, status: e.target.value as Contract["status"] })}><option value="draft">작성 중</option><option value="active">계약 중</option><option value="expired">종료</option></select></Field></div>
            <div className="form-grid two"><Field label="계약 시작일 *"><input required type="date" value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} /></Field><Field label="계약 종료일"><input type="date" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="월 급여 *"><input required type="number" min="0" value={contractForm.monthlySalary} onChange={(e) => setContractForm({ ...contractForm, monthlySalary: e.target.value })} /></Field><Field label="주 근로시간"><input required type="number" min="0" step="0.5" value={contractForm.weeklyHours} onChange={(e) => setContractForm({ ...contractForm, weeklyHours: e.target.value })} /></Field></div>
            <div className="form-grid three"><Field label="출근 시간"><input required type="time" value={contractForm.workStartTime} onChange={(e) => setContractForm({ ...contractForm, workStartTime: e.target.value })} /></Field><Field label="퇴근 시간"><input required type="time" value={contractForm.workEndTime} onChange={(e) => setContractForm({ ...contractForm, workEndTime: e.target.value })} /></Field><Field label="수습 종료일"><input type="date" value={contractForm.probationEndDate} onChange={(e) => setContractForm({ ...contractForm, probationEndDate: e.target.value })} /></Field></div>
            <Field label="계약 메모"><textarea value={contractForm.memo} onChange={(e) => setContractForm({ ...contractForm, memo: e.target.value })} /></Field>
            <ModalActions saving={saving} onCancel={() => setContractModal(false)} label="근로계약 저장" />
          </form>
        </Modal>
      )}

      {expenseModal && (
        <Modal title={expenseForm.id ? "비용 내역 수정" : "회사 비용 등록"} description="증빙 자료를 기준으로 비용을 직접 입력합니다." onClose={() => setExpenseModal(false)}>
          <form className="modal-form" onSubmit={submitExpense}>
            <div className="form-grid two"><Field label="사용일 *"><input required type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /></Field><Field label="비용 분류 *"><select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field></div>
            <Field label="사용 내역 *"><input required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="예: 메타 광고비 8월 1주차" /></Field>
            <div className="form-grid two"><Field label="거래처"><input value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} /></Field><Field label="금액 *"><input required type="number" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="결제수단"><select value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}><option>법인카드</option><option>계좌이체</option><option>자동이체</option><option>개인카드</option><option>현금</option></select></Field><Field label="결제 상태"><select value={expenseForm.paymentStatus} onChange={(e) => setExpenseForm({ ...expenseForm, paymentStatus: e.target.value as Expense["paymentStatus"] })}><option value="paid">결제 완료</option><option value="scheduled">결제 예정</option></select></Field></div>
            <Field label="메모"><textarea value={expenseForm.memo} onChange={(e) => setExpenseForm({ ...expenseForm, memo: e.target.value })} /></Field>
            <ModalActions saving={saving} onCancel={() => setExpenseModal(false)} label="비용 저장" />
          </form>
        </Modal>
      )}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Dashboard({ activeCount, upcomingCount, monthlyExpense, contractCount, upcomingLeaves, expenses, contracts, employees, onEmployee, onSection }: {
  activeCount: number; upcomingCount: number; monthlyExpense: number; contractCount: number; upcomingLeaves: LeaveEntry[]; expenses: Expense[]; contracts: Contract[]; employees: Employee[]; onEmployee: (employee: Employee) => void; onSection: (section: Section) => void;
}) {
  return <>
    <div className="stat-grid">
      <Stat label="재직 직원" value={`${activeCount}명`} note="현재 재직 상태 기준" tone="red" />
      <Stat label="예정 연차" value={`${upcomingCount}건`} note="오늘 이후 등록 내역" />
      <Stat label="이번 달 회사 비용" value={formatMoney(monthlyExpense)} note="직접 입력된 비용 합계" />
      <Stat label="계약 만료 예정" value={`${contractCount}건`} note="60일 이내 종료 계약" tone="cream" />
    </div>
    <div className="dashboard-grid">
      <section className="workspace panel">
        <PanelHead title="다가오는 연차" subtitle="예정된 직원 일정을 확인합니다." action="전체 보기" onAction={() => onSection("leave")} />
        {upcomingLeaves.length ? <div className="compact-list">{upcomingLeaves.map((entry) => <div key={entry.id} className="compact-row"><div className="avatar">{initials(entry.employeeName)}</div><div><strong>{entry.employeeName}</strong><small>{formatDate(entry.leaveDate)} · {leaveLabel(entry.leaveType)}</small></div><span>{entry.amount}일</span></div>)}</div> : <Empty text="등록된 예정 연차가 없습니다." />}
      </section>
      <section className="workspace panel">
        <PanelHead title="최근 회사 비용" subtitle="이번 달 지출 내역입니다." action="비용 관리" onAction={() => onSection("expenses")} />
        {expenses.length ? <div className="compact-list">{expenses.slice(0, 5).map((expense) => <div key={expense.id} className="compact-row"><span className="category-dot" /><div><strong>{expense.description}</strong><small>{expense.category} · {expense.vendor || "거래처 미입력"}</small></div><b>{formatMoney(expense.amount)}</b></div>)}</div> : <Empty text="이번 달 등록된 비용이 없습니다." />}
      </section>
      <section className="workspace panel full-panel">
        <PanelHead title="계약 만료 알림" subtitle="60일 이내 계약 종료 예정 직원입니다." />
        {contracts.length ? <div className="compact-list">{contracts.map((contract) => { const employee = employees.find((item) => item.id === contract.employeeId); return <button key={contract.id} className="compact-row row-link" onClick={() => employee && onEmployee(employee)}><div className="avatar">{initials(employee?.name ?? "직원")}</div><div><strong>{employee?.name ?? "직원"}</strong><small>{contractLabel(contract.contractType)} · {formatDate(contract.endDate)} 종료</small></div><span>직원 보기 →</span></button>; })}</div> : <Empty text="곧 만료되는 근로계약이 없습니다." />}
      </section>
    </div>
  </>;
}

function EmployeeList({ employees, search, department, onSearch, onDepartment, onView, onEdit }: { employees: Employee[]; search: string; department: string; onSearch: (value: string) => void; onDepartment: (value: string) => void; onView: (employee: Employee) => void; onEdit: (employee: Employee) => void }) {
  return <section className="workspace">
    <div className="section-head"><div><h2>전체 직원</h2><p>직원을 선택하면 기본 정보와 계약·연차를 확인할 수 있습니다.</p></div><div className="filters"><input className="search-input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="이름·직책·이메일 검색" /><select value={department} onChange={(e) => onDepartment(e.target.value)}><option>전체 팀</option>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select></div></div>
    {employees.length ? <div className="table-wrap"><table className="data-table employee-table"><thead><tr><th>직원</th><th>부서·직책</th><th>입사 정보</th><th>연락처</th><th>상태</th><th /></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} onClick={() => onView(employee)}><td><div className="person"><span className="avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><small>{employee.email || "이메일 미등록"}</small></div></div></td><td><strong>{employee.department}</strong><small>{employee.position}</small></td><td><strong>{formatDate(employee.joinDate)}</strong><small>{tenure(employee.joinDate)}</small></td><td><strong>{employee.phone || "미등록"}</strong><small>{employee.emergencyContact ? `비상 ${employee.emergencyContact}` : "비상 연락처 미등록"}</small></td><td><span className={`status-badge ${employee.employmentStatus}`}>{employeeStatusLabel(employee.employmentStatus)}</span></td><td><button className="text-button" onClick={(event) => { event.stopPropagation(); onEdit(employee); }}>수정</button></td></tr>)}</tbody></table></div> : <Empty text="조건에 맞는 직원이 없습니다." />}
  </section>;
}

function EmployeeDetail({ employee, tab, contracts, entries, year, onTab, onYear, onEdit, onContract, onLeave, onDeleteEmployee, onDeleteContract, onDeleteEntry }: { employee: Employee; tab: EmployeeTab; contracts: Contract[]; entries: LeaveEntry[]; year: number; onTab: (tab: EmployeeTab) => void; onYear: (year: number) => void; onEdit: () => void; onContract: (contract?: Contract) => void; onLeave: () => void; onDeleteEmployee: () => void; onDeleteContract: (id: number) => void; onDeleteEntry: (id: number) => void }) {
  const accrued = calcAccrued(employee.joinDate, employee.annualAllowance, new Date());
  const used = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return <section className="workspace employee-detail">
    <div className="profile-head"><div className="avatar profile-avatar">{initials(employee.name)}</div><div><div className="profile-title"><h2>{employee.name}</h2><span className={`status-badge ${employee.employmentStatus}`}>{employeeStatusLabel(employee.employmentStatus)}</span></div><p>{employee.department} · {employee.position}</p></div><button className="secondary-button compact" onClick={onEdit}>기본 정보 수정</button></div>
    <div className="profile-tabs">{(["info", "contract", "leave"] as EmployeeTab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => onTab(item)}>{{ info: "기본 정보", contract: "근로계약", leave: "연차 사용" }[item]}</button>)}</div>
    {tab === "info" && <div className="detail-body"><DetailGroup title="인사 정보" action={<button className="text-button" onClick={onEdit}>변경</button>}><InfoRow label="조직 · 직책" value={`${employee.department} · ${employee.position}`} /><InfoRow label="입사 정보" value={`${formatDate(employee.joinDate)} · ${tenure(employee.joinDate)}`} /><InfoRow label="재직 상태" value={employeeStatusLabel(employee.employmentStatus)} /></DetailGroup><DetailGroup title="기본 정보" action={<button className="text-button" onClick={onEdit}>변경</button>}><InfoRow label="이메일" value={employee.email || "미등록"} /><InfoRow label="휴대전화" value={employee.phone || "미등록"} /><InfoRow label="생년월일" value={formatDate(employee.birthDate)} /><InfoRow label="주소" value={employee.address || "미등록"} /><InfoRow label="비상 연락처" value={employee.emergencyContact || "미등록"} /></DetailGroup>{employee.memo && <DetailGroup title="인사 메모"><InfoRow label="메모" value={employee.memo} /></DetailGroup>}<div className="detail-danger"><button className="text-button danger" onClick={onDeleteEmployee}>직원 정보 삭제</button></div></div>}
    {tab === "contract" && <div className="detail-body"><div className="detail-toolbar"><div><h3>근로계약 정보</h3><p>계약 조건 변경 시 기존 계약은 남기고 새 계약을 추가할 수 있습니다.</p></div><button className="primary-button compact" onClick={() => onContract()}>+ 계약 등록</button></div>{contracts.length ? <div className="contract-grid">{contracts.map((contract) => <article key={contract.id} className="contract-card"><div className="contract-card-head"><div><span className={`status-badge ${contract.status === "active" ? "active" : "retired"}`}>{contract.status === "active" ? "계약 중" : contract.status === "draft" ? "작성 중" : "종료"}</span><h3>{contractLabel(contract.contractType)}</h3></div><button className="text-button" onClick={() => onContract(contract)}>수정</button></div><dl><div><dt>계약 기간</dt><dd>{formatDate(contract.startDate)} – {contract.endDate ? formatDate(contract.endDate) : "기간 없음"}</dd></div><div><dt>월 급여</dt><dd>{formatMoney(contract.monthlySalary)}</dd></div><div><dt>근로 조건</dt><dd>주 {contract.weeklyHours}시간 · {contract.workStartTime}–{contract.workEndTime}</dd></div><div><dt>수습 종료</dt><dd>{formatDate(contract.probationEndDate)}</dd></div></dl>{contract.memo && <p>{contract.memo}</p>}<button className="text-button danger contract-delete" onClick={() => onDeleteContract(contract.id)}>계약 삭제</button></article>)}</div> : <Empty text="등록된 근로계약이 없습니다." />}</div>}
    {tab === "leave" && <div className="detail-body"><div className="detail-toolbar"><div><h3>{year}년 연차 현황</h3><p>발생 {accrued}일 · 사용 {used}일 · 잔여 {accrued - used}일</p></div><div className="toolbar-actions"><select value={year} onChange={(e) => onYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((item) => <option key={item}>{item}</option>)}</select><button className="primary-button compact" onClick={onLeave}>+ 연차 등록</button></div></div><div className="leave-summary"><Stat label="발생 연차" value={`${accrued}일`} note="입사일 기준 자동 계산" /><Stat label="사용 연차" value={`${used}일`} note="연차와 반차 합계" /><Stat label="잔여 연차" value={`${accrued - used}일`} note="현재 등록 내역 기준" tone="cream" /></div>{entries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>사용일</th><th>유형</th><th>차감</th><th>메모</th><th /></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.leaveDate)}</td><td>{leaveLabel(entry.leaveType)}</td><td>{entry.amount}일</td><td>{entry.note || "-"}</td><td><button className="text-button danger" onClick={() => onDeleteEntry(entry.id)}>삭제</button></td></tr>)}</tbody></table></div> : <Empty text="선택한 연도의 연차 사용 내역이 없습니다." />}</div>}
  </section>;
}

function LeaveManagement({ rows, entries, year, onYear, onLeave, onEmployee, onDelete }: { rows: Array<{ employee: Employee; accrued: number; used: number; remaining: number; entries: LeaveEntry[] }>; entries: LeaveEntry[]; year: number; onYear: (year: number) => void; onLeave: (employeeId?: number) => void; onEmployee: (employee: Employee) => void; onDelete: (id: number) => void }) {
  const [view, setView] = useState<"balance" | "history">("balance");
  return <section className="workspace"><div className="section-head"><div><h2>{year}년 연차 대장</h2><p>연도별 연차 발생과 사용 내역을 관리합니다.</p></div><div className="filters"><div className="segment"><button className={view === "balance" ? "active" : ""} onClick={() => setView("balance")}>직원별 현황</button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>사용 내역</button></div><select value={year} onChange={(e) => onYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((item) => <option key={item}>{item}년</option>)}</select></div></div>{view === "balance" ? <div className="table-wrap"><table className="data-table leave-table"><thead><tr><th>직원</th><th>발생</th><th>사용</th><th>잔여</th><th>최근 사용</th><th /></tr></thead><tbody>{rows.map(({ employee, accrued, used, remaining, entries: employeeEntries }) => <tr key={employee.id}><td><button className="person person-link" onClick={() => onEmployee(employee)}><span className="avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><small>{employee.department} · {employee.position}</small></div></button></td><td>{accrued}일</td><td>{used}일</td><td><span className={`remaining ${remaining < 3 ? "low" : ""}`}>{remaining}일</span></td><td>{employeeEntries[0] ? `${formatDate(employeeEntries[0].leaveDate)} · ${leaveLabel(employeeEntries[0].leaveType)}` : "사용 내역 없음"}</td><td><button className="secondary-button compact" onClick={() => onLeave(employee.id)}>등록</button></td></tr>)}</tbody></table></div> : entries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>사용일</th><th>직원</th><th>유형</th><th>차감</th><th>메모</th><th /></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.leaveDate)}</td><td><strong>{entry.employeeName}</strong></td><td>{leaveLabel(entry.leaveType)}</td><td>{entry.amount}일</td><td>{entry.note || "-"}</td><td><button className="text-button danger" onClick={() => onDelete(entry.id)}>삭제</button></td></tr>)}</tbody></table></div> : <Empty text="선택한 연도의 연차 사용 내역이 없습니다." />}</section>;
}

function ExpenseManagement({ expenses, month, monthlyTotal, annualTotal, onMonth, onEdit, onDelete }: { expenses: Expense[]; month: string; monthlyTotal: number; annualTotal: number; onMonth: (month: string) => void; onEdit: (expense: Expense) => void; onDelete: (id: number) => void }) {
  const categoryTotals = EXPENSE_CATEGORIES.map((category) => ({ category, total: expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  const scheduled = expenses.filter((expense) => expense.paymentStatus === "scheduled").reduce((sum, expense) => sum + expense.amount, 0);
  return <><div className="stat-grid expenses-stats"><Stat label="이번 달 비용" value={formatMoney(monthlyTotal)} note={`${expenses.length}건 등록`} tone="red" /><Stat label="결제 예정" value={formatMoney(scheduled)} note="아직 결제되지 않은 비용" /><Stat label="올해 누적 비용" value={formatMoney(annualTotal)} note="현재 연도 전체 합계" /><Stat label="가장 큰 지출 항목" value={categoryTotals[0]?.category ?? "-"} note={categoryTotals[0] ? formatMoney(categoryTotals[0].total) : "등록된 비용 없음"} tone="cream" /></div><section className="workspace"><div className="section-head"><div><h2>비용 내역</h2><p>거래일 기준으로 회사 지출을 관리합니다.</p></div><div className="filters"><input type="month" value={month} onChange={(e) => onMonth(e.target.value)} /></div></div>{expenses.length ? <div className="table-wrap"><table className="data-table expense-table"><thead><tr><th>사용일</th><th>분류</th><th>사용 내역</th><th>거래처</th><th>결제수단</th><th>상태</th><th>금액</th><th /></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td>{formatDate(expense.expenseDate, false)}</td><td><span className="category-badge">{expense.category}</span></td><td><strong>{expense.description}</strong><small>{expense.memo || "메모 없음"}</small></td><td>{expense.vendor || "-"}</td><td>{expense.paymentMethod}</td><td><span className={`status-badge ${expense.paymentStatus === "paid" ? "active" : "leave"}`}>{expense.paymentStatus === "paid" ? "결제 완료" : "결제 예정"}</span></td><td className="money-cell">{formatMoney(expense.amount)}</td><td><div className="row-actions"><button className="text-button" onClick={() => onEdit(expense)}>수정</button><button className="text-button danger" onClick={() => onDelete(expense.id)}>삭제</button></div></td></tr>)}</tbody></table></div> : <Empty text="선택한 달에 등록된 회사 비용이 없습니다." />}</section></>;
}

function Stat({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "red" | "cream" }) { return <article className={`stat-card ${tone}`}><span className="stat-label">{label}</span><strong>{value}</strong><p>{note}</p></article>; }
function PanelHead({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button className="text-button" onClick={onAction}>{action} →</button>}</div>; }
function Empty({ text }: { text: string }) { return <div className="empty-state"><span>＋</span><p>{text}</p></div>; }
function DetailGroup({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="detail-group"><div className="detail-group-head"><h3>{title}</h3>{action}</div>{children}</section>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="info-row"><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Modal({ title, description, onClose, wide = false, children }: { title: string; description: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button onClick={onClose} aria-label="닫기">×</button></div>{children}</section></div>; }
function ModalActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>취소</button><button className="primary-button" disabled={saving}>{saving ? "저장 중..." : label}</button></div>; }
