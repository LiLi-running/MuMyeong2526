# 무명의 유산 · 1단계 (공통 레이아웃 + 차원의 틈)

화면은 **GitHub Pages**, 로그인·데이터·전투 판정은 **Supabase**(무료)에서 동작합니다.
전투의 주사위, 크리티컬, 속도 검증은 전부 서버 함수가 처리하므로 화면 코드를 고쳐도 결과를 조작할 수 없습니다.

---

## 1. Supabase 준비 (약 10분)

1. https://supabase.com 가입 → **New project**
   - Region: **Northeast Asia (Seoul)**
   - Database password는 따로 잘 보관하세요.
2. 왼쪽 메뉴 **SQL Editor** → New query
   - `supabase/01_schema.sql` 전체를 붙여 넣고 **Run**
   - 이어서 `supabase/02_battle_functions.sql` 전체를 붙여 넣고 **Run**
3. **Authentication → Sign In / Providers**
   - 아래쪽 공급자 목록에서 **Email**을 눌러 **Enable email provider** 켜기 → Save
     (꺼져 있으면 아이디·비밀번호 로그인이 안 됩니다. 패널 안의 다른 항목은 기본값 그대로)
   - 페이지 위쪽 **User Signups** 영역에서:
     - **Allow new users to sign up** 끄기 ← 중요! 아무나 계정을 만들지 못하게 합니다.
     - **Confirm email** 끄기 (가상 이메일을 쓰기 때문)
   - Save
4. **Project Settings → API** (또는 API Keys)
   - `Project URL` 과 `anon public`(또는 `publishable`) 키를 복사해 `js/config.js` 에 붙여 넣기
   - `service_role` / `secret` 키는 **절대** 넣지 마세요.

## 2. 관리자 계정 만들기

1. **Authentication → Users → Add user → Create new user**
   - Email: `admin@nameless.legacy` (아이디가 `admin`이 됩니다)
   - Password 입력, **Auto Confirm User** 체크
2. SQL Editor에서 실행:
   ```sql
   update public.profiles set is_admin = true where login_id = 'admin';
   ```

참여자 계정도 같은 방법(`아이디@nameless.legacy`)으로 만들면 됩니다.
40명이라면 대시보드에서 하나씩 추가하는 것이 가장 간단합니다. (일괄 생성 기능은 다음 단계에서 추가 가능)

## 3. GitHub Pages에 올리기

1. GitHub에서 새 저장소 만들기 (예: `nameless-legacy`)
2. 이 폴더의 파일을 전부 업로드 (**Add file → Upload files**, 폴더 구조 그대로)
3. 저장소 **Settings → Pages → Branch: main / (root) → Save**
4. 1~2분 뒤 `https://<깃허브아이디>.github.io/nameless-legacy/` 에서 열립니다.

나중에 주소를 바꾸려면 같은 화면의 **Custom domain**에 도메인을 입력하고, 도메인 DNS에 CNAME을 추가하면 됩니다.
(`legacy.endofverdant.xyz` 같은 서브도메인도 가능합니다.)

## 4. 테스트 순서

1. `admin` 으로 로그인 → 주소창에 `admin.html` 직접 입력
2. **캐릭터** 탭: 테스트 계정들의 이름 · 팀 · 포지션 지정 후 저장
3. **전투** 탭: 방 선택 → 양쪽 팀과 파티원 체크 → 전투방 만들기 → 시작
4. 다른 브라우저(또는 시크릿 창)로 참가자 계정에 로그인 → **차원의 틈** → 입장
5. 모두 결정하면 자동으로 라운드가 진행됩니다. 누군가 자리를 비우면 관리자가 **라운드 강제 진행**.

---

## 파일 구조

```
index.html              메인 (달력 · 로그인 · 바로가기)
battle.html             차원의 틈 (방 목록 / ?id=번호 로 전투방)
admin.html              관리자 페이지 (메뉴에 링크 없음)
css/style.css           디자인 (#e5e7e4 / #3c3f42)
js/config.js            ★ Supabase 주소·키, 트위터·신청서 링크
js/supabase.js          로그인 · 공통 함수
js/layout.js            왼쪽 고정 메뉴 (메뉴 항목 수정은 여기서)
js/battle.js            전투 화면
js/admin.js             관리자 화면
supabase/01_schema.sql  테이블 · 읽기 권한
supabase/02_battle_functions.sql  전투 판정 · 관리자 함수
```

## 관리자 페이지 보안

`admin.html` 주소를 누가 알아내도 괜찮습니다. 관리자 기능은 모두 서버 함수에서 `is_admin`을 확인하므로, 일반 계정은 화면만 보이고 어떤 데이터도 바꿀 수 없습니다.
그래도 주소를 숨기고 싶다면 `admin.html` 파일 이름을 아무거나(예: `keeper-7x2.html`)로 바꾸면 됩니다.

---

## 규칙 해석 (원문에서 정해지지 않아 임의로 정한 부분)

바꾸고 싶은 항목은 알려 주시면 SQL 한두 줄로 조정할 수 있습니다.

| 항목 | 현재 동작 |
|---|---|
| 속도 투자 | 파티원 결정 순서대로 남은 속도에서 차감. 0도 가능. 남은 속도를 넘으면 서버가 거부 |
| 결정 변경 | 한 번 결정하면 그 라운드에는 변경 불가 |
| 동일 속도 | 무작위 순서 |
| 강타 | 11~20 + 10 = 21~30 피해 |
| 크리티컬 | 모든 행동(증진 포함) 10%, 수치 × 1.5 (소수점 버림) |
| 증진 | 대상의 **다음 행동**에 +10. 이번 라운드에 이미 행동했다면 다음 라운드로 넘어감. 크리티컬 적용 후 더함 |
| 보호 | 다음 1회 피격을 11~20 상쇄 후 소멸. 이번 라운드에 맞지 않으면 다음 라운드 끝까지 유지 |
| 치유 | 최대 체력 200을 넘지 않음. 쓰러진 캐릭터는 회복 불가 |
| 쓰러진 대상 | 행동 순서가 왔을 때 대상이 이미 쓰러졌으면 그 행동은 무효 |
| 미결정 | 관리자가 강제 진행하면 '행동 없음(속도 0)' |
| 승패 | ① 쓰러진 파티원이 없는 쪽 우선 → ② 같으면 체력 감소량이 적은 쪽 → ③ 그래도 같으면 무승부 |
| 성약 스킬 | 선택은 가능, 효과는 로그만 남김 (추후 `02_battle_functions.sql`의 `TODO` 위치에 추가) |
| 파티 인원 | 정식 규칙은 2~3명이지만, 테스트를 위해 1명부터 허용 |
| 관전 | 로그인한 누구나 전투 로그·체력 관전 가능. 채팅은 참가자만. 관리자는 양쪽 파티 채팅까지 열람 |

## 다음 단계

- 재난대비성약자양성소: 출석(06~20시, 서버 시간 기준) · 운세 · 상점 · 선물 · 과제(별 클릭 게임 + 순위표, 기간 과제 제출)
- 커뮤니티 안내: 관리자가 글 · 표 · 그림을 편집하는 페이지
- 캐릭터: 명단 · 내 캐릭터 · 비밀번호 변경, 관리자 비밀번호 초기화
