# 영단어 암기장

토익 공부용 개인 영단어 암기 웹앱. 빌드 과정 없이 HTML + CSS + 바닐라 JS로 동작합니다.
Firebase(Firestore + 구글 로그인)로 기기 간 동기화하고, GitHub Pages로 배포합니다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 화면과 스타일 |
| `js/app.js` | 앱 동작 (단어장, 학습 모드, TTS, 백업) |
| `js/parse.js` | 텍스트 단어 목록 파싱, 중복 판정 |
| `js/store.js` | 저장소 선택 (인터페이스 설명 포함) |
| `js/store-firebase.js` | Firebase 저장소 |
| `js/store-local.js` | 로컬 저장소 (Firebase 설정 전 테스트용) |
| `config.js` | Firebase 설정값 (비어 있으면 로컬 모드) |
| `sw.js`, `manifest.webmanifest`, `icons/` | 오프라인 실행, 홈 화면 앱 |
| `firestore.rules` | Firestore 보안 규칙 (콘솔에 붙여 넣을 내용) |

---

## 1. Firebase 설정 (처음 한 번, 약 10분)

1. https://console.firebase.google.com 에 구글 계정으로 접속 → **프로젝트 만들기**
   - 이름: 아무거나 (예: `my-vocab`)
   - Google 애널리틱스: **사용 안 함** → 프로젝트 만들기
2. **구글 로그인 켜기**
   - 왼쪽 메뉴 **빌드 → Authentication → 시작하기**
   - **로그인 방법** 탭 → **Google** → 사용 설정 → 지원 이메일 선택 → 저장
   - **설정** 탭 → **승인된 도메인** → **도메인 추가** → `사용자이름.github.io` 입력
3. **데이터베이스 만들기**
   - **빌드 → Firestore Database → 데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)` → **프로덕션 모드**로 시작
   - **규칙** 탭에서 내용을 지우고 `firestore.rules` 파일 내용을 붙여 넣은 뒤 **게시**
4. **웹 앱 등록**
   - 왼쪽 위 톱니바퀴 → **프로젝트 설정** → 아래 **내 앱** → 웹 아이콘(`</>`)
   - 앱 닉네임 입력 → 등록 (Firebase Hosting 체크는 하지 않음)
   - 화면에 나오는 `firebaseConfig = { ... }` 값을 복사해서 `config.js` 의 `null` 자리에 붙여 넣기

## 2. GitHub Pages 배포

> ⚠️ 저장소가 공개라서 **개인 파일(`영단어 리스트.txt` 등)이나 `.claude` 폴더는 올리지 마세요.**
> 단어 데이터는 Firebase에 저장되니 올릴 필요가 없습니다.

1. GitHub 저장소(예: `vocab`) → **Add file → Upload files**
2. 다음 파일과 폴더를 끌어다 놓기:
   `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, `firestore.rules`, `README.md`, `js` 폴더, `icons` 폴더
3. 아래 **Commit changes** 클릭
4. 저장소 **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, 폴더 **/(root)** → Save
5. 1~2분 뒤 `https://사용자이름.github.io/vocab/` 로 접속

## 3. 폰(갤럭시)에서 사용

1. 크롬에서 위 주소 접속 → **Google로 로그인** (처음 한 번)
2. 크롬 메뉴(⋮) → **홈 화면에 추가** 또는 **앱 설치** → 이제 앱처럼 실행

## 4. 업데이트 방법

- **단어 추가/수정/학습 상태 변경**: 아무 기기에서나 하면 **자동으로 다른 기기에 반영**됩니다. 배포할 필요 없음.
- **앱 기능(코드) 수정**: 바뀐 파일을 GitHub에 다시 Upload files로 올리면(같은 이름은 덮어쓰기) 1~2분 뒤 반영. 폰에서는 앱을 껐다 켜면 새 버전이 열립니다.

## 오프라인

- 한 번 접속해 두면 인터넷이 없어도 앱이 열리고 학습·수정이 됩니다.
- 오프라인에서 바꾼 내용은 폰에 저장돼 있다가, 인터넷이 연결되면 자동으로 동기화됩니다.
- 처음 로그인할 때는 인터넷이 필요합니다.

## 컴퓨터에서 로컬로 실행 (테스트용)

```
python -m http.server 8123
```
브라우저에서 http://localhost:8123 접속. (`index.html` 을 더블클릭해서 열면 동작하지 않습니다.)
