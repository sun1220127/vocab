// 텍스트 단어 목록 파싱 + 중복 판정 유틸

/** 중복 비교용 키: 앞뒤 공백 제거, 연속 공백 하나로, 소문자 */
export const normKey = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** 저장용 정리: 앞뒤 공백 제거, 연속 공백 하나로 */
export const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const LATIN = /[A-Za-z]/;
// 영어 표제어로 인정하는 문자: 알파벳으로 시작, 알파벳/숫자/공백/'’.-/()~&!? 허용
const EN_OK = /^[A-Za-z][A-Za-z0-9 '’.\-\/()~&!?]*$/;
const SEPS = '-–—,:=|';

/**
 * 한 줄을 { english, meaning, ok, reason } 으로 변환.
 * ok=false 이면 "확인 필요" 줄 (english/meaning 은 추측값).
 * 빈 줄은 null.
 */
export function parseLine(raw) {
  let line = String(raw).replace(/^﻿/, '').trim();
  if (!line) return null;
  // 앞의 번호/글머리표 제거: "1. ", "12) ", "• ", "- "
  line = line.replace(/^(\d+[.)]|[•·*\-])\s+/, '').trim();
  if (!line) return null;

  // 1) 탭 구분
  if (line.includes('\t')) {
    const parts = line.split('\t').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return judge(parts[0], parts.slice(1).join(', '), raw);
  }

  // 2) 구분 기호(- , : = | 등) 중, 왼쪽이 영어로만 이루어진 첫 위치
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!SEPS.includes(c)) continue;
    // well-known 처럼 영문자 사이의 하이픈은 단어의 일부
    if (c === '-' && LATIN.test(line[i - 1] || '') && LATIN.test(line[i + 1] || '')) continue;
    const en = line.slice(0, i).trim();
    const ko = line.slice(i + 1).replace(/^[\s\-–—,:=|]+/, '').trim();
    if (en && ko && EN_OK.test(en)) return judge(en, ko, raw);
  }

  // 3) 구분 기호 없이 "영어 한글" 형태
  const m = line.match(HANGUL);
  if (m && m.index > 0) {
    const en = line.slice(0, m.index).replace(/[\s\-–—,:=|]+$/, '').trim();
    const ko = line.slice(m.index).trim();
    if (EN_OK.test(en)) return { english: en, meaning: ko, raw, ok: false, reason: '구분 기호가 없음' };
  }

  // 4) "한글 - 영어" 처럼 순서가 반대인 경우
  const rev = line.match(/^(.+?)\s*[\t\-–—,:=|]\s*([A-Za-z][A-Za-z0-9 '’.\-\/()~&!?]*)$/);
  if (rev && HANGUL.test(rev[1])) {
    return { english: rev[2].trim(), meaning: rev[1].trim(), raw, ok: false, reason: '한글과 영어 순서가 반대' };
  }

  if (!HANGUL.test(line)) return { english: line, meaning: '', raw, ok: false, reason: '뜻(한글)을 찾지 못함' };
  return { english: '', meaning: line, raw, ok: false, reason: '영어 단어를 찾지 못함' };
}

function judge(en, ko, raw) {
  en = clean(en);
  ko = clean(ko);
  if (!EN_OK.test(en)) return { english: en, meaning: ko, raw, ok: false, reason: '영어 부분이 이상함' };
  if (!HANGUL.test(ko)) return { english: en, meaning: ko, raw, ok: false, reason: '뜻에 한글이 없음' };
  return { english: en, meaning: ko, raw, ok: true };
}

/** 여러 줄 텍스트 → 파싱 결과 배열 (빈 줄 제외) */
export function parseText(text) {
  return String(text)
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean);
}

/**
 * 새 단어 후보에서 중복을 걸러 냄.
 * - 후보 안에서 같은 영문이 여러 번 나오면 첫 번째만 남김
 * - 이미 단어장에 있는 영문은 건너뜀
 */
export function dedupe(candidates, existing) {
  const existingKeys = new Set(existing.map((w) => normKey(w.english)));
  const seen = new Set();
  const add = [];
  const dupInFile = [];
  const dupExisting = [];
  for (const c of candidates) {
    const k = normKey(c.english);
    if (!k) continue;
    if (seen.has(k)) dupInFile.push(c);
    else if (existingKeys.has(k)) {
      dupExisting.push(c);
      seen.add(k);
    } else {
      add.push(c);
      seen.add(k);
    }
  }
  return { add, dupInFile, dupExisting };
}
