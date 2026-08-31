import { useState } from "react";
import type { SignupTokenRecord } from "@dashboard/devices/signupTokens";

const PAGE_SIZE = 5;

export function SignupTokenRecords({ isLoading, records }: { isLoading: boolean; records: SignupTokenRecord[] }) {
  const sorted = records.reduce<SignupTokenRecord[]>(insertNewestFirst, []);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = visible.find((record) => record.tokenId === selectedId) ?? visible[0];
  if (isLoading) return <p>토큰 목록을 불러오는 중</p>;
  if (!selected) return <p>발급된 토큰이 없습니다.</p>;
  return <div className="settings-paged-list">
    <div className="settings-listbox" role="listbox" aria-label="회원가입 토큰 목록">
      {visible.map((record) => <button aria-selected={record.tokenId === selected.tokenId} key={record.tokenId}
        onClick={() => setSelectedId(record.tokenId)} role="option" type="button">
        <strong>{record.label}</strong><span>{record.groupId} · {record.role} · {record.status}</span>
      </button>)}
    </div>
    <article className="settings-selected-detail provisioning-token-panel__record">
      <span>{selected.groupId} · {selected.role}</span><strong>{selected.label}</strong>
      <em>{selected.status} · {selected.usedCount}/{selected.maxUses}</em>
      <small>발급 {new Date(selected.createdAt).toLocaleString()} · 만료 {new Date(selected.expiresAt).toLocaleString()}</small>
    </article>
    <nav className="settings-pagination" aria-label="목록 페이지">
      <button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">이전</button>
      <span>{page + 1} / {pageCount}</span>
      <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} type="button">다음</button>
    </nav>
  </div>;
}

function insertNewestFirst(ordered: SignupTokenRecord[], record: SignupTokenRecord): SignupTokenRecord[] {
  const insertionIndex = ordered.findIndex((candidate) => Date.parse(candidate.createdAt) < Date.parse(record.createdAt));
  if (insertionIndex < 0) return [...ordered, record];
  return [...ordered.slice(0, insertionIndex), record, ...ordered.slice(insertionIndex)];
}
