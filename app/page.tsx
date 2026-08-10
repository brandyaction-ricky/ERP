"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CardManagement,
  CardUsage,
  CardUsageManagement,
  CompanyCard,
} from "./components/financial-management";

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
  costType: "fixed" | "variable";
  category: string;
  description: string;
  vendor: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: "paid" | "scheduled";
  isRecurring: boolean;
  recurringActive: boolean;
  recurringDay: number | null;
  recurringParentId: number | null;
  recurringMonth: string | null;
  sourceCardUsageId: number | null;
  memo: string;
  createdAt: string;
};

type Revenue = {
  id: number;
  revenueDate: string;
  category: string;
  description: string;
  client: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: "received" | "expected";
  memo: string;
  createdAt: string;
};

type HRSetting = {
  id: number;
  kind: "department" | "position";
  value: string;
  sortOrder: number;
  createdAt: string;
};

type ERPData = { employees: Employee[]; entries: LeaveEntry[]; contracts: Contract[]; expenses: Expense[]; revenues: Revenue[]; cards: CompanyCard[]; cardUsages: CardUsage[]; hrSettings: HRSetting[]; schemaReady?: boolean };
type Section = "dashboard" | "employees" | "leave" | "expenses" | "cards" | "evidence";
type EmployeeTab = "info" | "contract" | "leave";

const EMPTY_DATA: ERPData = { employees: [], entries: [], contracts: [], expenses: [], revenues: [], cards: [], cardUsages: [], hrSettings: [], schemaReady: true };
const DEPARTMENTS = ["콘텐츠팀", "마케팅팀", "디자인팀", "개발팀", "경영지원"];
const POSITIONS = ["대표", "팀장", "매니저", "사원"];
const EXPENSE_CATEGORIES: Record<Expense["costType"], string[]> = {
  fixed: ["인건비", "임대료·관리비", "보험료", "소프트웨어·구독료", "통신비", "세금·공과금", "기타 고정비"],
  variable: ["광고비", "카드값", "외주비", "복리후생비", "출장·교통비", "소모품비", "수수료", "기타 변동비"],
};
const REVENUE_CATEGORIES = ["서비스 매출", "교육 매출", "컨설팅 매출", "콘텐츠 매출", "기타 매출"];

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

function nextBusinessDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1); while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function groupLeaveEntries(entries: LeaveEntry[]) {
  type Group = LeaveEntry & { ids: number[]; startDate: string; endDate: string };
  const groups: Group[] = [];
  const sorted = [...entries].sort((a, b) => a.leaveDate.localeCompare(b.leaveDate) || a.id - b.id);

  for (const entry of sorted) {
    const previous = groups.at(-1);
    const canJoin = entry.leaveType === "full"
      && previous?.leaveType === "full"
      && previous.employeeId === entry.employeeId
      && previous.note === entry.note
      && previous.createdAt === entry.createdAt
      && nextBusinessDate(previous.endDate) === entry.leaveDate;
    if (canJoin && previous) {
      previous.ids.push(entry.id);
      previous.endDate = entry.leaveDate;
      previous.amount += Number(entry.amount);
    } else {
      groups.push({ ...entry, amount: Number(entry.amount), ids: [entry.id], startDate: entry.leaveDate, endDate: entry.leaveDate });
    }
  }
  return groups.sort((a, b) => b.endDate.localeCompare(a.endDate) || b.id - a.id);
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
    costType: expense?.costType ?? ("fixed" as Expense["costType"]),
    category: expense?.category ?? EXPENSE_CATEGORIES.fixed[0],
    description: expense?.description ?? "",
    vendor: expense?.vendor ?? "",
    amount: expense ? String(expense.amount) : "",
    paymentMethod: expense?.paymentMethod ?? "법인카드",
    paymentStatus: expense?.paymentStatus ?? ("paid" as Expense["paymentStatus"]),
    repeatMonthly: expense?.isRecurring ?? false,
    recurringDay: String(expense?.recurringDay ?? Number((expense?.expenseDate ?? localIsoDate()).slice(8, 10))),
    memo: expense?.memo ?? "",
  };
}

function revenueDraft(revenue?: Revenue) {
  return {
    id: revenue?.id,
    revenueDate: revenue?.revenueDate ?? localIsoDate(),
    category: revenue?.category ?? REVENUE_CATEGORIES[0],
    description: revenue?.description ?? "",
    client: revenue?.client ?? "",
    amount: revenue ? String(revenue.amount) : "",
    paymentMethod: revenue?.paymentMethod ?? "계좌이체",
    paymentStatus: revenue?.paymentStatus ?? ("received" as Revenue["paymentStatus"]),
    memo: revenue?.memo ?? "",
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
  const [revenueModal, setRevenueModal] = useState(false);
  const [hrSettingsModal, setHRSettingsModal] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(employeeDraft());
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", leaveStartDate: today, leaveEndDate: today, leaveType: "full" as LeaveEntry["leaveType"], note: "" });
  const [contractForm, setContractForm] = useState(contractDraft(0));
  const [expenseForm, setExpenseForm] = useState(expenseDraft());
  const [revenueForm, setRevenueForm] = useState(revenueDraft());

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
  const departmentOptions = useMemo(() => Array.from(new Set([
    ...data.hrSettings.filter((setting) => setting.kind === "department").sort((a, b) => a.sortOrder - b.sortOrder).map((setting) => setting.value),
    ...data.employees.map((employee) => employee.department),
    ...DEPARTMENTS,
  ].filter(Boolean))), [data.hrSettings, data.employees]);
  const positionOptions = useMemo(() => Array.from(new Set([
    ...data.hrSettings.filter((setting) => setting.kind === "position").sort((a, b) => a.sortOrder - b.sortOrder).map((setting) => setting.value),
    ...data.employees.map((employee) => employee.position),
    ...POSITIONS,
  ].filter(Boolean))), [data.hrSettings, data.employees]);
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
  const monthRevenues = useMemo(() => data.revenues.filter((revenue) => revenue.revenueDate.startsWith(expenseMonth)), [data.revenues, expenseMonth]);
  const monthlyExpenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyRevenueTotal = monthRevenues.reduce((sum, revenue) => sum + revenue.amount, 0);
  const monthlyFixedTotal = monthExpenses.filter((expense) => expense.costType === "fixed").reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyVariableTotal = monthlyExpenseTotal - monthlyFixedTotal;
  const annualExpenseTotal = data.expenses.filter((expense) => expense.expenseDate.startsWith(String(currentYear))).reduce((sum, expense) => sum + expense.amount, 0);
  const upcomingLeaves = data.entries.filter((entry) => entry.leaveDate >= today).slice(0, 5);
  const pendingEvidenceCount = data.cardUsages.filter((usage) => usage.evidenceStatus !== "confirmed").length;

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

  async function remove(kind: "employee" | "entry" | "contract" | "expense" | "revenue" | "card" | "cardUsage" | "hrSetting", id: number) {
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

  async function removeLeaveGroup(ids: number[]) {
    if (!window.confirm(ids.length > 1 ? `이 기간의 연차 ${ids.length}일을 모두 삭제할까요?` : "선택한 연차 기록을 삭제할까요?")) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/ledger?kind=entries&ids=${ids.join(",")}`, { method: "DELETE" });
      const result = (await response.json()) as ERPData & { error?: string };
      if (!response.ok) throw new Error(result.error || "삭제하지 못했습니다.");
      setData(result);
      setToast("연차 사용 내역이 삭제되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openEmployee(employee?: Employee) {
    const draft = employeeDraft(employee);
    if (!employee) {
      draft.department = departmentOptions[0] ?? "";
      draft.position = positionOptions[0] ?? "";
    }
    setEmployeeForm(draft);
    setEmployeeModal(true);
  }

  async function addHRSetting(kind: HRSetting["kind"], value: string) {
    const saved = await save({ action: "hrSetting", kind, value });
    if (saved) setToast(`${kind === "department" ? "부서" : "직책"}가 추가되었습니다.`);
    return saved;
  }

  function openLeave(employeeId?: number) {
    setLeaveForm({ employeeId: String(employeeId ?? activeEmployees[0]?.id ?? ""), leaveStartDate: today, leaveEndDate: today, leaveType: "full", note: "" });
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

  function openRevenue(revenue?: Revenue) {
    setRevenueForm(revenueDraft(revenue));
    setRevenueModal(true);
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
      setToast("연차 사용 기간이 등록되었습니다.");
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
      setToast(expenseForm.id ? "비용 내역이 수정되었습니다." : "비용이 등록되었습니다.");
    }
  }

  async function submitRevenue(event: FormEvent) {
    event.preventDefault();
    if (await save({ action: "revenue", ...revenueForm }, revenueForm.id ? "PATCH" : "POST")) {
      setRevenueModal(false);
      setExpenseMonth(revenueForm.revenueDate.slice(0, 7));
      setToast(revenueForm.id ? "매출 내역이 수정되었습니다." : "매출이 등록되었습니다.");
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  const sectionCopy = {
    dashboard: ["브랜디액션 운영 현황", "브랜디액션의 인사·연차·매출·비용·법인카드 현황을 한 화면에서 확인합니다."],
    employees: ["직원 관리", "기본 정보부터 근로계약까지 직원별로 관리합니다."],
    leave: ["연차 관리", "직원별 발생·사용·잔여 연차를 확인합니다."],
    expenses: ["비용 관리", "매출과 비용을 월별로 입력하고 손익을 확인합니다."],
    cards: ["카드 관리", "법인카드 정보와 한도·담당자를 관리합니다."],
    evidence: ["카드 사용·증빙", "카드 사용 내역과 증빙 제출 상태를 관리합니다."],
  }[section];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setSection("dashboard"); setSelectedEmployeeId(null); }}>
          <img src="/brandyaction-logo.png" alt="Brandy Action" />
        </button>
        <nav className="desktop-nav" aria-label="관리 메뉴">
          {(["dashboard", "employees", "leave", "expenses", "cards", "evidence"] as Section[]).map((item) => (
            <button key={item} className={section === item ? "active" : ""} onClick={() => { setSection(item); if (item !== "employees") setSelectedEmployeeId(null); }}>
              {{ dashboard: "대시보드", employees: "직원 관리", leave: "연차 관리", expenses: "비용 관리", cards: "카드 관리", evidence: "카드 사용·증빙" }[item]}
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
            <p className="eyebrow">{section === "dashboard" && !selectedEmployee ? "BRANDYACTION ERP" : "INTERNAL MANAGEMENT"}</p>
            <h1>{selectedEmployee ? selectedEmployee.name : sectionCopy[0]}</h1>
            <p className="intro-copy">{selectedEmployee ? `${selectedEmployee.department} · ${selectedEmployee.position} · ${tenure(selectedEmployee.joinDate)}` : sectionCopy[1]}</p>
          </div>
          <div className="intro-actions">
            {selectedEmployee && <button className="secondary-button" onClick={() => setSelectedEmployeeId(null)}>← 직원 목록</button>}
            {section === "employees" && <><button className="secondary-button" onClick={() => setHRSettingsModal(true)}>부서·직책 설정</button><button className="primary-button" onClick={() => openEmployee()}>+ 직원 등록</button></>}
            {section === "leave" && <button className="primary-button" onClick={() => openLeave()}>+ 연차 등록</button>}
            {section === "expenses" && <><button className="secondary-button" onClick={() => openRevenue()}>+ 매출 등록</button><button className="primary-button" onClick={() => openExpense()}>+ 비용 등록</button></>}
          </div>
        </section>

        {error && <div className="error-banner"><span>!</span><p>{error}</p><button onClick={() => setError("")}>닫기</button></div>}
        {data.schemaReady === false && <div className="error-banner"><span>!</span><p>ERP 운영 데이터베이스 업데이트가 아직 적용되지 않았습니다. 기존 연차 정보는 정상적으로 조회할 수 있습니다.</p></div>}

        {loading ? <div className="workspace loading-block">ERP 데이터를 불러오고 있습니다.</div> : (
          <>
            {section === "dashboard" && (
              <Dashboard
                activeCount={activeEmployees.length}
                upcomingCount={upcomingLeaves.length}
                monthlyExpense={monthlyExpenseTotal}
                monthlyRevenue={monthlyRevenueTotal}
                monthlyFixed={monthlyFixedTotal}
                monthlyVariable={monthlyVariableTotal}
                pendingEvidenceCount={pendingEvidenceCount}
                upcomingLeaves={upcomingLeaves}
                expenses={monthExpenses}
                cardUsages={data.cardUsages}
                onSection={setSection}
              />
            )}

            {section === "employees" && !selectedEmployee && (
              <EmployeeList
                employees={employeeRows}
                search={search}
                department={department}
                departments={departmentOptions}
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
              <LeaveManagement rows={leaveRows} entries={yearEntries} year={selectedYear} onYear={setSelectedYear} onLeave={openLeave} onEmployee={viewEmployee} onDelete={removeLeaveGroup} />
            )}

            {section === "expenses" && (
              <ExpenseManagement expenses={monthExpenses} allExpenses={data.expenses} revenues={monthRevenues} allRevenues={data.revenues} recurringExpenses={data.expenses.filter((expense) => expense.isRecurring && expense.recurringActive)} month={expenseMonth} monthlyTotal={monthlyExpenseTotal} monthlyRevenueTotal={monthlyRevenueTotal} annualTotal={annualExpenseTotal} onMonth={setExpenseMonth} onEdit={openExpense} onDelete={(id) => remove("expense", id)} onEditRevenue={openRevenue} onDeleteRevenue={(id) => remove("revenue", id)} />
            )}

            {section === "cards" && (
              <CardManagement cards={data.cards} employees={data.employees} saving={saving} onSave={save} onDelete={(id) => remove("card", id)} />
            )}

            {section === "evidence" && (
              <CardUsageManagement usages={data.cardUsages} cards={data.cards} employees={data.employees} saving={saving} onSave={save} onDelete={(id) => remove("cardUsage", id)} />
            )}
          </>
        )}
      </main>

      <footer><span>BRANDYACTION ERP</span><p>직원 정보와 회사 자산은 승인된 관리자만 열람할 수 있습니다.</p></footer>

      {employeeModal && (
        <Modal title={employeeForm.id ? "직원 정보 수정" : "새 직원 등록"} description="운영에 필요한 기본 인사 정보를 입력합니다." onClose={() => setEmployeeModal(false)}>
          <form className="modal-form" onSubmit={submitEmployee}>
            <div className="form-grid two"><Field label="이름 *"><input required value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></Field><Field label="재직 상태"><select value={employeeForm.employmentStatus} onChange={(e) => setEmployeeForm({ ...employeeForm, employmentStatus: e.target.value as Employee["employmentStatus"] })}><option value="active">재직</option><option value="leave">휴직</option><option value="retired">퇴사</option></select></Field></div>
            <div className="form-grid two"><Field label="부서 *"><select value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}>{departmentOptions.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="직책·직급 *"><select required value={employeeForm.position} onChange={(e) => setEmployeeForm({ ...employeeForm, position: e.target.value })}>{positionOptions.map((item) => <option key={item}>{item}</option>)}</select></Field></div>
            <div className="form-grid two"><Field label="입사일 *"><input required type="date" value={employeeForm.joinDate} onChange={(e) => setEmployeeForm({ ...employeeForm, joinDate: e.target.value })} /></Field><Field label="생년월일"><input type="date" value={employeeForm.birthDate} onChange={(e) => setEmployeeForm({ ...employeeForm, birthDate: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="회사 이메일"><input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} /></Field><Field label="휴대전화"><input value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} /></Field></div>
            <Field label="주소"><input value={employeeForm.address} onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })} /></Field>
            <div className="form-grid two"><Field label="비상 연락처"><input value={employeeForm.emergencyContact} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContact: e.target.value })} /></Field><Field label="직접 부여 연차"><input type="number" min="0" step="0.5" value={employeeForm.annualAllowance} onChange={(e) => setEmployeeForm({ ...employeeForm, annualAllowance: e.target.value })} placeholder="자동 계산" /></Field></div>
            <Field label="인사 메모"><textarea value={employeeForm.memo} onChange={(e) => setEmployeeForm({ ...employeeForm, memo: e.target.value })} /></Field>
            <ModalActions saving={saving} onCancel={() => setEmployeeModal(false)} label="직원 정보 저장" />
          </form>
        </Modal>
      )}

      {hrSettingsModal && (
        <Modal title="부서·직책 설정" description="직원 등록과 검색에 사용할 부서와 직책·직급을 관리합니다." onClose={() => setHRSettingsModal(false)}>
          <HRSettingsManager settings={data.hrSettings} employees={data.employees} saving={saving} onAdd={addHRSetting} onDelete={(id) => remove("hrSetting", id)} />
        </Modal>
      )}

      {leaveModal && (
        <Modal title="연차 사용 등록" description="기간 연차는 토·일요일을 제외하고 자동 등록됩니다." onClose={() => setLeaveModal(false)}>
          <form className="modal-form" onSubmit={submitLeave}>
            <Field label="직원 *"><select required value={leaveForm.employeeId} onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}><option value="">직원을 선택하세요</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></Field>
            <div className="form-grid two"><Field label="시작일 *"><input required type="date" value={leaveForm.leaveStartDate} onChange={(e) => { const leaveStartDate = e.target.value; setLeaveForm({ ...leaveForm, leaveStartDate, leaveEndDate: leaveForm.leaveType === "full" && leaveForm.leaveEndDate >= leaveStartDate ? leaveForm.leaveEndDate : leaveStartDate }); }} /></Field><Field label="종료일 *"><input required type="date" min={leaveForm.leaveStartDate} disabled={leaveForm.leaveType !== "full"} value={leaveForm.leaveEndDate} onChange={(e) => setLeaveForm({ ...leaveForm, leaveEndDate: e.target.value })} /></Field></div>
            <Field label="사용 유형"><select value={leaveForm.leaveType} onChange={(e) => { const leaveType = e.target.value as LeaveEntry["leaveType"]; setLeaveForm({ ...leaveForm, leaveType, leaveEndDate: leaveType === "full" ? leaveForm.leaveEndDate : leaveForm.leaveStartDate }); }}><option value="full">연차 1일 이상</option><option value="half-am">오전 반차 0.5일</option><option value="half-pm">오후 반차 0.5일</option></select></Field>
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
        <Modal title={expenseForm.id ? "비용 내역 수정" : "비용 등록"} description="고정비와 변동비를 구분해 회사 지출을 기록합니다." onClose={() => setExpenseModal(false)}>
          <form className="modal-form" onSubmit={submitExpense}>
            <div className="form-grid two">
              <Field label="비용 구분 *"><select value={expenseForm.costType} onChange={(e) => { const costType = e.target.value as Expense["costType"]; setExpenseForm({ ...expenseForm, costType, category: EXPENSE_CATEGORIES[costType][0], repeatMonthly: costType === "fixed" ? expenseForm.repeatMonthly : false }); }}><option value="fixed">고정비</option><option value="variable">변동비</option></select></Field>
              <Field label="세부 항목 *"><select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>{EXPENSE_CATEGORIES[expenseForm.costType].map((item) => <option key={item}>{item}</option>)}</select></Field>
            </div>
            {expenseForm.costType === "fixed" && <div className="form-grid two"><Field label="반복 설정"><select value={expenseForm.repeatMonthly ? "monthly" : "none"} onChange={(e) => setExpenseForm({ ...expenseForm, repeatMonthly: e.target.value === "monthly" })}><option value="none">이번 달만 등록</option><option value="monthly">매월 자동 등록</option></select></Field>{expenseForm.repeatMonthly && <Field label="매월 등록일"><input required type="number" min="1" max="31" value={expenseForm.recurringDay} onChange={(e) => setExpenseForm({ ...expenseForm, recurringDay: e.target.value })} /></Field>}</div>}
            <Field label="사용일 *"><input required type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /></Field>
            <Field label="사용 내역 *"><input required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="예: 메타 광고비 8월 1주차" /></Field>
            <div className="form-grid two"><Field label="거래처"><input value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} /></Field><Field label="금액 *"><input required type="number" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="결제수단"><select value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}><option>법인카드</option><option>계좌이체</option><option>자동이체</option><option>개인카드</option><option>현금</option></select></Field><Field label="결제 상태"><select value={expenseForm.paymentStatus} onChange={(e) => setExpenseForm({ ...expenseForm, paymentStatus: e.target.value as Expense["paymentStatus"] })}><option value="paid">결제 완료</option><option value="scheduled">결제 예정</option></select></Field></div>
            <Field label="메모"><textarea value={expenseForm.memo} onChange={(e) => setExpenseForm({ ...expenseForm, memo: e.target.value })} /></Field>
            <ModalActions saving={saving} onCancel={() => setExpenseModal(false)} label="비용 저장" />
          </form>
        </Modal>
      )}

      {revenueModal && (
        <Modal title={revenueForm.id ? "매출 내역 수정" : "매출 등록"} description="입금 예정과 완료 상태를 구분해 월별 매출을 기록합니다." onClose={() => setRevenueModal(false)}>
          <form className="modal-form" onSubmit={submitRevenue}>
            <div className="form-grid two"><Field label="매출일 *"><input required type="date" value={revenueForm.revenueDate} onChange={(e) => setRevenueForm({ ...revenueForm, revenueDate: e.target.value })} /></Field><Field label="매출 구분 *"><select value={revenueForm.category} onChange={(e) => setRevenueForm({ ...revenueForm, category: e.target.value })}>{REVENUE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field></div>
            <Field label="매출 내역 *"><input required value={revenueForm.description} onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })} placeholder="예: 브랜딩 컨설팅 1차 계약금" /></Field>
            <div className="form-grid two"><Field label="고객·거래처"><input value={revenueForm.client} onChange={(e) => setRevenueForm({ ...revenueForm, client: e.target.value })} /></Field><Field label="매출 금액 *"><input required type="number" min="0" value={revenueForm.amount} onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })} /></Field></div>
            <div className="form-grid two"><Field label="결제수단"><select value={revenueForm.paymentMethod} onChange={(e) => setRevenueForm({ ...revenueForm, paymentMethod: e.target.value })}><option>계좌이체</option><option>카드결제</option><option>현금</option><option>기타</option></select></Field><Field label="입금 상태"><select value={revenueForm.paymentStatus} onChange={(e) => setRevenueForm({ ...revenueForm, paymentStatus: e.target.value as Revenue["paymentStatus"] })}><option value="received">입금 완료</option><option value="expected">입금 예정</option></select></Field></div>
            <Field label="메모"><textarea value={revenueForm.memo} onChange={(e) => setRevenueForm({ ...revenueForm, memo: e.target.value })} /></Field>
            <ModalActions saving={saving} onCancel={() => setRevenueModal(false)} label="매출 저장" />
          </form>
        </Modal>
      )}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Dashboard({ activeCount, upcomingCount, monthlyExpense, monthlyRevenue, monthlyFixed, monthlyVariable, pendingEvidenceCount, upcomingLeaves, expenses, cardUsages, onSection }: {
  activeCount: number; upcomingCount: number; monthlyExpense: number; monthlyRevenue: number; monthlyFixed: number; monthlyVariable: number; pendingEvidenceCount: number; upcomingLeaves: LeaveEntry[]; expenses: Expense[]; cardUsages: CardUsage[]; onSection: (section: Section) => void;
}) {
  const profit = monthlyRevenue - monthlyExpense;
  return <>
    <div className="stat-grid dashboard-stats">
      <Stat label="재직 직원" value={`${activeCount}명`} note="현재 재직 상태 기준" tone="red" />
      <Stat label="예정 연차" value={`${upcomingCount}건`} note="오늘 이후 등록 내역" />
      <Stat label="이번 달 매출" value={formatMoney(monthlyRevenue)} note="입금 예정 포함 매출 합계" />
      <Stat label="이번 달 비용" value={formatMoney(monthlyExpense)} note={`고정 ${formatMoney(monthlyFixed)} · 변동 ${formatMoney(monthlyVariable)}`} />
      <Stat label="이번 달 손익" value={formatMoney(profit)} note="매출에서 비용을 차감한 금액" tone="cream" />
      <Stat label="증빙 확인 필요" value={`${pendingEvidenceCount}건`} note="미제출·제출 상태 카드 사용" />
    </div>
    <div className="dashboard-grid dashboard-overview-grid">
      <section className="workspace panel">
        <PanelHead title="다가오는 연차" subtitle="예정된 직원 일정을 확인합니다." action="전체 보기" onAction={() => onSection("leave")} />
        {upcomingLeaves.length ? <div className="compact-list">{upcomingLeaves.map((entry) => <div key={entry.id} className="compact-row"><div className="avatar">{initials(entry.employeeName)}</div><div><strong>{entry.employeeName}</strong><small>{formatDate(entry.leaveDate)} · {leaveLabel(entry.leaveType)}</small></div><span>{entry.amount}일</span></div>)}</div> : <Empty text="등록된 예정 연차가 없습니다." />}
      </section>
      <section className="workspace panel">
        <PanelHead title="최근 비용" subtitle="이번 달 지출 내역입니다." action="비용 관리" onAction={() => onSection("expenses")} />
        {expenses.length ? <div className="compact-list">{expenses.slice(0, 5).map((expense) => <div key={expense.id} className="compact-row"><span className="category-dot" /><div><strong>{expense.description}</strong><small>{expense.category} · {expense.vendor || "거래처 미입력"}</small></div><b>{formatMoney(expense.amount)}</b></div>)}</div> : <Empty text="이번 달 등록된 비용이 없습니다." />}
      </section>
      <section className="workspace panel">
        <PanelHead title="최근 카드 사용·증빙" subtitle="최근 결제와 증빙 상태를 확인합니다." action="증빙 관리" onAction={() => onSection("evidence")} />
        {cardUsages.length ? <div className="compact-list">{cardUsages.slice(0, 5).map((usage) => <div key={usage.id} className="compact-row"><span className={`dashboard-evidence-dot ${usage.evidenceStatus}`} /><div><strong>{usage.merchant}</strong><small>{formatDate(usage.transactionDate, false)} · {usage.purpose} · {usage.evidenceStatus === "confirmed" ? "확정" : usage.evidenceStatus === "submitted" ? "제출" : "미제출"}</small></div><b>{formatMoney(usage.amount)}</b></div>)}</div> : <Empty text="등록된 카드 사용 내역이 없습니다." />}
      </section>
    </div>
  </>;
}

function EmployeeList({ employees, search, department, departments, onSearch, onDepartment, onView, onEdit }: { employees: Employee[]; search: string; department: string; departments: string[]; onSearch: (value: string) => void; onDepartment: (value: string) => void; onView: (employee: Employee) => void; onEdit: (employee: Employee) => void }) {
  return <section className="workspace">
    <div className="section-head"><div><h2>전체 직원</h2><p>직원을 선택하면 기본 정보와 계약·연차를 확인할 수 있습니다.</p></div><div className="filters"><input className="search-input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="이름·직책·이메일 검색" /><select value={department} onChange={(e) => onDepartment(e.target.value)}><option>전체 팀</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></div></div>
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

function LeaveManagement({ rows, entries, year, onYear, onLeave, onEmployee, onDelete }: { rows: Array<{ employee: Employee; accrued: number; used: number; remaining: number; entries: LeaveEntry[] }>; entries: LeaveEntry[]; year: number; onYear: (year: number) => void; onLeave: (employeeId?: number) => void; onEmployee: (employee: Employee) => void; onDelete: (ids: number[]) => void }) {
  const [view, setView] = useState<"balance" | "history">("balance");
  const groupedEntries = useMemo(() => groupLeaveEntries(entries), [entries]);
  return <section className="workspace"><div className="section-head"><div><h2>{year}년 연차 대장</h2><p>연도별 연차 발생과 사용 내역을 관리합니다.</p></div><div className="filters"><div className="segment"><button className={view === "balance" ? "active" : ""} onClick={() => setView("balance")}>직원별 현황</button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>사용 내역</button></div><select value={year} onChange={(e) => onYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((item) => <option key={item}>{item}년</option>)}</select></div></div>{view === "balance" ? <div className="table-wrap"><table className="data-table leave-table"><thead><tr><th>직원</th><th>발생</th><th>사용</th><th>잔여</th><th>최근 사용</th><th /></tr></thead><tbody>{rows.map(({ employee, accrued, used, remaining, entries: employeeEntries }) => <tr key={employee.id}><td><button className="person person-link" onClick={() => onEmployee(employee)}><span className="avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><small>{employee.department} · {employee.position}</small></div></button></td><td>{accrued}일</td><td>{used}일</td><td><span className={`remaining ${remaining < 3 ? "low" : ""}`}>{remaining}일</span></td><td>{employeeEntries[0] ? `${formatDate(employeeEntries[0].leaveDate)} · ${leaveLabel(employeeEntries[0].leaveType)}` : "사용 내역 없음"}</td><td><button className="secondary-button compact" onClick={() => onLeave(employee.id)}>등록</button></td></tr>)}</tbody></table></div> : groupedEntries.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>사용 기간</th><th>직원</th><th>유형</th><th>차감</th><th>메모</th><th /></tr></thead><tbody>{groupedEntries.map((entry) => <tr key={entry.ids.join("-")}><td>{entry.startDate === entry.endDate ? formatDate(entry.startDate) : `${formatDate(entry.startDate)}~${formatDate(entry.endDate, false)}`}</td><td><strong>{entry.employeeName}</strong></td><td>{leaveLabel(entry.leaveType)}</td><td>{entry.amount}일</td><td>{entry.note || "-"}</td><td><button className="text-button danger" onClick={() => onDelete(entry.ids)}>삭제</button></td></tr>)}</tbody></table></div> : <Empty text="선택한 연도의 연차 사용 내역이 없습니다." />}</section>;
}

function HRSettingsManager({ settings, employees, saving, onAdd, onDelete }: { settings: HRSetting[]; employees: Employee[]; saving: boolean; onAdd: (kind: HRSetting["kind"], value: string) => Promise<boolean>; onDelete: (id: number) => void }) {
  const [kind, setKind] = useState<HRSetting["kind"]>("department");
  const [value, setValue] = useState("");
  const visible = settings.filter((setting) => setting.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd(kind, value.trim())) setValue("");
  }
  return <div className="settings-manager">
    <div className="segment settings-tabs"><button className={kind === "department" ? "active" : ""} onClick={() => setKind("department")}>부서</button><button className={kind === "position" ? "active" : ""} onClick={() => setKind("position")}>직책·직급</button></div>
    <form className="settings-add" onSubmit={submit}><input required maxLength={50} value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === "department" ? "새 부서명" : "새 직책·직급명"} /><button className="primary-button compact" disabled={saving}>추가</button></form>
    <div className="settings-list">{visible.length ? visible.map((setting) => { const usageCount = employees.filter((employee) => (kind === "department" ? employee.department : employee.position) === setting.value).length; return <div className="settings-row" key={setting.id}><div><strong>{setting.value}</strong><small>{usageCount ? `직원 ${usageCount}명 사용 중` : "사용 직원 없음"}</small></div><button className="text-button danger" disabled={saving || usageCount > 0} onClick={() => onDelete(setting.id)}>삭제</button></div>; }) : <div className="settings-empty">등록된 항목이 없습니다.</div>}</div>
    <p className="settings-note">직원이 사용 중인 항목은 다른 항목으로 변경한 뒤 삭제할 수 있습니다.</p>
  </div>;
}

function ExpenseManagement({ expenses, allExpenses, revenues, allRevenues, recurringExpenses, month, monthlyTotal, monthlyRevenueTotal, annualTotal, onMonth, onEdit, onDelete, onEditRevenue, onDeleteRevenue }: { expenses: Expense[]; allExpenses: Expense[]; revenues: Revenue[]; allRevenues: Revenue[]; recurringExpenses: Expense[]; month: string; monthlyTotal: number; monthlyRevenueTotal: number; annualTotal: number; onMonth: (month: string) => void; onEdit: (expense: Expense) => void; onDelete: (id: number) => void; onEditRevenue: (revenue: Revenue) => void; onDeleteRevenue: (id: number) => void }) {
  const [costFilter, setCostFilter] = useState<"all" | Expense["costType"]>("all");
  const visibleExpenses = costFilter === "all" ? expenses : expenses.filter((expense) => expense.costType === costFilter);
  const visibleTotal = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const summary = new Map<string, { month: string; revenue: number; cost: number; fixed: number; variable: number; count: number }>();
  allExpenses.forEach((expense) => {
    const expenseMonth = expense.expenseDate.slice(0, 7);
    const row = summary.get(expenseMonth) ?? { month: expenseMonth, revenue: 0, cost: 0, fixed: 0, variable: 0, count: 0 };
    row.cost += expense.amount;
    row[expense.costType] += expense.amount;
    row.count += 1;
    summary.set(expenseMonth, row);
  });
  allRevenues.forEach((revenue) => {
    const revenueMonth = revenue.revenueDate.slice(0, 7);
    const row = summary.get(revenueMonth) ?? { month: revenueMonth, revenue: 0, cost: 0, fixed: 0, variable: 0, count: 0 };
    row.revenue += revenue.amount;
    row.count += 1;
    summary.set(revenueMonth, row);
  });
  const monthlySummary = Array.from(summary.values()).sort((a, b) => b.month.localeCompare(a.month));

  return <>
    <div className="stat-grid expenses-stats">
      <Stat label="이번 달 매출" value={formatMoney(monthlyRevenueTotal)} note={`${revenues.length}건 등록`} />
      <Stat label="이번 달 비용" value={formatMoney(monthlyTotal)} note={`${expenses.length}건 등록`} />
      <Stat label="이번 달 손익" value={formatMoney(monthlyRevenueTotal - monthlyTotal)} note="매출 − 비용" tone="red" />
      <Stat label="올해 누적 비용" value={formatMoney(annualTotal)} note="현재 연도 전체 합계" tone="cream" />
    </div>
    {recurringExpenses.length > 0 && <section className="workspace recurring-workspace">
      <div className="section-head"><div><h2>매월 자동 등록</h2><p>매월 지정일에 결제 예정 고정비로 자동 생성됩니다.</p></div></div>
      <div className="compact-list">{recurringExpenses.map((expense) => <div className="compact-row" key={expense.id}><span className="recurring-mark">↻</span><div><strong>{expense.description}</strong><small>{expense.category} · 매월 {expense.recurringDay}일 · {expense.vendor || "거래처 미입력"}</small></div><b>{formatMoney(expense.amount)}</b><button className="text-button" onClick={() => onEdit(expense)}>설정 수정</button></div>)}</div>
    </section>}
    <section className="workspace monthly-expense-workspace">
      <div className="section-head"><div><h2>월별 매출·비용 합계</h2><p>월을 선택하면 아래에서 매출과 비용 상세 내역을 확인할 수 있습니다.</p></div></div>
      {monthlySummary.length ? <div className="table-wrap"><table className="data-table monthly-summary-table"><thead><tr><th>월</th><th>매출</th><th>비용</th><th>손익</th><th>고정비</th><th>변동비</th><th>건수</th></tr></thead><tbody>{monthlySummary.map((row) => <tr key={row.month} className={row.month === month ? "selected-row" : ""} onClick={() => onMonth(row.month)}><td><strong>{row.month.replace("-", "년 ")}월</strong></td><td>{formatMoney(row.revenue)}</td><td>{formatMoney(row.cost)}</td><td className="money-cell">{formatMoney(row.revenue - row.cost)}</td><td>{formatMoney(row.fixed)}</td><td>{formatMoney(row.variable)}</td><td>{row.count}건</td></tr>)}</tbody></table></div> : <Empty text="등록된 월별 매출·비용이 없습니다." />}
    </section>
    <section className="workspace">
      <div className="section-head">
        <div><h2>비용 내역</h2><p>고정비와 변동비를 나눠 회사 지출을 관리합니다.</p></div>
        <div className="filters">
          <div className="segment" aria-label="비용 유형 필터">
            <button className={costFilter === "all" ? "active" : ""} onClick={() => setCostFilter("all")}>전체</button>
            <button className={costFilter === "fixed" ? "active" : ""} onClick={() => setCostFilter("fixed")}>고정비</button>
            <button className={costFilter === "variable" ? "active" : ""} onClick={() => setCostFilter("variable")}>변동비</button>
          </div>
          <input type="month" value={month} onChange={(e) => onMonth(e.target.value)} />
        </div>
      </div>
      {visibleExpenses.length ? <div className="table-wrap"><table className="data-table expense-table"><thead><tr><th>사용일</th><th>구분</th><th>항목</th><th>사용 내역</th><th>거래처</th><th>결제수단</th><th>상태</th><th>금액</th><th /></tr></thead><tbody>{visibleExpenses.map((expense) => <tr key={expense.id}><td>{formatDate(expense.expenseDate, false)}</td><td><span className={`cost-type-badge ${expense.costType}`}>{expense.costType === "fixed" ? "고정비" : "변동비"}</span></td><td><span className="category-badge">{expense.category}</span></td><td><strong>{expense.description}</strong><small>{expense.sourceCardUsageId ? "카드 사용·증빙에서 자동 연결" : expense.isRecurring ? "매월 자동 등록 설정" : expense.recurringParentId ? "자동 생성된 비용" : expense.memo || "메모 없음"}</small></td><td>{expense.vendor || "-"}</td><td>{expense.paymentMethod}</td><td><span className={`status-badge ${expense.paymentStatus === "paid" ? "active" : "leave"}`}>{expense.paymentStatus === "paid" ? "결제 완료" : "결제 예정"}</span></td><td className="money-cell">{formatMoney(expense.amount)}</td><td><div className="row-actions"><button className="text-button" onClick={() => onEdit(expense)}>수정</button><button className="text-button danger" onClick={() => onDelete(expense.id)}>삭제</button></div></td></tr>)}</tbody><tfoot><tr><td colSpan={7}>{costFilter === "all" ? "선택한 월 합계" : `${costFilter === "fixed" ? "고정비" : "변동비"} 합계`}</td><td className="money-cell">{formatMoney(visibleTotal)}</td><td /></tr></tfoot></table></div> : <Empty text={costFilter === "all" ? "선택한 달에 등록된 회사 비용이 없습니다." : `선택한 달에 등록된 ${costFilter === "fixed" ? "고정비" : "변동비"}가 없습니다.`} />}
    </section>
    <section className="workspace revenue-workspace">
      <div className="section-head"><div><h2>매출 내역</h2><p>선택한 달의 매출과 입금 상태를 확인합니다.</p></div><div className="filters"><input type="month" value={month} onChange={(e) => onMonth(e.target.value)} /></div></div>
      {revenues.length ? <div className="table-wrap"><table className="data-table revenue-table"><thead><tr><th>매출일</th><th>구분</th><th>매출 내역</th><th>고객·거래처</th><th>결제수단</th><th>상태</th><th>금액</th><th /></tr></thead><tbody>{revenues.map((revenue) => <tr key={revenue.id}><td>{formatDate(revenue.revenueDate, false)}</td><td><span className="category-badge">{revenue.category}</span></td><td><strong>{revenue.description}</strong><small>{revenue.memo || "메모 없음"}</small></td><td>{revenue.client || "-"}</td><td>{revenue.paymentMethod}</td><td><span className={`status-badge ${revenue.paymentStatus === "received" ? "active" : "leave"}`}>{revenue.paymentStatus === "received" ? "입금 완료" : "입금 예정"}</span></td><td className="money-cell">{formatMoney(revenue.amount)}</td><td><div className="row-actions"><button className="text-button" onClick={() => onEditRevenue(revenue)}>수정</button><button className="text-button danger" onClick={() => onDeleteRevenue(revenue.id)}>삭제</button></div></td></tr>)}</tbody><tfoot><tr><td colSpan={6}>선택한 월 매출 합계</td><td className="money-cell">{formatMoney(monthlyRevenueTotal)}</td><td /></tr></tfoot></table></div> : <Empty text="선택한 달에 등록된 매출이 없습니다." />}
    </section>
  </>;
}

function Stat({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "red" | "cream" }) { return <article className={`stat-card ${tone}`}><span className="stat-label">{label}</span><strong>{value}</strong><p>{note}</p></article>; }
function PanelHead({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button className="text-button" onClick={onAction}>{action} →</button>}</div>; }
function Empty({ text }: { text: string }) { return <div className="empty-state"><span>＋</span><p>{text}</p></div>; }
function DetailGroup({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="detail-group"><div className="detail-group-head"><h3>{title}</h3>{action}</div>{children}</section>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="info-row"><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Modal({ title, description, onClose, wide = false, children }: { title: string; description: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button onClick={onClose} aria-label="닫기">×</button></div>{children}</section></div>; }
function ModalActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>취소</button><button className="primary-button" disabled={saving}>{saving ? "저장 중..." : label}</button></div>; }
