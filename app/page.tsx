"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Employee = {
  id: number;
  name: string;
  department: string;
  joinDate: string;
  annualAllowance: number | null;
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

type Ledger = { employees: Employee[]; entries: LeaveEntry[] };
type Tab = "ledger" | "history" | "people";
type EmployeeDraft = {
  id?: number;
  name: string;
  department: string;
  joinDate: string;
  annualAllowance: string;
};

const EMPTY_LEDGER: Ledger = { employees: [], entries: [] };
const DEPARTMENTS = ["전체 팀", "콘텐츠팀", "마케팅팀", "디자인팀", "개발팀", "경영지원"];

function localIsoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function calcFullMonths(start: Date, end: Date) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function calcAccrued(joinDate: string, manual: number | null, asOf: Date) {
  if (manual !== null && manual !== undefined) return manual;
  const joined = new Date(`${joinDate}T00:00:00`);
  if (joined > asOf) return 0;
  const fullMonths = calcFullMonths(joined, asOf);
  if (fullMonths < 12) return Math.min(11, fullMonths);
  const fullYears = Math.floor(fullMonths / 12);
  return Math.min(25, 15 + Math.floor((fullYears - 1) / 2));
}

function formatDays(value: number) {
  return Number.isInteger(value) ? `${value}일` : `${value.toFixed(1)}일`;
}

function formatDate(value: string, withYear = false) {
  const date = new Date(`${value}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    ...(withYear ? { year: "numeric" as const } : {}),
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function tenure(joinDate: string, asOf: Date) {
  const months = calcFullMonths(new Date(`${joinDate}T00:00:00`), asOf);
  if (months < 12) return `입사 ${months}개월`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}년 ${rest}개월` : `${years}년`;
}

function typeLabel(type: LeaveEntry["leaveType"]) {
  if (type === "half-am") return "오전 반차";
  if (type === "half-pm") return "오후 반차";
  return "연차";
}

function initials(name: string) {
  return name.slice(-2);
}

export default function Home() {
  const today = localIsoDate();
  const currentYear = Number(today.slice(0, 4));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [ledger, setLedger] = useState<Ledger>(EMPTY_LEDGER);
  const [tab, setTab] = useState<Tab>("ledger");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("전체 팀");
  const [employeeModal, setEmployeeModal] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [draft, setDraft] = useState<EmployeeDraft>({
    name: "",
    department: "콘텐츠팀",
    joinDate: today,
    annualAllowance: "",
  });
  const [leaveDraft, setLeaveDraft] = useState({
    employeeId: "",
    leaveDate: today,
    leaveType: "full" as LeaveEntry["leaveType"],
    note: "",
  });

  const asOf = useMemo(() => {
    const value = selectedYear === currentYear ? today : `${selectedYear}-12-31`;
    return new Date(`${value}T23:59:59`);
  }, [selectedYear, currentYear, today]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ledger", { cache: "no-store" });
      const data = (await response.json()) as Ledger & { error?: string };
      if (!response.ok) throw new Error(data.error || "대장을 불러오지 못했습니다.");
      setLedger(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대장을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const yearEntries = useMemo(
    () => ledger.entries.filter((entry) => Number(entry.leaveDate.slice(0, 4)) === selectedYear),
    [ledger.entries, selectedYear],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ledger.employees
      .filter(
        (employee) =>
          (department === "전체 팀" || employee.department === department) &&
          (!query || employee.name.toLowerCase().includes(query) || employee.department.toLowerCase().includes(query)),
      )
      .map((employee) => {
        const employeeEntries = yearEntries.filter((entry) => entry.employeeId === employee.id);
        const accrued = calcAccrued(employee.joinDate, employee.annualAllowance, asOf);
        const used = employeeEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
        return { employee, entries: employeeEntries, accrued, used, remaining: accrued - used };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name, "ko"));
  }, [ledger.employees, yearEntries, search, department, asOf]);

  const totals = useMemo(() => {
    const allRows = ledger.employees.map((employee) => {
      const accrued = calcAccrued(employee.joinDate, employee.annualAllowance, asOf);
      const used = yearEntries
        .filter((entry) => entry.employeeId === employee.id)
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      return { accrued, used };
    });
    const accrued = allRows.reduce((sum, row) => sum + row.accrued, 0);
    const used = allRows.reduce((sum, row) => sum + row.used, 0);
    const upcoming = yearEntries.filter((entry) => entry.leaveDate >= today).length;
    return { accrued, used, remaining: accrued - used, upcoming };
  }, [ledger.employees, yearEntries, asOf, today]);

  function openNewEmployee() {
    setDraft({ name: "", department: "콘텐츠팀", joinDate: today, annualAllowance: "" });
    setEmployeeModal(true);
  }

  function openEditEmployee(employee: Employee) {
    setDraft({
      id: employee.id,
      name: employee.name,
      department: employee.department,
      joinDate: employee.joinDate,
      annualAllowance: employee.annualAllowance === null ? "" : String(employee.annualAllowance),
    });
    setEmployeeModal(true);
  }

  function openLeave(employeeId?: number) {
    setLeaveDraft({
      employeeId: employeeId ? String(employeeId) : ledger.employees[0] ? String(ledger.employees[0].id) : "",
      leaveDate: today,
      leaveType: "full",
      note: "",
    });
    setLeaveModal(true);
  }

  async function submitEmployee(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ledger", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "employee", ...draft }),
      });
      const data = (await response.json()) as Ledger & { error?: string };
      if (!response.ok) throw new Error(data.error || "직원 정보를 저장하지 못했습니다.");
      setLedger(data);
      setEmployeeModal(false);
      setToast(draft.id ? "직원 정보가 수정되었습니다." : "새 직원이 등록되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "leave", ...leaveDraft }),
      });
      const data = (await response.json()) as Ledger & { error?: string };
      if (!response.ok) throw new Error(data.error || "휴가를 등록하지 못했습니다.");
      setLedger(data);
      setLeaveModal(false);
      setToast("휴가 사용 내역이 등록되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: "entry" | "employee", id: number) {
    const message = kind === "employee" ? "직원과 해당 휴가 기록을 모두 삭제할까요?" : "이 휴가 기록을 삭제할까요?";
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/ledger?kind=${kind}&id=${id}`, { method: "DELETE" });
      const data = (await response.json()) as Ledger & { error?: string };
      if (!response.ok) throw new Error(data.error || "삭제하지 못했습니다.");
      setLedger(data);
      setToast("삭제되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="연월차 관리 대장 홈">
          <span className="brand-mark">B</span>
          <span>BRANDYACTION ERP</span>
        </a>
        <nav className="desktop-nav" aria-label="주요 메뉴">
          <button className={tab === "ledger" ? "active" : ""} onClick={() => setTab("ledger")}>연차 대장</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>사용 내역</button>
          <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>직원 관리</button>
        </nav>
        <div className="top-actions">
          <div className="today-pill"><span className="status-dot" /> {formatDate(today, true)} 기준</div>
          <button className="logout-button" onClick={() => void logout()}>로그아웃</button>
          <button className="primary-button compact" onClick={() => openLeave()} disabled={!ledger.employees.length}>
            <span aria-hidden>＋</span> 휴가 등록
          </button>
        </div>
      </header>

      <div className="page" id="top">
        <section className="intro">
          <div>
            <p className="eyebrow">LEAVE MANAGEMENT</p>
            <h1>{selectedYear}년 휴가 현황</h1>
            <p className="intro-copy">직원별 연차 발생부터 사용 내역, 잔여 일수까지 한눈에 관리하세요.</p>
          </div>
          <div className="intro-actions">
            <label className="year-select">
              <span>조회 연도</span>
              <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {years.map((year) => <option value={year} key={year}>{year}년</option>)}
              </select>
            </label>
            <button className="secondary-button" onClick={openNewEmployee}><span aria-hidden>＋</span> 직원 추가</button>
          </div>
        </section>

        <section className="stat-grid" aria-label="연차 요약">
          <article className="stat-card accent-card">
            <div className="stat-label"><span className="stat-icon">◎</span> 전체 직원</div>
            <strong>{ledger.employees.length}<small>명</small></strong>
            <p>현재 등록된 재직자</p>
          </article>
          <article className="stat-card">
            <div className="stat-label"><span className="stat-icon mint">↗</span> 총 발생 연차</div>
            <strong>{formatDays(totals.accrued).replace("일", "")}<small>일</small></strong>
            <p>선택 연도 기준 자동 산정</p>
          </article>
          <article className="stat-card">
            <div className="stat-label"><span className="stat-icon coral">✓</span> 사용 연차</div>
            <strong>{formatDays(totals.used).replace("일", "")}<small>일</small></strong>
            <p>총 발생 대비 {totals.accrued ? Math.round((totals.used / totals.accrued) * 100) : 0}% 사용</p>
          </article>
          <article className="stat-card balance-card">
            <div className="stat-label"><span className="stat-icon lime">◷</span> 잔여 연차</div>
            <strong>{formatDays(totals.remaining).replace("일", "")}<small>일</small></strong>
            <div className="mini-progress"><span style={{ width: `${totals.accrued ? Math.max(0, Math.min(100, (totals.remaining / totals.accrued) * 100)) : 0}%` }} /></div>
          </article>
        </section>

        {error && <div className="error-banner"><span>!</span><p>{error}</p><button onClick={() => setError("")}>닫기</button></div>}

        <section className="workspace">
          <div className="mobile-tabs" role="tablist">
            <button onClick={() => setTab("ledger")} className={tab === "ledger" ? "active" : ""}>직원별 현황</button>
            <button onClick={() => setTab("history")} className={tab === "history" ? "active" : ""}>사용 내역</button>
            <button onClick={() => setTab("people")} className={tab === "people" ? "active" : ""}>직원 관리</button>
          </div>

          {tab === "ledger" && (
            <>
              <div className="section-head">
                <div><h2>직원별 연차 현황</h2><p>{selectedYear}년 발생·사용 기준</p></div>
                <div className="filters">
                  <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름 또는 팀 검색" /></label>
                  <select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="팀 필터">
                    {DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table className="leave-table">
                  <thead><tr><th>직원</th><th>입사일</th><th>발생 연차</th><th>사용</th><th>잔여</th><th>사용률</th><th>최근 사용 내역</th><th><span className="sr-only">관리</span></th></tr></thead>
                  <tbody>
                    {loading ? Array.from({ length: 5 }).map((_, index) => <tr className="skeleton-row" key={index}><td colSpan={8}><span /></td></tr>) : rows.map(({ employee, entries, accrued, used, remaining }, index) => {
                      const rate = accrued ? Math.min(100, Math.round((used / accrued) * 100)) : 0;
                      return (
                        <tr key={employee.id}>
                          <td><div className="person"><span className={`avatar avatar-${index % 5}`}>{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.department}</small></span></div></td>
                          <td><strong className="date-cell">{employee.joinDate.replaceAll("-", ".")}</strong><small>{tenure(employee.joinDate, asOf)}</small></td>
                          <td><strong className="number-cell">{formatDays(accrued)}</strong><small>{employee.annualAllowance === null ? "자동 계산" : "직접 설정"}</small></td>
                          <td><strong className="number-cell used">{formatDays(used)}</strong></td>
                          <td><strong className={`remaining ${remaining < 2 ? "low" : ""}`}>{formatDays(remaining)}</strong></td>
                          <td><div className="rate"><span><i style={{ width: `${rate}%` }} /></span><small>{rate}%</small></div></td>
                          <td><div className="leave-chips">{entries.slice(0, 3).map((entry) => <span key={entry.id} className={entry.amount === 0.5 ? "half" : ""}>{formatDate(entry.leaveDate)} · {entry.amount === 0.5 ? "반차" : "연차"}</span>)}{!entries.length && <em>사용 내역 없음</em>}{entries.length > 3 && <b>+{entries.length - 3}</b>}</div></td>
                          <td><button className="row-button" onClick={() => openLeave(employee.id)} aria-label={`${employee.name} 휴가 등록`}>＋</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!loading && !rows.length && <Empty title="검색 결과가 없습니다" copy="이름이나 팀 필터를 변경해보세요." />}
              </div>
              <div className="policy-note"><span>i</span><p><strong>자동 발생 기준</strong> 입사 1년 미만은 매월 1일(최대 11일), 1년 이상은 15일부터 근속연수에 따라 산정합니다. 실제 부여일은 직원 정보에서 직접 조정할 수 있습니다.</p></div>
            </>
          )}

          {tab === "history" && (
            <>
              <div className="section-head"><div><h2>휴가 사용 내역</h2><p>{selectedYear}년 등록 기록 {yearEntries.length}건</p></div><button className="primary-button" onClick={() => openLeave()} disabled={!ledger.employees.length}>＋ 휴가 등록</button></div>
              <div className="history-list">
                {loading ? <div className="loading-block">내역을 불러오는 중입니다.</div> : yearEntries.map((entry, index) => (
                  <article className="history-item" key={entry.id}>
                    <div className="history-date"><strong>{Number(entry.leaveDate.slice(-2))}</strong><span>{Number(entry.leaveDate.slice(5, 7))}월</span></div>
                    <span className={`avatar avatar-${index % 5}`}>{initials(entry.employeeName)}</span>
                    <div className="history-main"><strong>{entry.employeeName}</strong><p>{entry.note || typeLabel(entry.leaveType)}</p></div>
                    <span className="history-type">{typeLabel(entry.leaveType)}</span>
                    <span className="history-amount">-{formatDays(Number(entry.amount))}</span>
                    <button className="text-button danger" onClick={() => void remove("entry", entry.id)} disabled={saving}>삭제</button>
                  </article>
                ))}
                {!loading && !yearEntries.length && <Empty title="등록된 휴가가 없습니다" copy="휴가 등록 버튼을 눌러 첫 내역을 추가해보세요." />}
              </div>
            </>
          )}

          {tab === "people" && (
            <>
              <div className="section-head"><div><h2>직원 관리</h2><p>입사일과 연차 부여 기준을 관리합니다.</p></div><button className="primary-button" onClick={openNewEmployee}>＋ 직원 추가</button></div>
              <div className="people-grid">
                {ledger.employees.map((employee, index) => {
                  const accrued = calcAccrued(employee.joinDate, employee.annualAllowance, asOf);
                  return <article className="person-card" key={employee.id}>
                    <div className="person-card-top"><span className={`avatar large avatar-${index % 5}`}>{initials(employee.name)}</span><span className="team-badge">{employee.department}</span></div>
                    <h3>{employee.name}</h3><p>{employee.joinDate.replaceAll("-", ".")} 입사 · {tenure(employee.joinDate, asOf)}</p>
                    <div className="person-card-stats"><span><small>부여 기준</small><strong>{employee.annualAllowance === null ? "자동" : "직접"}</strong></span><span><small>{selectedYear}년 발생</small><strong>{formatDays(accrued)}</strong></span></div>
                    <div className="person-card-actions"><button onClick={() => openEditEmployee(employee)}>정보 수정</button><button className="danger" onClick={() => void remove("employee", employee.id)} disabled={saving}>삭제</button></div>
                  </article>;
                })}
                {!loading && !ledger.employees.length && <Empty title="등록된 직원이 없습니다" copy="직원을 추가하면 연차가 자동 계산됩니다." />}
              </div>
            </>
          )}
        </section>
      </div>

      <footer><span>BRANDYACTION ERP</span><p>정확한 연차 부여는 회사 취업규칙과 노무 기준을 함께 확인해주세요.</p></footer>

      {employeeModal && <Modal title={draft.id ? "직원 정보 수정" : "새 직원 등록"} copy="입사일을 기준으로 연차가 자동 계산됩니다." onClose={() => setEmployeeModal(false)}>
        <form onSubmit={submitEmployee} className="modal-form">
          <label><span>이름</span><input required autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="직원 이름" /></label>
          <label><span>소속 팀</span><input required value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} placeholder="예: 콘텐츠팀" list="departments" /><datalist id="departments">{DEPARTMENTS.slice(1).map((item) => <option value={item} key={item} />)}</datalist></label>
          <label><span>입사일</span><input type="date" required value={draft.joinDate} onChange={(event) => setDraft({ ...draft, joinDate: event.target.value })} /></label>
          <label><span>연차 직접 부여 <em>선택</em></span><div className="input-suffix"><input type="number" min="0" max="30" step="0.5" value={draft.annualAllowance} onChange={(event) => setDraft({ ...draft, annualAllowance: event.target.value })} placeholder="비워두면 자동 계산" /><b>일</b></div><small>회사 기준이 다른 경우에만 입력하세요.</small></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEmployeeModal(false)}>취소</button><button className="primary-button" disabled={saving}>{saving ? "저장 중…" : draft.id ? "수정하기" : "직원 등록"}</button></div>
        </form>
      </Modal>}

      {leaveModal && <Modal title="휴가 사용 등록" copy="사용 일수를 입력하면 잔여 연차에 바로 반영됩니다." onClose={() => setLeaveModal(false)}>
        <form onSubmit={submitLeave} className="modal-form">
          <label><span>직원</span><select required value={leaveDraft.employeeId} onChange={(event) => setLeaveDraft({ ...leaveDraft, employeeId: event.target.value })}><option value="">직원 선택</option>{ledger.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name} · {employee.department}</option>)}</select></label>
          <label><span>사용일</span><input type="date" required value={leaveDraft.leaveDate} onChange={(event) => setLeaveDraft({ ...leaveDraft, leaveDate: event.target.value })} /></label>
          <fieldset><legend>휴가 유형</legend><div className="type-options">{([['full', '연차', '1일'], ['half-am', '오전 반차', '0.5일'], ['half-pm', '오후 반차', '0.5일']] as const).map(([value, label, days]) => <label className={leaveDraft.leaveType === value ? "selected" : ""} key={value}><input type="radio" name="leaveType" value={value} checked={leaveDraft.leaveType === value} onChange={() => setLeaveDraft({ ...leaveDraft, leaveType: value })} /><span><strong>{label}</strong><small>{days}</small></span></label>)}</div></fieldset>
          <label><span>메모 <em>선택</em></span><input value={leaveDraft.note} onChange={(event) => setLeaveDraft({ ...leaveDraft, note: event.target.value })} placeholder="예: 개인 일정" /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setLeaveModal(false)}>취소</button><button className="primary-button" disabled={saving}>{saving ? "등록 중…" : "휴가 등록"}</button></div>
        </form>
      </Modal>}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function Modal({ title, copy, onClose, children }: { title: string; copy: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><h2 id="modal-title">{title}</h2><p>{copy}</p></div><button onClick={onClose} aria-label="닫기">×</button></div>
      {children}
    </section>
  </div>;
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>○</span><h3>{title}</h3><p>{copy}</p></div>;
}
