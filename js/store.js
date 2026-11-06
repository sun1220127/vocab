// 저장소 선택 모듈
// ---------------------------------------------------------------
// 앱은 이 파일의 createStore()만 사용합니다. 저장소를 바꾸고 싶으면
// 아래 인터페이스를 구현한 새 모듈을 만들고 여기서 골라 주면 됩니다.
//
// Store 인터페이스
//   kind: 'local' | 'firebase'
//   onAuth(cb)            로그인 상태 변화 구독. cb(user | null). 해제 함수 반환
//   signIn() / signOut()  로그인 / 로그아웃 (로컬 모드는 아무것도 안 함)
//   subscribe(cb)         단어 목록 구독. cb(words, meta). 해제 함수 반환
//                         words: [{ id, english, meaning, status, createdAt, updatedAt }]
//                         meta : { pending: 서버 반영 대기 중인 변경 있음, fromCache: 캐시 데이터 }
//   add(word)             { english, meaning, status } 추가, 새 id 반환
//   addMany(words)        여러 개 한 번에 추가
//   update(id, patch)     일부 필드 수정
//   remove(id)            삭제
//
// 오류는 window 의 'store-error' 이벤트로 알립니다.

import { firebaseConfig } from '../config.js';

export async function createStore() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    const m = await import('./store-firebase.js');
    return m.createFirebaseStore(firebaseConfig);
  }
  const m = await import('./store-local.js');
  return m.createLocalStore();
}
