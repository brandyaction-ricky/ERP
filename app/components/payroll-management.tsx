"use client";

import { FormEvent, useMemo, useState } from "react";

export type Payroll = {
  id: number;
  payrollMonth: string;
  employeeId: number;
  basePay: number;
  mealAllowance: number;
  childcareAllowance: number;
  fixedOvertimePay: number;
  holidayPay: number;
  researchAllowance: number;
  otherAllowance: number;
  totalPay: number;
  pensionBase: number;
  healthBase: number;
  employmentBase: number;
  autoInsurance: boolean;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  incomeTax: number;
  localIncomeTax: number;
  otherDeduction: number;
  totalDeduction: number;
  netPay: number;
  paymentStatus: "draft" | "confirmed" | "paid";
  paymentDate: string | null;
  rateYear: number;
  memo: string;
  createdAt: string;
};

type Employee = { id: number; name: string; department: string; position: string; employmentStatus: string };
type Contract = { employeeId: number; monthlySalary: number; status: string };
type Save = (payload: Record<string, unknown>, method?: "POST" | "PATCH") => Promise<boolean>;

const money = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
const number = (value: unknown) => Math.max(0, Number(value) || 0);
const signedNumber = (value: unknown) => Number(value) || 0;
const round10 = (value: number) => Math.floor(value / 10) * 10;

export function calculateInsurance(month: string, pensionBase: number, healthBase: number, employmentBase: number) {
  const july2026 = month >= "2026-07";
  const pensionMin = july2026 ? 410_000 : 400_000;
  const pensionMax = july2026 ? 6_590_000 : 6_370_000;
  const pensionStandard = pensionBase > 0 ? Math.min(pensionMax, Math.max(pensionMin, pensionBase)) : 0;
  const nationalPension = round10(pensionStandard * 0.0475);
  const healthInsurance = round10(healthBase * 0.03595);
  const longTermCare = round10(healthInsurance * (0.009448 / 0.0719));
  const employmentInsurance = round10(employmentBase * 0.009);
  return { nationalPension, healthInsurance, longTermCare, employmentInsurance };
}

function calculateEmployerInsurance(month: string, pensionBase: number, healthBase: number, employmentBase: number) {
  const employee = calculateInsurance(month, pensionBase, healthBase, employmentBase);
  return { ...employee, employmentInsurance: round10(employmentBase * 0.0115) };
}

function draft(month: string, employeeId: number, salary = 0, payroll?: Payroll) {
  const basePay = payroll?.basePay ?? salary;
  return {
    id: payroll?.id,
    payrollMonth: payroll?.payrollMonth ?? month,
    employeeId: String((payroll?.employeeId ?? employeeId) || ""),
    basePay: String(basePay || ""),
    mealAllowance: String(payroll?.mealAllowance ?? 200_000),
    childcareAllowance: String(payroll?.childcareAllowance ?? 0),
    fixedOvertimePay: String(payroll?.fixedOvertimePay ?? 0),
    holidayPay: String(payroll?.holidayPay ?? 0),
    researchAllowance: String(payroll?.researchAllowance ?? 0),
    otherAllowance: String(payroll?.otherAllowance ?? 0),
    pensionBase: String((payroll?.pensionBase ?? basePay) || ""),
    healthBase: String((payroll?.healthBase ?? basePay) || ""),
    employmentBase: String((payroll?.employmentBase ?? basePay) || ""),
    autoInsurance: payroll?.autoInsurance ?? true,
    nationalPension: String(payroll?.nationalPension ?? 0),
    healthInsurance: String(payroll?.healthInsurance ?? 0),
    longTermCare: String(payroll?.longTermCare ?? 0),
    employmentInsurance: String(payroll?.employmentInsurance ?? 0),
    incomeTax: String(payroll?.incomeTax ?? 0),
    localIncomeTax: String(payroll?.localIncomeTax ?? 0),
    otherDeduction: String(payroll?.otherDeduction ?? 0),
    paymentStatus: payroll?.paymentStatus ?? ("draft" as Payroll["paymentStatus"]),
    paymentDate: payroll?.paymentDate ?? "",
    memo: payroll?.memo ?? "",
  };
}

export function PayrollManagement({ payrolls, employees, contracts, saving, onSave, onDelete }: { payrolls: Payroll[]; employees: Employee[]; contracts: Contract[]; saving: boolean; onSave: Save; onDelete: (id: number) => void }) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(() => draft(currentMonth, employees[0]?.id ?? 0));
  const monthRows = useMemo(() => payrolls.filter((row) => row.payrollMonth === month), [payrolls, month]);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const activeEmployees = employees.filter((employee) => employee.employmentStatus === "active");
  const totals = monthRows.reduce((sum, row) => ({ gross: sum.gross + row.totalPay, deduction: sum.deduction + row.totalDeduction, net: sum.net + row.netPay }), { gross: 0, deduction: 0, net: 0 });

  const payTotal = [form.basePay, form.mealAllowance, form.childcareAllowance, form.fixedOvertimePay, form.holidayPay, form.researchAllowance, form.otherAllowance].reduce((sum, value) => sum + number(value), 0);
  const calculated = calculateInsurance(form.payrollMonth, payTotal, payTotal, payTotal);
  const insurance = form.autoInsurance ? calculated : {
    nationalPension: number(form.nationalPension),
    healthInsurance: number(form.healthInsurance),
    longTermCare: number(form.longTermCare),
    employmentInsurance: number(form.employmentInsurance),
  };
  const employerInsurance = calculateEmployerInsurance(form.payrollMonth, payTotal, payTotal, payTotal);
  const deductionTotal = insurance.nationalPension + insurance.healthInsurance + insurance.longTermCare + insurance.employmentInsurance + number(form.incomeTax) + number(form.localIncomeTax) + signedNumber(form.otherDeduction);

  function employeeSalary(employeeId: number) {
    return contracts.find((contract) => contract.employeeId === employeeId && contract.status === "active")?.monthlySalary ?? 0;
  }

  function open(payroll?: Payroll) {
    const employeeId = payroll?.employeeId ?? activeEmployees[0]?.id ?? employees[0]?.id ?? 0;
    setForm(draft(month, employeeId, employeeSalary(employeeId), payroll));
    setModal(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const success = await onSave({ action: "payroll", ...form, pensionBase: payTotal, healthBase: payTotal, employmentBase: payTotal }, form.id ? "PATCH" : "POST");
    if (success) setModal(false);
  }

  async function copyPreviousMonth() {
    const target = new Date(`${month}-01T12:00:00`);
    target.setMonth(target.getMonth() - 1);
    const sourceMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    await onSave({ action: "payrollCopy", sourceMonth, targetMonth: month });
  }

  return <>
    <div className="stat-grid payroll-stats">
      <article className="stat-card red"><span className="stat-label">지급 합계</span><strong>{money(totals.gross)}</strong><p>{monthRows.length}명 급여대장</p></article>
      <article className="stat-card"><span className="stat-label">공제 합계</span><strong>{money(totals.deduction)}</strong><p>4대보험·세금 포함</p></article>
      <article className="stat-card cream"><span className="stat-label">차인지급 합계</span><strong>{money(totals.net)}</strong><p>실제 지급 예정 금액</p></article>
    </div>
    <section className="workspace">
      <div className="section-head"><div><h2>{month.replace("-", "년 ")}월 급여대장</h2><p>직원별 지급액·공제액·차인지급액을 관리합니다.</p></div><div className="filters"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="secondary-button compact" disabled={saving} onClick={copyPreviousMonth}>전월 급여 불러오기</button><button className="primary-button compact" onClick={() => open()}>+ 급여 등록</button></div></div>
      {monthRows.length ? <div className="table-wrap"><table className="data-table payroll-table"><thead><tr><th>직원</th><th>기본급</th><th>수당</th><th>지급 합계</th><th>4대보험</th><th>세금·기타</th><th>차인지급액</th><th>상태</th><th /></tr></thead><tbody>{monthRows.map((row) => { const employee = employeeMap.get(row.employeeId); const allowances = row.totalPay - row.basePay; const insuranceTotal = row.nationalPension + row.healthInsurance + row.longTermCare + row.employmentInsurance; return <tr key={row.id}><td><strong>{employee?.name ?? "삭제된 직원"}</strong><small>{employee ? `${employee.department} · ${employee.position}` : ""}</small></td><td>{money(row.basePay)}</td><td>{money(allowances)}</td><td className="money-cell">{money(row.totalPay)}</td><td>{money(insuranceTotal)}<small>자동계산 {row.autoInsurance ? "적용" : "해제"}</small></td><td>{money(row.incomeTax + row.localIncomeTax + row.otherDeduction)}</td><td className="money-cell">{money(row.netPay)}</td><td><span className={`status-badge ${row.paymentStatus === "paid" ? "active" : row.paymentStatus === "confirmed" ? "leave" : "retired"}`}>{row.paymentStatus === "paid" ? "지급 완료" : row.paymentStatus === "confirmed" ? "확정" : "작성 중"}</span></td><td><div className="row-actions"><button className="text-button" onClick={() => open(row)}>수정</button><button className="text-button danger" onClick={() => onDelete(row.id)}>삭제</button></div></td></tr>; })}</tbody></table></div> : <div className="empty-state"><span>＋</span><p>선택한 달의 급여대장이 없습니다.</p></div>}
    </section>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setModal(false); }}><section className="modal wide payroll-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{form.id ? "급여대장 수정" : "급여대장 등록"}</h2><p>지급 항목과 기준 보수월액을 입력하면 4대보험 근로자 부담분을 계산합니다.</p></div><button onClick={() => setModal(false)} aria-label="닫기">×</button></div><form className="modal-form" onSubmit={submit}>
      <div className="form-grid two"><label className="field"><span>귀속 월 *</span><input required type="month" value={form.payrollMonth} onChange={(event) => setForm({ ...form, payrollMonth: event.target.value })} /></label><label className="field"><span>직원 *</span><select required value={form.employeeId} onChange={(event) => { const employeeId = Number(event.target.value); const salary = employeeSalary(employeeId); setForm({ ...form, employeeId: event.target.value, basePay: String(salary || ""), pensionBase: String(salary || ""), healthBase: String(salary || ""), employmentBase: String(salary || "") }); }}><option value="">직원을 선택하세요</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></label></div>
      <div className="payroll-form-section"><h3>지급 내역</h3><div className="form-grid three">{[["기본급", "basePay"], ["식대", "mealAllowance"], ["보육수당", "childcareAllowance"], ["고정연장근로수당", "fixedOvertimePay"], ["월차지원금", "holidayPay"], ["연구활동비", "researchAllowance"], ["기타 수당", "otherAllowance"]].map(([label, key]) => <label className="field" key={key}><span>{label}</span><input type="number" min="0" value={form[key as keyof typeof form] as string} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}</div><div className="payroll-inline-total"><span>지급 합계</span><strong>{money(payTotal)}</strong></div></div>
      <div className="payroll-form-section"><div className="payroll-section-head"><div><h3>4대보험 자동계산</h3><p>지급 합계 {money(payTotal)}를 월 급여로 보고 2026년 요율을 즉시 계산합니다. 사업주 고용보험은 150인 미만 기준을 고정 적용합니다.</p></div><label className="toggle-label"><input type="checkbox" checked={form.autoInsurance} onChange={(event) => setForm({ ...form, autoInsurance: event.target.checked })} /> 자동계산</label></div><div className="insurance-matrix"><div className="insurance-matrix-head"><span>구분</span><span>근로자 부담</span><span>사업주 부담</span><span>보험료 합계</span></div>{[["국민연금", insurance.nationalPension, employerInsurance.nationalPension], ["건강보험", insurance.healthInsurance, employerInsurance.healthInsurance], ["장기요양", insurance.longTermCare, employerInsurance.longTermCare], ["고용보험", insurance.employmentInsurance, employerInsurance.employmentInsurance]].map(([label, employeeValue, employerValue]) => <div className="insurance-matrix-row" key={String(label)}><strong>{label}</strong><span>{money(Number(employeeValue))}</span><span>{money(Number(employerValue))}</span><b>{money(Number(employeeValue) + Number(employerValue))}</b></div>)}</div>{!form.autoInsurance && <div className="form-grid four">{[["국민연금", "nationalPension"], ["건강보험", "healthInsurance"], ["장기요양", "longTermCare"], ["고용보험", "employmentInsurance"]].map(([label, key]) => <label className="field" key={key}><span>{label}</span><input type="number" min="0" value={form[key as keyof typeof form] as string} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}</div>}<p className="insurance-caveat">산재보험은 업종별 요율이 달라 이 계산에서 제외됩니다. 실제 고지액은 보수월액·정산 내역에 따라 달라질 수 있습니다.</p></div>
      <div className="payroll-form-section"><h3>세금·정산</h3><div className="form-grid three"><label className="field"><span>소득세</span><input type="number" min="0" value={form.incomeTax} onChange={(event) => setForm({ ...form, incomeTax: event.target.value, localIncomeTax: String(Math.floor(number(event.target.value) * 0.1 / 10) * 10) })} /></label><label className="field"><span>지방소득세</span><input type="number" min="0" value={form.localIncomeTax} onChange={(event) => setForm({ ...form, localIncomeTax: event.target.value })} /></label><label className="field"><span>정산·기타 공제</span><input type="number" value={form.otherDeduction} onChange={(event) => setForm({ ...form, otherDeduction: event.target.value })} /></label></div><p className="payroll-field-help">정산 환급처럼 공제액을 줄이는 금액은 음수로 입력할 수 있습니다.</p><div className="payroll-result"><div><span>공제 합계</span><strong>{money(deductionTotal)}</strong></div><div><span>차인지급액</span><strong>{money(Math.max(0, payTotal - deductionTotal))}</strong></div></div></div>
      <div className="form-grid two"><label className="field"><span>지급 상태</span><select value={form.paymentStatus} onChange={(event) => setForm({ ...form, paymentStatus: event.target.value as Payroll["paymentStatus"] })}><option value="draft">작성 중</option><option value="confirmed">확정</option><option value="paid">지급 완료</option></select></label><label className="field"><span>지급일</span><input type="date" value={form.paymentDate} onChange={(event) => setForm({ ...form, paymentDate: event.target.value })} /></label></div><label className="field"><span>메모</span><textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></label>
      <div className="payroll-rate-note"><strong>2026 적용 기준</strong><span>국민연금 근로자·사업주 각 4.75% · 건강보험 각 3.595% · 장기요양 건강보험료 연동 · 고용보험 근로자 0.9% / 사업주 1.15%(150인 미만)</span><small>소득세는 부양가족 수 등에 따라 달라지므로 국세청 간이세액표의 금액을 입력합니다.</small></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(false)}>취소</button><button className="primary-button" disabled={saving}>{saving ? "저장 중..." : "급여대장 저장"}</button></div>
    </form></section></div>}
  </>;
}
