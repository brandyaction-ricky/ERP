"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type EmployeeOption = { id: number; name: string; department: string; employmentStatus: string };

export type CompanyCard = {
  id: number;
  cardCompany: string;
  cardName: string;
  cardAlias: string;
  cardLast4: string;
  holderName: string;
  creditLimit: number;
  status: "active" | "inactive";
  issuedDate: string | null;
  expiryMonth: string | null;
  responsibleEmployeeId: number | null;
  memo: string;
  createdAt: string;
};

export type BankAccount = {
  id: number;
  bankName: string;
  accountName: string;
  accountAlias: string;
  accountNumber: string;
  accountType: "checking" | "savings" | "loan" | "other";
  balance: number;
  status: "active" | "inactive";
  openedDate: string | null;
  responsibleEmployeeId: number | null;
  purpose: string;
  memo: string;
  createdAt: string;
};

export type CardUsage = {
  id: number;
  companyCardId: number | null;
  evidenceMethod: "corporate-card" | "tax-invoice" | "cash-receipt" | "other";
  transactionDate: string;
  merchant: string;
  amount: number;
  requestedAmount: number;
  purpose: string;
  userEmployeeId: number | null;
  evidenceStatus: "missing" | "submitted" | "confirmed";
  dueDate: string | null;
  receiptUrl: string;
  memo: string;
  createdAt: string;
};

type SaveHandler = (payload: Record<string, unknown>, method?: "POST" | "PATCH") => Promise<boolean>;

function localIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function date(value: string | null) {
  if (!value) return "미설정";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(`${value}T12:00:00+09:00`));
}

function month(value: string | null) {
  if (!value) return "미설정";
  const [year, monthNumber] = value.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function employeeName(employees: EmployeeOption[], id: number | null) {
  return employees.find((employee) => employee.id === id)?.name ?? "미지정";
}

function maskAccount(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : value;
}

function cardDraft(card?: CompanyCard) {
  return {
    id: card?.id,
    cardCompany: card?.cardCompany ?? "",
    cardName: card?.cardName ?? "",
    cardAlias: card?.cardAlias ?? "",
    cardLast4: card?.cardLast4 ?? "",
    holderName: card?.holderName ?? "",
    creditLimit: card ? String(card.creditLimit) : "",
    status: card?.status ?? ("active" as CompanyCard["status"]),
    issuedDate: card?.issuedDate ?? "",
    expiryMonth: card?.expiryMonth ?? "",
    responsibleEmployeeId: card?.responsibleEmployeeId ? String(card.responsibleEmployeeId) : "",
    memo: card?.memo ?? "",
  };
}

function accountDraft(account?: BankAccount) {
  return {
    id: account?.id,
    bankName: account?.bankName ?? "",
    accountName: account?.accountName ?? "",
    accountAlias: account?.accountAlias ?? "",
    accountNumber: account?.accountNumber ?? "",
    accountType: account?.accountType ?? ("checking" as BankAccount["accountType"]),
    balance: account ? String(account.balance) : "0",
    status: account?.status ?? ("active" as BankAccount["status"]),
    openedDate: account?.openedDate ?? "",
    responsibleEmployeeId: account?.responsibleEmployeeId ? String(account.responsibleEmployeeId) : "",
    purpose: account?.purpose ?? "",
    memo: account?.memo ?? "",
  };
}

function usageDraft(cards: CompanyCard[], employees: EmployeeOption[], usage?: CardUsage) {
  return {
    id: usage?.id,
    evidenceMethod: usage?.evidenceMethod ?? (cards.length ? "corporate-card" : "tax-invoice" as CardUsage["evidenceMethod"]),
    companyCardId: usage?.companyCardId ? String(usage.companyCardId) : String(cards[0]?.id ?? ""),
    transactionDate: usage?.transactionDate ?? localIsoDate(),
    merchant: usage?.merchant ?? "",
    amount: usage ? String(usage.amount) : "",
    requestedAmount: usage ? String(usage.requestedAmount) : "",
    purpose: usage?.purpose ?? "",
    userEmployeeId: usage?.userEmployeeId ? String(usage.userEmployeeId) : String(employees.find((employee) => employee.employmentStatus === "active")?.id ?? ""),
    evidenceStatus: usage?.evidenceStatus ?? ("missing" as CardUsage["evidenceStatus"]),
    dueDate: usage?.dueDate ?? "",
    receiptUrl: usage?.receiptUrl ?? "",
    memo: usage?.memo ?? "",
  };
}

export function CardManagement({ cards, employees, saving, onSave, onDelete }: { cards: CompanyCard[]; employees: EmployeeOption[]; saving: boolean; onSave: SaveHandler; onDelete: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CompanyCard["status"]>("all");
  const [selectedId, setSelectedId] = useState<number | null>(cards[0]?.id ?? null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(cardDraft());
  const visible = useMemo(() => cards.filter((card) => (status === "all" || card.status === status) && (!search || `${card.cardCompany} ${card.cardAlias} ${card.cardName} ${card.cardLast4}`.toLowerCase().includes(search.toLowerCase()))), [cards, search, status]);
  const selected = cards.find((card) => card.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => { if (selectedId && !cards.some((card) => card.id === selectedId)) setSelectedId(cards[0]?.id ?? null); }, [cards, selectedId]);

  function open(card?: CompanyCard) { setForm(cardDraft(card)); setModal(true); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSave({ action: "card", ...form }, form.id ? "PATCH" : "POST")) {
      setModal(false);
    }
  }

  return <>
    <div className="financial-summary">
      <FinancialStat label="전체 카드" value={`${cards.length}장`} note="등록된 법인카드" />
      <FinancialStat label="사용 중" value={`${cards.filter((card) => card.status === "active").length}장`} note="현재 활성 카드" tone="red" />
      <FinancialStat label="총 한도" value={money(cards.filter((card) => card.status === "active").reduce((sum, card) => sum + card.creditLimit, 0))} note="활성 카드 기준" />
    </div>
    <div className="asset-management-layout">
      <section className="workspace asset-list-panel">
        <div className="section-head"><div><h2>법인카드 목록</h2><p>카드를 선택하면 상세 정보와 담당자를 확인할 수 있습니다.</p></div><button className="primary-button compact" onClick={() => open()}>+ 카드 등록</button></div>
        <div className="asset-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="카드사·별칭·끝 4자리 검색" /><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">전체 상태</option><option value="active">사용 중</option><option value="inactive">사용 중지</option></select></div>
        {visible.length ? <div className="table-wrap"><table className="data-table asset-table"><thead><tr><th>카드</th><th>카드번호</th><th>명의자</th><th>담당자</th><th>상태</th></tr></thead><tbody>{visible.map((card) => <tr key={card.id} className={selected?.id === card.id ? "selected-row" : ""} onClick={() => setSelectedId(card.id)}><td><div className="asset-name"><span>{card.cardCompany.slice(0, 1)}</span><div><strong>{card.cardAlias}</strong><small>{card.cardCompany} · {card.cardName || "상품명 미입력"}</small></div></div></td><td>•••• {card.cardLast4}</td><td>{card.holderName || "미입력"}</td><td>{employeeName(employees, card.responsibleEmployeeId)}</td><td><AssetStatus active={card.status === "active"} /></td></tr>)}</tbody></table></div> : <FinancialEmpty text="조건에 맞는 카드가 없습니다." />}
      </section>
      <section className="workspace asset-detail-panel">
        {selected ? <><AssetDetailHead icon={selected.cardCompany.slice(0, 1)} title={`${selected.cardCompany} •••• ${selected.cardLast4}`} subtitle={selected.cardAlias} status={selected.status === "active" ? "사용 중" : "사용 중지"} onEdit={() => open(selected)} /><div className="asset-detail-body"><DetailSection title="카드 정보"><DetailLine label="카드사" value={selected.cardCompany} /><DetailLine label="상품명" value={selected.cardName || "미입력"} /><DetailLine label="명의자" value={selected.holderName || "미입력"} /><DetailLine label="카드 한도" value={money(selected.creditLimit)} /><DetailLine label="발급일" value={date(selected.issuedDate)} /><DetailLine label="유효기간" value={month(selected.expiryMonth)} /></DetailSection><DetailSection title="담당자 정보"><div className="responsible-person"><span>{employeeName(employees, selected.responsibleEmployeeId).slice(-2)}</span><div><strong>{employeeName(employees, selected.responsibleEmployeeId)}</strong><small>증빙 제출 및 카드 관리 담당</small></div></div></DetailSection>{selected.memo && <DetailSection title="메모"><p className="asset-memo">{selected.memo}</p></DetailSection>}<button className="text-button danger asset-delete" onClick={() => onDelete(selected.id)}>카드 삭제</button></div></> : <FinancialEmpty text="등록된 카드가 없습니다. 첫 카드를 등록해주세요." />}
      </section>
    </div>
    {modal && <FinancialModal title={form.id ? "카드 정보 수정" : "법인카드 등록"} description="카드번호 전체가 아닌 끝 4자리만 안전하게 관리합니다." onClose={() => setModal(false)}><form className="modal-form" onSubmit={submit}><div className="form-grid two"><Field label="카드사 *"><input required value={form.cardCompany} onChange={(event) => setForm({ ...form, cardCompany: event.target.value })} placeholder="예: 신한카드" /></Field><Field label="카드 별칭 *"><input required value={form.cardAlias} onChange={(event) => setForm({ ...form, cardAlias: event.target.value })} placeholder="예: 광고비 카드" /></Field></div><div className="form-grid two"><Field label="카드 상품명"><input value={form.cardName} onChange={(event) => setForm({ ...form, cardName: event.target.value })} /></Field><Field label="카드 끝 4자리 *"><input required inputMode="numeric" maxLength={4} pattern="\d{4}" value={form.cardLast4} onChange={(event) => setForm({ ...form, cardLast4: event.target.value.replace(/\D/g, "") })} placeholder="1234" /></Field></div><div className="form-grid two"><Field label="명의자"><input value={form.holderName} onChange={(event) => setForm({ ...form, holderName: event.target.value })} /></Field><Field label="카드 한도"><input required type="number" min="0" value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} /></Field></div><div className="form-grid three"><Field label="상태"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CompanyCard["status"] })}><option value="active">사용 중</option><option value="inactive">사용 중지</option></select></Field><Field label="발급일"><input type="date" value={form.issuedDate} onChange={(event) => setForm({ ...form, issuedDate: event.target.value })} /></Field><Field label="유효기간"><input type="month" value={form.expiryMonth} onChange={(event) => setForm({ ...form, expiryMonth: event.target.value })} /></Field></div><Field label="담당자"><EmployeeSelect employees={employees} value={form.responsibleEmployeeId} onChange={(value) => setForm({ ...form, responsibleEmployeeId: value })} /></Field><Field label="메모"><textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field><FinancialModalActions saving={saving} onCancel={() => setModal(false)} label="카드 저장" /></form></FinancialModal>}
  </>;
}

export function BankAccountManagement({ accounts, employees, saving, onSave, onDelete }: { accounts: BankAccount[]; employees: EmployeeOption[]; saving: boolean; onSave: SaveHandler; onDelete: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(accounts[0]?.id ?? null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(accountDraft());
  const visible = useMemo(() => accounts.filter((account) => !search || `${account.bankName} ${account.accountAlias} ${account.accountName} ${account.accountNumber}`.toLowerCase().includes(search.toLowerCase())), [accounts, search]);
  const selected = accounts.find((account) => account.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => { if (selectedId && !accounts.some((account) => account.id === selectedId)) setSelectedId(accounts[0]?.id ?? null); }, [accounts, selectedId]);

  function open(account?: BankAccount) { setForm(accountDraft(account)); setModal(true); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave({ action: "bankAccount", ...form }, form.id ? "PATCH" : "POST")) setModal(false); }

  return <>
    <div className="financial-summary"><FinancialStat label="등록 통장" value={`${accounts.length}개`} note="회사 명의 계좌" /><FinancialStat label="사용 중" value={`${accounts.filter((account) => account.status === "active").length}개`} note="현재 활성 계좌" tone="red" /><FinancialStat label="통합 잔액" value={money(accounts.filter((account) => account.status === "active").reduce((sum, account) => sum + account.balance, 0))} note="직접 입력한 현재 잔액" /></div>
    <div className="asset-management-layout">
      <section className="workspace asset-list-panel"><div className="section-head"><div><h2>회사 통장 목록</h2><p>운영 목적과 담당자를 계좌별로 관리합니다.</p></div><button className="primary-button compact" onClick={() => open()}>+ 통장 등록</button></div><div className="asset-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="은행·별칭·계좌번호 검색" /></div>{visible.length ? <div className="table-wrap"><table className="data-table asset-table"><thead><tr><th>통장</th><th>계좌번호</th><th>용도</th><th>잔액</th><th>상태</th></tr></thead><tbody>{visible.map((account) => <tr key={account.id} className={selected?.id === account.id ? "selected-row" : ""} onClick={() => setSelectedId(account.id)}><td><div className="asset-name"><span>{account.bankName.slice(0, 1)}</span><div><strong>{account.accountAlias}</strong><small>{account.bankName} · {account.accountName || "예금주 미입력"}</small></div></div></td><td>{maskAccount(account.accountNumber)}</td><td>{account.purpose || "미입력"}</td><td className="money-cell">{money(account.balance)}</td><td><AssetStatus active={account.status === "active"} /></td></tr>)}</tbody></table></div> : <FinancialEmpty text="등록된 통장이 없습니다." />}</section>
      <section className="workspace asset-detail-panel">{selected ? <><AssetDetailHead icon={selected.bankName.slice(0, 1)} title={`${selected.bankName} ${maskAccount(selected.accountNumber)}`} subtitle={selected.accountAlias} status={selected.status === "active" ? "사용 중" : "사용 중지"} onEdit={() => open(selected)} /><div className="asset-detail-body"><DetailSection title="통장 정보"><DetailLine label="은행" value={selected.bankName} /><DetailLine label="예금주" value={selected.accountName || "미입력"} /><DetailLine label="계좌 유형" value={accountTypeLabel(selected.accountType)} /><DetailLine label="현재 잔액" value={money(selected.balance)} /><DetailLine label="운영 용도" value={selected.purpose || "미입력"} /><DetailLine label="개설일" value={date(selected.openedDate)} /></DetailSection><DetailSection title="담당자 정보"><div className="responsible-person"><span>{employeeName(employees, selected.responsibleEmployeeId).slice(-2)}</span><div><strong>{employeeName(employees, selected.responsibleEmployeeId)}</strong><small>통장 관리 및 내역 확인 담당</small></div></div></DetailSection>{selected.memo && <DetailSection title="메모"><p className="asset-memo">{selected.memo}</p></DetailSection>}<button className="text-button danger asset-delete" onClick={() => onDelete(selected.id)}>통장 삭제</button></div></> : <FinancialEmpty text="등록된 통장이 없습니다. 첫 통장을 등록해주세요." />}</section>
    </div>
    {modal && <FinancialModal title={form.id ? "통장 정보 수정" : "회사 통장 등록"} description="계좌 정보와 현재 잔액을 직접 입력해 관리합니다." onClose={() => setModal(false)}><form className="modal-form" onSubmit={submit}><div className="form-grid two"><Field label="은행 *"><input required value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} placeholder="예: 신한은행" /></Field><Field label="통장 별칭 *"><input required value={form.accountAlias} onChange={(event) => setForm({ ...form, accountAlias: event.target.value })} placeholder="예: 운영비 통장" /></Field></div><div className="form-grid two"><Field label="계좌번호 *"><input required value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} /></Field><Field label="예금주"><input value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} /></Field></div><div className="form-grid two"><Field label="계좌 유형"><select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value as BankAccount["accountType"] })}><option value="checking">입출금</option><option value="savings">저축</option><option value="loan">대출</option><option value="other">기타</option></select></Field><Field label="현재 잔액"><input required type="number" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} /></Field></div><div className="form-grid two"><Field label="상태"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as BankAccount["status"] })}><option value="active">사용 중</option><option value="inactive">사용 중지</option></select></Field><Field label="개설일"><input type="date" value={form.openedDate} onChange={(event) => setForm({ ...form, openedDate: event.target.value })} /></Field></div><Field label="운영 용도"><input value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="예: 급여·4대보험 출금" /></Field><Field label="담당자"><EmployeeSelect employees={employees} value={form.responsibleEmployeeId} onChange={(value) => setForm({ ...form, responsibleEmployeeId: value })} /></Field><Field label="메모"><textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field><FinancialModalActions saving={saving} onCancel={() => setModal(false)} label="통장 저장" /></form></FinancialModal>}
  </>;
}

export function CardUsageManagement({ usages, cards, employees, saving, onSave, onDelete }: { usages: CardUsage[]; cards: CompanyCard[]; employees: EmployeeOption[]; saving: boolean; onSave: SaveHandler; onDelete: (id: number) => void }) {
  const [filter, setFilter] = useState<"all" | CardUsage["evidenceStatus"]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(usages[0]?.id ?? null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(usageDraft(cards, employees));
  const visible = useMemo(() => usages.filter((usage) => (filter === "all" || usage.evidenceStatus === filter) && (!search || `${usage.merchant} ${usage.purpose}`.toLowerCase().includes(search.toLowerCase()))), [usages, filter, search]);
  const selected = usages.find((usage) => usage.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => { if (selectedId && !usages.some((usage) => usage.id === selectedId)) setSelectedId(usages[0]?.id ?? null); }, [usages, selectedId]);
  function open(usage?: CardUsage) { setForm(usageDraft(cards, employees, usage)); setModal(true); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave({ action: "cardUsage", ...form }, form.id ? "PATCH" : "POST")) setModal(false); }
  const method = form.evidenceMethod as CardUsage["evidenceMethod"];

  return <>
    <div className="financial-summary evidence-summary"><FinancialStat label="전체 사용 내역" value={`${usages.length}건`} note="등록된 거래" /><FinancialStat label="미제출" value={`${usages.filter((usage) => usage.evidenceStatus === "missing").length}건`} note="증빙 확인 필요" tone="red" /><FinancialStat label="제출" value={`${usages.filter((usage) => usage.evidenceStatus === "submitted").length}건`} note="검토 대기" /><FinancialStat label="확정" value={`${usages.filter((usage) => usage.evidenceStatus === "confirmed").length}건`} note="처리 완료" /></div>
    <div className="asset-management-layout evidence-layout"><section className="workspace asset-list-panel"><div className="section-head"><div><h2>카드 사용 및 증빙</h2><p>사용 내역과 증빙 제출 상태를 한곳에서 관리합니다.</p></div><button className="primary-button compact" onClick={() => open()}>+ 사용 내역 등록</button></div><div className="asset-filters evidence-filters"><div className="segment"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>전체</button><button className={filter === "missing" ? "active" : ""} onClick={() => setFilter("missing")}>미제출</button><button className={filter === "submitted" ? "active" : ""} onClick={() => setFilter("submitted")}>제출</button><button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}>확정</button></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="사용처·용도 검색" /></div>{visible.length ? <div className="table-wrap"><table className="data-table evidence-table"><thead><tr><th>증빙 상태</th><th>용도</th><th>사용처</th><th>거래일</th><th>사용자</th><th>합계 금액</th></tr></thead><tbody>{visible.map((usage) => <tr key={usage.id} className={selected?.id === usage.id ? "selected-row" : ""} onClick={() => setSelectedId(usage.id)}><td><EvidenceStatus status={usage.evidenceStatus} /></td><td><span className="category-badge">{usage.purpose}</span></td><td><strong>{usage.merchant}</strong><small>{evidenceMethodLabel(usage.evidenceMethod)}</small></td><td>{date(usage.transactionDate)}</td><td>{employeeName(employees, usage.userEmployeeId)}</td><td className="money-cell">{money(usage.amount)}</td></tr>)}</tbody></table></div> : <FinancialEmpty text="조건에 맞는 사용 내역이 없습니다." />}</section><section className="workspace asset-detail-panel">{selected ? <><AssetDetailHead icon="✓" title={`${selected.merchant} · ${money(selected.amount)}`} subtitle={`${date(selected.transactionDate)} · ${evidenceMethodLabel(selected.evidenceMethod)}`} status={evidenceStatusLabel(selected.evidenceStatus)} onEdit={() => open(selected)} /><div className="asset-detail-body"><DetailSection title="결제 정보"><DetailLine label="증빙 수단" value={evidenceMethodLabel(selected.evidenceMethod)} /><DetailLine label="사용 카드" value={cards.find((card) => card.id === selected.companyCardId) ? `${cards.find((card) => card.id === selected.companyCardId)?.cardAlias} •••• ${cards.find((card) => card.id === selected.companyCardId)?.cardLast4}` : "해당 없음"} /><DetailLine label="사용처" value={selected.merchant} /><DetailLine label="합계 금액" value={money(selected.amount)} /><DetailLine label="요청 금액" value={money(selected.requestedAmount)} /></DetailSection><DetailSection title="지출 정보"><DetailLine label="용도" value={selected.purpose} /><DetailLine label="사용자" value={employeeName(employees, selected.userEmployeeId)} /><DetailLine label="제출 기한" value={date(selected.dueDate)} />{selected.memo && <p className="asset-memo">{selected.memo}</p>}</DetailSection><DetailSection title="증빙 자료">{selected.receiptUrl ? <a className="receipt-link" href={selected.receiptUrl} target="_blank" rel="noreferrer">증빙 링크 열기 ↗</a> : <p className="asset-memo">등록된 증빙 링크가 없습니다.</p>}</DetailSection><button className="text-button danger asset-delete" onClick={() => onDelete(selected.id)}>사용 내역 삭제</button></div></> : <FinancialEmpty text="등록된 카드 사용 내역이 없습니다." />}</section></div>
    {modal && <FinancialModal wide title={form.id ? "사용 내역 및 증빙 수정" : "카드 사용 및 증빙 등록"} description="결제 정보와 증빙 제출 상태를 직접 기록합니다." onClose={() => setModal(false)}><form className="modal-form" onSubmit={submit}><div className="form-grid two"><Field label="증빙 수단 *"><select value={method} onChange={(event) => setForm({ ...form, evidenceMethod: event.target.value as CardUsage["evidenceMethod"] })}><option value="corporate-card">법인카드</option><option value="tax-invoice">세금계산서</option><option value="cash-receipt">현금영수증</option><option value="other">기타</option></select></Field><Field label="거래일 *"><input required type="date" value={form.transactionDate} onChange={(event) => setForm({ ...form, transactionDate: event.target.value })} /></Field></div>{method === "corporate-card" && <Field label="사용 카드 *"><select required value={form.companyCardId} onChange={(event) => setForm({ ...form, companyCardId: event.target.value })}><option value="">카드 선택</option>{cards.filter((card) => card.status === "active").map((card) => <option key={card.id} value={card.id}>{card.cardAlias} · {card.cardCompany} •••• {card.cardLast4}</option>)}</select></Field>}<Field label="사용처 *"><input required maxLength={50} value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} placeholder="예: 메타 광고" /></Field><div className="form-grid two"><Field label="합계 금액 *"><input required type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label="요청 금액 *"><input required type="number" min="0" value={form.requestedAmount} onChange={(event) => setForm({ ...form, requestedAmount: event.target.value })} /></Field></div><div className="form-grid two"><Field label="용도 *"><input required value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="예: 광고비" /></Field><Field label="사용자"><EmployeeSelect employees={employees} value={form.userEmployeeId} onChange={(value) => setForm({ ...form, userEmployeeId: value })} /></Field></div><div className="form-grid two"><Field label="증빙 상태"><select value={form.evidenceStatus} onChange={(event) => setForm({ ...form, evidenceStatus: event.target.value as CardUsage["evidenceStatus"] })}><option value="missing">미제출</option><option value="submitted">제출</option><option value="confirmed">확정</option></select></Field><Field label="제출 기한"><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></Field></div><Field label="증빙 링크"><input type="url" value={form.receiptUrl} onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })} placeholder="Google Drive 등 영수증 링크" /></Field><Field label="메모"><textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field><FinancialModalActions saving={saving} onCancel={() => setModal(false)} label="사용 내역 저장" /></form></FinancialModal>}
  </>;
}

function FinancialStat({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "red" }) { return <article className={`financial-stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function AssetStatus({ active }: { active: boolean }) { return <span className={`status-badge ${active ? "active" : "retired"}`}>{active ? "사용 중" : "사용 중지"}</span>; }
function EvidenceStatus({ status }: { status: CardUsage["evidenceStatus"] }) { return <span className={`evidence-status ${status}`}>{evidenceStatusLabel(status)}</span>; }
function evidenceStatusLabel(status: CardUsage["evidenceStatus"]) { return { missing: "미제출", submitted: "제출", confirmed: "확정" }[status]; }
function evidenceMethodLabel(method: CardUsage["evidenceMethod"]) { return { "corporate-card": "법인카드", "tax-invoice": "세금계산서", "cash-receipt": "현금영수증", other: "기타" }[method]; }
function accountTypeLabel(type: BankAccount["accountType"]) { return { checking: "입출금", savings: "저축", loan: "대출", other: "기타" }[type]; }
function AssetDetailHead({ icon, title, subtitle, status, onEdit }: { icon: string; title: string; subtitle: string; status: string; onEdit: () => void }) { const tone = status === "사용 중" || status === "확정" ? "active" : status === "제출" ? "leave" : "retired"; return <div className="asset-detail-head"><span className="asset-detail-icon">{icon}</span><div><div><h2>{title}</h2><span className={`status-badge ${tone}`}>{status}</span></div><p>{subtitle}</p></div><button className="secondary-button compact" onClick={onEdit}>정보 수정</button></div>; }
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="asset-detail-section"><h3>{title}</h3>{children}</section>; }
function DetailLine({ label, value }: { label: string; value: string }) { return <div className="asset-detail-line"><span>{label}</span><strong>{value}</strong></div>; }
function EmployeeSelect({ employees, value, onChange }: { employees: EmployeeOption[]; value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">미지정</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function FinancialEmpty({ text }: { text: string }) { return <div className="empty-state"><span>＋</span><p>{text}</p></div>; }
function FinancialModal({ title, description, onClose, wide = false, children }: { title: string; description: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button onClick={onClose} aria-label="닫기">×</button></div>{children}</section></div>; }
function FinancialModalActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>취소</button><button className="primary-button" disabled={saving}>{saving ? "저장 중..." : label}</button></div>; }
