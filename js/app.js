import { createStore } from './store.js';
import { normKey, clean, parseText, dedupe } from './parse.js';

const APP_VERSION = '1.0.0';

// ---------- 유틸 ----------
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pref = {
  get(k, d) {
    try {
      const v = localStorage.getItem('vocab.pref.' + k);
      return v === null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('vocab.pref.' + k, v);
    } catch {}
  },
};

let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 상태 ----------
let store;
let user = null;
let words = [];
let byId = new Map();
let syncMeta = { pending: false, fromCache: false };
let unsubWords = null;
let view = 'home';
let listTab = 'unlearned';
let sortMode = pref.get('sort', 'recent'); // recent | abc
let session = null; // { mode, items:[{id, english, meaning}], i, revealed, finished }

// ---------- 시작 ----------
window.addEventListener('store-error', (e) => {
  const err = e.detail || {};
  if (err.code === 'permission-denied') toast('권한 오류: Firestore 보안 규칙을 확인해 주세요.', 4000);
  else toast('저장 중 오류가 발생했어요.\n' + (err.message || err), 4000);
});

boot();

async function boot() {
  $('app-version').textContent = `버전 ${APP_VERSION}`;
  try {
    store = await createStore();
  } catch (e) {
    console.error(e);
    $('view-loading').innerHTML =
      '<p>앱을 불러오지 못했어요.</p><p class="muted small">처음 실행은 인터넷 연결이 필요합니다. 연결 후 새로고침해 주세요.</p>';
    return;
  }
  bindUI();
  setupTTS();
  store.onAuth(onAuth);
  window.addEventListener('online', renderSync);
  window.addEventListener('offline', renderSync);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 등록 실패', e));
  }
}

function onAuth(u) {
  if (unsubWords) {
    unsubWords();
    unsubWords = null;
  }
  user = u;
  $('view-loading').hidden = true;
  if (!u) {
    words = [];
    byId = new Map();
    showLogin();
    return;
  }
  $('view-login').hidden = true;
  $('tabbar').hidden = false;
  unsubWords = store.subscribe((list, meta) => {
    words = list;
    byId = new Map(list.map((w) => [w.id, w]));
    syncMeta = meta;
    renderAll();
  });
  renderAccount();
  showView(view);
}

function showLogin() {
  ['view-home', 'view-list', 'view-settings'].forEach((id) => ($(id).hidden = true));
  $('tabbar').hidden = true;
  $('view-login').hidden = false;
  $('page-title').textContent = '영단어';
  renderSync();
}

// ---------- 화면 전환 ----------
const TITLES = { home: '학습', list: '단어장', settings: '설정' };

function showView(v) {
  view = v;
  for (const k of Object.keys(TITLES)) $('view-' + k).hidden = k !== v;
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $('page-title').textContent = TITLES[v];
  window.scrollTo(0, 0);
}

function renderAll() {
  renderHome();
  renderList();
  renderSync();
  if (session) renderStudyButtons();
}

function renderSync() {
  const el = $('sync');
  el.className = 'sync';
  if (!store) return;
  if (store.kind === 'local') {
    el.textContent = '로컬 모드';
    return;
  }
  if (!navigator.onLine) {
    el.textContent = '오프라인 (나중에 동기화)';
    el.classList.add('off');
  } else if (syncMeta.pending) {
    el.textContent = '동기화 중…';
    el.classList.add('wait');
  } else if (syncMeta.fromCache) {
    el.textContent = '연결 중…';
    el.classList.add('wait');
  } else {
    el.textContent = '동기화됨';
    el.classList.add('ok');
  }
}

function renderAccount() {
  if (store.kind === 'local') {
    $('account-info').innerHTML =
      '<b>로컬 모드</b> — 단어가 이 브라우저에만 저장되고 다른 기기와 동기화되지 않아요.<br><span class="muted">config.js 에 Firebase 설정을 넣으면 동기화가 켜집니다.</span>';
    $('btn-logout').hidden = true;
  } else {
    $('account-info').innerHTML = `<b>${esc(user.email || user.displayName || '')}</b> 계정으로 로그인됨<br><span class="muted">같은 계정으로 로그인한 기기끼리 자동 동기화돼요.</span>`;
    $('btn-logout').hidden = false;
  }
}

// ---------- 홈 ----------
const countOf = (status) => words.filter((w) => w.status === status).length;

function selectedMode() {
  return document.querySelector('input[name=mode]:checked').value;
}

function renderHome() {
  const u = countOf('unlearned');
  const l = countOf('learned');
  $('count-unlearned').textContent = u;
  $('count-learned').textContent = l;
  $('pick-unlearned').textContent = u + '개';
  $('pick-learned').textContent = l + '개';
  const n = selectedMode() === 'unlearned' ? u : l;
  $('btn-start').disabled = n === 0;
  $('start-hint').textContent =
    n === 0
      ? words.length === 0
        ? '단어장 탭에서 단어를 먼저 추가해 주세요.'
        : '이 목록에는 단어가 없어요.'
      : `${n}개 단어를 랜덤 순서로 한 바퀴 학습합니다.`;
}

// ---------- 단어장 ----------
function renderList() {
  $('tab-count-unlearned').textContent = countOf('unlearned');
  $('tab-count-learned').textContent = countOf('learned');
  document.querySelectorAll('#list-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === listTab));
  $('btn-sort').textContent = sortMode === 'abc' ? 'ABC순' : '최근순';

  const q = $('search').value.trim().toLowerCase();
  let list = words.filter((w) => w.status === listTab);
  if (q) list = list.filter((w) => w.english.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
  if (sortMode === 'abc') list.sort((a, b) => a.english.localeCompare(b.english, 'en', { sensitivity: 'base' }));
  else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const ul = $('word-list');
  if (!list.length) {
    ul.innerHTML = `<li class="empty" style="box-shadow:none;background:none;display:block">${
      q ? '검색 결과가 없어요.' : listTab === 'unlearned' ? '미학습 단어가 없어요.' : '학습 완료한 단어가 없어요.'
    }</li>`;
    return;
  }
  const moveLabel = listTab === 'learned' ? '↩ 미학습' : '✓ 완료';
  ul.innerHTML = list
    .map(
      (w) => `<li data-id="${esc(w.id)}">
        <div class="txt"><div class="en">${esc(w.english)}</div><div class="ko">${esc(w.meaning)}</div></div>
        <button class="pill" data-act="move" title="${listTab === 'learned' ? '미학습으로 되돌리기' : '학습 완료로 이동'}">${moveLabel}</button>
        <button class="icon-btn" data-act="edit" aria-label="수정">✏️</button>
        <button class="icon-btn" data-act="del" aria-label="삭제">🗑️</button>
      </li>`
    )
    .join('');
}

/** 영문 중복 검사. exceptId 는 수정 중인 자기 자신 */
function findDuplicate(english, exceptId) {
  const k = normKey(english);
  return words.find((w) => w.id !== exceptId && normKey(w.english) === k);
}

function addWord(e) {
  e.preventDefault();
  const english = clean($('add-en').value);
  const meaning = clean($('add-ko').value);
  if (!english || !meaning) return;
  const dup = findDuplicate(english);
  if (dup) {
    toast(`이미 있는 단어예요: ${dup.english} (${dup.status === 'learned' ? '학습 완료' : '미학습'})`, 3000);
    $('add-en').select();
    return;
  }
  store.add({ english, meaning, status: 'unlearned' });
  $('add-en').value = '';
  $('add-ko').value = '';
  $('add-en').focus();
  toast(listTab === 'learned' ? `"${english}" 미학습에 추가됨` : `"${english}" 추가됨`);
}

function onListClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('li').dataset.id;
  const w = byId.get(id);
  if (!w) return;
  const act = btn.dataset.act;
  if (act === 'move') {
    const to = w.status === 'learned' ? 'unlearned' : 'learned';
    store.update(id, { status: to });
    toast(`"${w.english}" → ${to === 'learned' ? '학습 완료' : '미학습'}`);
  } else if (act === 'del') {
    if (confirm(`"${w.english}" 단어를 삭제할까요?`)) {
      store.remove(id);
      toast('삭제했어요');
    }
  } else if (act === 'edit') {
    openEdit(w);
  }
}

function openEdit(w) {
  openModal(`
    <h3>단어 수정</h3>
    <form id="edit-form" autocomplete="off">
      <label class="field"><span>영어</span><input type="text" id="edit-en" value="${esc(w.english)}" required autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>뜻</span><input type="text" id="edit-ko" value="${esc(w.meaning)}" required></label>
      <p class="small" id="edit-err" style="color:var(--danger);margin:0 0 10px"></p>
      <div class="row">
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>
    </form>`);
  $('edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const english = clean($('edit-en').value);
    const meaning = clean($('edit-ko').value);
    if (!english || !meaning) return;
    const dup = findDuplicate(english, w.id);
    if (dup) {
      $('edit-err').textContent = `이미 있는 단어예요: ${dup.english}`;
      return;
    }
    store.update(w.id, { english, meaning });
    closeModal();
    toast('수정했어요');
  });
}

// ---------- 모달 ----------
function openModal(html) {
  $('sheet').innerHTML = html;
  $('modal').hidden = false;
}
function closeModal() {
  $('modal').hidden = true;
  $('sheet').innerHTML = '';
}

// ---------- 학습 모드 ----------
function startStudy(mode) {
  const pool = words.filter((w) => w.status === mode);
  if (!pool.length) {
    toast('학습할 단어가 없어요.');
    return;
  }
  const wasOpen = !!session;
  session = {
    mode,
    items: shuffle(pool).map((w) => ({ id: w.id, english: w.english, meaning: w.meaning })),
    i: 0,
    revealed: false,
    finished: false,
  };
  $('study').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!wasOpen) history.pushState({ study: true }, '');
  $('mode-label').textContent = mode === 'unlearned' ? '미학습 단어' : '학습 완료 단어';
  const memo = mode === 'unlearned';
  $('btn-memo').hidden = !memo;
  $('memo-spacer').hidden = memo;
  renderCard();
}

function quitStudy() {
  // 뒤로 가기(history) 로 처리해서 안드로이드 뒤로 버튼과 동작을 맞춤
  if (history.state && history.state.study) history.back();
  else closeStudy();
}

function closeStudy() {
  session = null;
  $('study').hidden = true;
  document.body.style.overflow = '';
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  renderAll();
}

function renderCard() {
  const s = session;
  const total = s.items.length;
  $('card-view').hidden = s.finished;
  $('done-view').hidden = !s.finished;
  if (s.finished) {
    $('progress').textContent = `${total} / ${total}`;
    $('bar').style.width = '100%';
    let summary = `${total}개 단어를 모두 봤어요.`;
    if (s.mode === 'unlearned') {
      const memorized = s.items.filter((it) => (byId.get(it.id) || {}).status === 'learned').length;
      summary += `\n이번 바퀴에서 암기 완료: ${memorized}개`;
    }
    $('done-summary').innerText = summary;
    return;
  }
  const it = s.items[s.i];
  $('progress').textContent = `${s.i + 1} / ${total}`;
  $('bar').style.width = `${((s.i + 1) / total) * 100}%`;
  $('card-en').textContent = it.english;
  s.revealed = false;
  renderMeaning();
  $('btn-prev').disabled = s.i === 0;
  renderStudyButtons();
}

function renderMeaning() {
  const el = $('card-ko');
  const it = session.items[session.i];
  el.classList.toggle('shown', session.revealed);
  el.textContent = session.revealed ? it.meaning : '탭해서 뜻 보기';
}

function renderStudyButtons() {
  if (!session || session.finished || session.mode !== 'unlearned') return;
  const it = session.items[session.i];
  const live = byId.get(it.id);
  const btn = $('btn-memo');
  if (!live) {
    btn.disabled = true;
    btn.classList.remove('done');
    btn.textContent = '삭제된 단어';
    return;
  }
  btn.disabled = false;
  const done = live.status === 'learned';
  btn.classList.toggle('done', done);
  btn.textContent = done ? '완료됨 ✓' : '암기 완료';
  btn.title = done ? '다시 누르면 취소돼요' : '';
}

function toggleMemo() {
  const it = session.items[session.i];
  const live = byId.get(it.id);
  if (!live) return;
  const to = live.status === 'learned' ? 'unlearned' : 'learned';
  store.update(it.id, { status: to });
}

function reveal() {
  if (!session || session.finished) return;
  session.revealed = !session.revealed;
  renderMeaning();
}

// dir: +1 다음, -1 이전
function go(dir) {
  const s = session;
  if (!s) return;
  if (s.finished) {
    if (dir < 0) {
      s.finished = false;
      s.i = s.items.length - 1;
      renderCard();
    }
    return;
  }
  if (dir < 0 && s.i === 0) {
    bounce();
    return;
  }
  const flash = $('flash');
  flash.classList.add('anim');
  flash.style.transform = `translateX(${dir > 0 ? -110 : 110}%)`;
  flash.style.opacity = '0';
  setTimeout(() => {
    if (!session) return;
    if (dir > 0 && s.i === s.items.length - 1) {
      s.finished = true;
      resetFlash();
      renderCard();
      return;
    }
    s.i += dir;
    renderCard();
    flash.classList.remove('anim');
    flash.style.transform = `translateX(${dir > 0 ? 110 : -110}%)`;
    void flash.offsetWidth; // 리플로우 강제
    flash.classList.add('anim');
    flash.style.transform = 'translateX(0)';
    flash.style.opacity = '1';
  }, 160);
}

function resetFlash() {
  const flash = $('flash');
  flash.classList.remove('anim');
  flash.style.transform = '';
  flash.style.opacity = '';
}

function bounce() {
  const flash = $('flash');
  flash.classList.add('anim');
  flash.style.transform = 'translateX(30px)';
  setTimeout(() => (flash.style.transform = 'translateX(0)'), 150);
}

// 스와이프 (터치 + 마우스 드래그)
function setupSwipe() {
  const flash = $('flash');
  let sx = 0, sy = 0, dx = 0, active = false, moved = false;

  flash.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    dx = 0;
    flash.classList.remove('anim');
  });
  flash.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      moved = true;
      try { flash.setPointerCapture(e.pointerId); } catch {}
    }
    if (moved) flash.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
  });
  const end = () => {
    if (!active) return;
    active = false;
    if (!moved) return;
    if (Math.abs(dx) > 60) {
      go(dx < 0 ? 1 : -1); // 오른쪽→왼쪽(음수) = 다음
    } else {
      flash.classList.add('anim');
      flash.style.transform = 'translateX(0)';
    }
  };
  flash.addEventListener('pointerup', end);
  flash.addEventListener('pointercancel', end);
  // 드래그 직후의 클릭(뜻 열기) 무시
  flash.addEventListener('click', (e) => {
    if (moved) {
      e.stopPropagation();
      e.preventDefault();
      moved = false;
    }
  }, true);
}

// ---------- TTS ----------
const tts = { supported: 'speechSynthesis' in window, voice: null, loaded: false };

function setupTTS() {
  if (!tts.supported) {
    $('btn-tts').hidden = true;
    return;
  }
  const pick = () => {
    const vs = speechSynthesis.getVoices();
    tts.loaded = vs.length > 0;
    const en = vs.filter((v) => /^en[-_]/i.test(v.lang) || v.lang === 'en');
    tts.voice =
      en.find((v) => /en[-_]US/i.test(v.lang) && /google/i.test(v.name)) ||
      en.find((v) => /en[-_]US/i.test(v.lang)) ||
      en[0] ||
      null;
    // 음성 목록을 받았는데 영어 음성이 없으면 버튼 숨김
    $('btn-tts').hidden = tts.loaded && !tts.voice;
  };
  pick();
  speechSynthesis.addEventListener?.('voiceschanged', pick);
}

function speak(text) {
  if (!tts.supported) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tts.voice ? tts.voice.lang : 'en-US';
  if (tts.voice) u.voice = tts.voice;
  u.rate = 0.9;
  u.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') toast('발음을 재생할 수 없어요. 기기에 영어 음성이 있는지 확인해 주세요.', 3000);
  };
  speechSynthesis.speak(u);
}

// ---------- 백업 ----------
function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

function exportJSON() {
  const data = {
    app: 'vocab',
    version: 1,
    exportedAt: new Date().toISOString(),
    words: words
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((w) => ({ english: w.english, meaning: w.meaning, status: w.status })),
  };
  download(`영단어-백업-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function exportTXT() {
  const lines = words
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((w) => `${w.english} - ${w.meaning}`);
  download(`영단어-${today()}.txt`, '﻿' + lines.join('\r\n'), 'text/plain;charset=utf-8');
}

async function importFile(file) {
  const text = await file.text();
  const trimmed = text.replace(/^﻿/, '').trim();
  if (file.name.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      toast('JSON 파일을 읽을 수 없어요.');
      return;
    }
    const arr = Array.isArray(data) ? data : data.words;
    if (!Array.isArray(arr)) {
      toast('단어 목록을 찾을 수 없는 JSON이에요.');
      return;
    }
    const valid = arr
      .filter((w) => w && typeof w.english === 'string' && typeof w.meaning === 'string')
      .map((w) => ({
        english: clean(w.english),
        meaning: clean(w.meaning),
        status: w.status === 'learned' ? 'learned' : 'unlearned',
      }))
      .filter((w) => w.english && w.meaning);
    const invalid = arr.length - valid.length;
    commitImport(valid, invalid);
  } else {
    reviewText(text);
  }
}

/** 텍스트 → 자동 인식 + 애매한 줄 확인 화면 */
function reviewText(text) {
  const parsed = parseText(text);
  if (!parsed.length) {
    toast('추가할 줄이 없어요.');
    return;
  }
  const ok = parsed.filter((p) => p.ok);
  const unsure = parsed.filter((p) => !p.ok);
  if (!unsure.length) {
    commitImport(ok.map((p) => ({ english: p.english, meaning: p.meaning, status: 'unlearned' })), 0);
    return;
  }
  openModal(`
    <h3>확인이 필요한 줄 ${unsure.length}개</h3>
    <p class="small muted" style="margin-top:0">자동 인식: ${ok.length}줄. 아래 줄은 구분이 애매해요. 영어/뜻을 고친 뒤 <b>포함</b>을 체크하면 함께 추가됩니다.</p>
    <div id="review-list">
      ${unsure
        .map(
          (p, i) => `<div class="review-item" data-i="${i}">
            <div class="raw">${esc(p.raw.trim())}</div>
            <div class="reason">⚠ ${esc(p.reason)}</div>
            <div class="row">
              <input type="text" class="r-en" value="${esc(p.english)}" placeholder="영어" autocapitalize="off" spellcheck="false">
              <input type="text" class="r-ko" value="${esc(p.meaning)}" placeholder="뜻">
            </div>
            <label class="inc"><input type="checkbox" class="r-inc" ${p.english && p.meaning ? 'checked' : ''}> 포함</label>
          </div>`
        )
        .join('')}
    </div>
    <div class="row" style="position:sticky;bottom:0;background:var(--surface);padding-top:8px">
      <button class="btn" data-close>취소</button>
      <button class="btn primary" id="btn-review-ok">추가하기</button>
    </div>`);
  $('btn-review-ok').addEventListener('click', () => {
    const extra = [];
    let excluded = 0;
    document.querySelectorAll('#review-list .review-item').forEach((el) => {
      const en = clean(el.querySelector('.r-en').value);
      const ko = clean(el.querySelector('.r-ko').value);
      if (el.querySelector('.r-inc').checked && en && ko) extra.push({ english: en, meaning: ko, status: 'unlearned' });
      else excluded++;
    });
    closeModal();
    const all = [...ok.map((p) => ({ english: p.english, meaning: p.meaning, status: 'unlearned' })), ...extra];
    commitImport(all, excluded);
  });
}

/** 중복 제거 후 추가하고 결과 알림 */
function commitImport(candidates, excluded) {
  const { add, dupInFile, dupExisting } = dedupe(candidates, words);
  if (add.length) store.addMany(add);
  const lines = [`✅ ${add.length}개 추가`];
  if (dupExisting.length) lines.push(`이미 있는 단어 ${dupExisting.length}개 건너뜀`);
  if (dupInFile.length) lines.push(`가져온 내용 안의 중복 ${dupInFile.length}개 건너뜀 (첫 번째만 남김)`);
  if (excluded) lines.push(`제외/잘못된 항목 ${excluded}개`);
  const detail = [];
  if (dupExisting.length) detail.push('이미 있음: ' + dupExisting.map((w) => w.english).join(', '));
  if (dupInFile.length) detail.push('중복: ' + dupInFile.map((w) => w.english).join(', '));
  openModal(`
    <h3>가져오기 결과</h3>
    <p style="white-space:pre-line">${esc(lines.join('\n'))}</p>
    ${detail.length ? `<p class="small muted" style="white-space:pre-line">${esc(detail.join('\n'))}</p>` : ''}
    <button class="btn primary block" data-close>확인</button>`);
  if (add.length) $('paste-text').value = '';
}

// ---------- 이벤트 연결 ----------
function bindUI() {
  $('btn-login').addEventListener('click', async () => {
    $('login-error').textContent = '';
    try {
      await store.signIn();
    } catch (e) {
      console.error(e);
      $('login-error').textContent = '로그인 실패: ' + (e.code || e.message);
    }
  });
  $('btn-logout').addEventListener('click', () => {
    if (confirm('로그아웃할까요? 다시 로그인하면 단어장이 그대로 있어요.')) store.signOut();
  });

  document.querySelectorAll('#tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  // 홈
  const savedMode = pref.get('mode', 'unlearned');
  const r = document.querySelector(`input[name=mode][value="${savedMode}"]`);
  if (r) r.checked = true;
  document.querySelectorAll('input[name=mode]').forEach((el) =>
    el.addEventListener('change', () => {
      pref.set('mode', selectedMode());
      renderHome();
    })
  );
  $('btn-start').addEventListener('click', () => startStudy(selectedMode()));

  // 단어장
  $('add-form').addEventListener('submit', addWord);
  $('list-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    listTab = b.dataset.tab;
    renderList();
  });
  $('search').addEventListener('input', renderList);
  $('btn-sort').addEventListener('click', () => {
    sortMode = sortMode === 'abc' ? 'recent' : 'abc';
    pref.set('sort', sortMode);
    renderList();
  });
  $('word-list').addEventListener('click', onListClick);

  // 설정 / 백업
  $('btn-export-json').addEventListener('click', exportJSON);
  $('btn-export-txt').addEventListener('click', exportTXT);
  $('btn-import-file').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importFile(f);
  });
  $('btn-parse').addEventListener('click', () => {
    const t = $('paste-text').value;
    if (!t.trim()) {
      toast('붙여 넣은 내용이 없어요.');
      return;
    }
    reviewText(t);
  });

  // 모달
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal') || e.target.closest('[data-close]')) closeModal();
  });

  // 학습
  $('btn-quit').addEventListener('click', quitStudy);
  $('btn-home').addEventListener('click', quitStudy);
  $('btn-again').addEventListener('click', () => startStudy(session.mode));
  $('btn-back-last').addEventListener('click', () => go(-1));
  $('btn-prev').addEventListener('click', () => go(-1));
  $('btn-next').addEventListener('click', () => go(1));
  $('btn-memo').addEventListener('click', toggleMemo);
  $('card-ko').addEventListener('click', reveal);
  $('btn-tts').addEventListener('click', (e) => {
    e.stopPropagation();
    if (session && !session.finished) speak(session.items[session.i].english);
  });
  setupSwipe();

  window.addEventListener('popstate', () => {
    if (session) closeStudy();
  });

  document.addEventListener('keydown', (e) => {
    if (!$('modal').hidden) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (!session) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      reveal();
    } else if (e.key === 'Escape') quitStudy();
    else return;
  });
}
