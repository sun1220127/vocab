// 로컬 저장소 (localStorage) — Firebase 설정 전 테스트용 / 오프라인 단독 사용
// 같은 브라우저 안에서만 유지되며 기기 간 동기화는 되지 않습니다.

const KEY = 'vocab.words.v1';

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createLocalStore() {
  let words = load();
  const subs = new Set();

  const notify = () => subs.forEach((cb) => cb(words.slice(), { pending: false, fromCache: false }));
  const commit = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(words));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('store-error', { detail: e }));
    }
    notify();
  };

  // 같은 브라우저의 다른 탭에서 바뀐 내용 반영
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      words = load();
      notify();
    }
  });

  const make = (w) => {
    const now = Date.now();
    return {
      id: newId(),
      english: w.english,
      meaning: w.meaning,
      status: w.status || 'unlearned',
      createdAt: w.createdAt || now,
      updatedAt: now,
    };
  };

  return {
    kind: 'local',
    onAuth(cb) {
      cb({ uid: 'local', displayName: '이 기기', email: null, local: true });
      return () => {};
    },
    async signIn() {},
    async signOut() {},
    subscribe(cb) {
      subs.add(cb);
      cb(words.slice(), { pending: false, fromCache: false });
      return () => subs.delete(cb);
    },
    add(w) {
      const item = make(w);
      words.push(item);
      commit();
      return item.id;
    },
    addMany(list) {
      const base = Date.now();
      list.forEach((w, i) => words.push(make({ ...w, createdAt: base + i })));
      commit();
    },
    update(id, patch) {
      words = words.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w));
      commit();
    },
    remove(id) {
      words = words.filter((w) => w.id !== id);
      commit();
    },
  };
}
