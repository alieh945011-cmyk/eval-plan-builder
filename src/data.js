// 성취기준 데이터(JSON) 로더 — 과목 파일은 최초 요청 시 1회만 fetch
const BASE = import.meta.env.BASE_URL + 'data/';
const cache = new Map();

export async function loadIndex() {
  return fetchJson('index.json');
}

export async function loadSubject(curriculum, subject) {
  return fetchJson(`${curriculum}/${encodeURIComponent(subject)}.json`);
}

async function fetchJson(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const res = await fetch(BASE + rel);
  if (!res.ok) throw new Error(`데이터 로드 실패: ${rel} (${res.status})`);
  const json = await res.json();
  cache.set(rel, json);
  return json;
}
