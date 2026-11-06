// Firebase 저장소 (Firestore + 구글 로그인)
// 데이터 위치: users/{로그인한 사용자 uid}/words/{단어 id}
// - 오프라인 캐시(IndexedDB)가 켜져 있어서 인터넷이 없어도 읽기/쓰기가 되고,
//   다시 연결되면 자동으로 서버와 동기화됩니다.
// - 같은 단어를 두 기기에서 고치면 나중에 서버에 도착한 쪽이 남습니다.

const V = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;

const { initializeApp } = await import(`${BASE}/firebase-app.js`);
const {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut: fbSignOut,
} = await import(`${BASE}/firebase-auth.js`);
const {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} = await import(`${BASE}/firebase-firestore.js`);

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  let uid = null;
  const col = () => collection(db, 'users', uid, 'words');
  const fail = (e) => {
    console.error(e);
    window.dispatchEvent(new CustomEvent('store-error', { detail: e }));
  };

  // 쓰기는 기다리지 않습니다(await 안 함). 오프라인이면 서버 응답이 올 때까지
  // 기다리게 되기 때문입니다. 화면은 onSnapshot 이 로컬 변경을 즉시 알려 줘서 바로 바뀝니다.
  return {
    kind: 'firebase',
    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => {
        uid = u ? u.uid : null;
        cb(u ? { uid: u.uid, displayName: u.displayName, email: u.email } : null);
      });
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          return signInWithRedirect(auth, provider);
        }
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
        throw e;
      }
    },
    signOut() {
      return fbSignOut(auth);
    },
    subscribe(cb) {
      return onSnapshot(
        col(),
        { includeMetadataChanges: true },
        (snap) => {
          const words = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          cb(words, { pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache });
        },
        fail
      );
    },
    add(w) {
      const ref = doc(col());
      const now = Date.now();
      setDoc(ref, {
        english: w.english,
        meaning: w.meaning,
        status: w.status || 'unlearned',
        createdAt: now,
        updatedAt: now,
      }).catch(fail);
      return ref.id;
    },
    addMany(list) {
      const base = Date.now();
      // Firestore 배치는 한 번에 최대 500개
      for (let i = 0; i < list.length; i += 400) {
        const batch = writeBatch(db);
        list.slice(i, i + 400).forEach((w, j) => {
          batch.set(doc(col()), {
            english: w.english,
            meaning: w.meaning,
            status: w.status || 'unlearned',
            createdAt: base + i + j,
            updatedAt: base,
          });
        });
        batch.commit().catch(fail);
      }
    },
    update(id, patch) {
      updateDoc(doc(col(), id), { ...patch, updatedAt: Date.now() }).catch(fail);
    },
    remove(id) {
      deleteDoc(doc(col(), id)).catch(fail);
    },
  };
}
