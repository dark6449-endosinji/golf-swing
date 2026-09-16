# 골프 스윙 기록

볼스피드 · 헤드스피드 · 거리를 넣으면 스매시팩터를 계산해, 날짜와 클럽별로 모아 보는 연습 기록장.
음성 입력(한국어)도 지원합니다.

**기록은 Supabase에 계정별로 저장됩니다.** 휴대폰에서 적은 것이 PC에서도 그대로 보이고,
브라우저 데이터를 지워도 사라지지 않습니다.

---

## 폴더 구조

```
public/              Vercel이 그대로 서빙하는 정적 파일
  index.html           화면 뼈대
  styles.css           전체 스타일
  js/app.js            화면·입력·음성 (백엔드를 직접 모름)
  js/store.js          Supabase 인증 + swings 테이블 CRUD  ← 백엔드와 얘기하는 유일한 곳
  js/config.js         Supabase 접속 정보 로딩
api/config.js        Vercel 서버리스 함수. 환경변수의 Supabase 공개 설정을 내려줌
supabase/schema.sql  테이블 + 인덱스 + RLS 정책
vercel.json          정적 루트(public) / 보안 헤더
legacy/              localStorage만 쓰던 예전 단일 파일 버전 (참고용, 지워도 됨)
```

---

## 설치 순서

### 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **New project** (리전은 `Northeast Asia (Seoul)` 권장)
2. **SQL Editor** → `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**
3. 두 값을 복사해 둡니다. **서로 다른 화면에 있습니다.**

   | 값 | 위치 | 쓰일 곳 |
   |---|---|---|
   | Project URL | **Settings → Data API** 의 맨 위 (`https://xxxx.supabase.co`) | `SUPABASE_URL` |
   | Publishable key | **Settings → API Keys** 의 `sb_publishable_...` | `SUPABASE_ANON_KEY` |

   상단의 초록색 **Connect** 버튼을 누르면 둘을 한 번에 볼 수도 있습니다.

> **키 이름이 달라졌습니다.** 예전 `anon` `public` key가 지금은 **publishable key**(`sb_publishable_...`)입니다.
> 권한도 동일하고 supabase-js는 그대로 받아들이므로 바꿔 쓸 것 없이 그대로 넣으시면 됩니다.
> ("Legacy anon, service_role API keys" 탭의 예전 anon key도 아직은 동작합니다.)
>
> `sb_secret_...` (Secret key)는 **절대 쓰지 마세요.** RLS를 무시하는 관리자 키라
> 브라우저에 나가면 누구나 모든 사람의 기록을 읽고 지울 수 있게 됩니다.
>
> publishable key는 반대로 브라우저에 노출되는 것이 정상입니다.
> 실제 보호는 `schema.sql`의 **RLS 정책**이 하므로, 2번을 건너뛰면 안 됩니다.

### 2. 로그인(매직링크) 설정

**Authentication → Sign In / Providers → Email** 이 켜져 있는지 확인합니다. (기본값으로 켜져 있음)

**Authentication → URL Configuration**

| 항목 | 값 |
|---|---|
| Site URL | `https://<프로젝트>.vercel.app` |
| Redirect URLs | `https://<프로젝트>.vercel.app/**` 와 `http://localhost:3000/**` |

Vercel 주소는 3~4단계에서 정해지므로, 배포한 뒤에 돌아와서 채워도 됩니다.
**여기를 안 채우면 메일 링크를 눌러도 로그인이 되지 않습니다.**

### 3. GitHub에 올리기

```bash
git init
git add .
git commit -m "골프 스윙 기록: Supabase 계정별 저장으로 전환"
git branch -M main
git remote add origin https://github.com/<계정>/golf-swing-log.git
git push -u origin main
```

### 4. Vercel에 배포

1. [vercel.com](https://vercel.com) → **Add New → Project** → 방금 만든 GitHub 저장소 선택
2. **Framework Preset**: `Other` / **Output Directory**: `public`
3. **Environment Variables** 에 두 개를 추가 (Production·Preview·Development 전부 체크)

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | 1단계에서 복사한 Project URL |
   | `SUPABASE_ANON_KEY` | 1단계에서 복사한 publishable key (`sb_publishable_...`) |

4. **Deploy**
5. 배포 주소가 나오면 **2단계로 돌아가 Site URL / Redirect URLs를 채웁니다**

### 5. 확인

배포 주소를 열면 로그인 화면이 뜹니다. 이메일을 넣고 → 메일의 링크를 누르면 → 달력이 보입니다.
기록을 하나 넣은 뒤 Supabase 대시보드의 **Table Editor → swings** 에 행이 쌓이는지 보면 확실합니다.

---

## 기존 기록은 어떻게 되나요

예전 버전을 쓰던 기기에서 **처음 로그인할 때, 그 기기의 localStorage 기록이 자동으로 계정에 올라갑니다.**
원본은 지우지 않으니 잘못돼도 잃을 게 없습니다. 같은 계정으로 다시 로그인해도 두 번 올라가지 않습니다.

다른 기기에 남은 기록은 **데이터 관리 → 코드로 가져오기** 에 예전 백업 코드를 붙여넣으면 합쳐집니다.
같은 코드를 여러 번 넣어도 중복되지 않습니다.

---

## 로컬에서 실행

```bash
npm run dev
```

`vercel dev`를 띄웁니다. 처음이면 `vercel link`로 프로젝트를 연결하라고 안내가 나오고,
연결하면 Vercel의 환경변수를 그대로 받아 `/api/config`까지 동작합니다.

Vercel CLI 없이 정적 서버만 띄우고 싶다면 `public/js/config.local.js`를 만들어 두세요. (git에 올라가지 않음)

```js
export default {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
};
```

---

## 막히기 쉬운 곳

| 증상 | 원인 |
|---|---|
| 메일 링크를 눌러도 로그인 화면 그대로 | Supabase **Redirect URLs**에 배포 주소가 없음 (2단계) |
| `swings 테이블이 없습니다` | `supabase/schema.sql`을 아직 실행하지 않음 |
| `권한이 없습니다` | RLS 정책이 빠짐 → `schema.sql`을 다시 Run |
| `SUPABASE_URL이 설정되지 않았습니다` | Vercel 환경변수 누락. 추가한 뒤 **재배포**해야 반영됩니다 |
| 로그인 메일이 안 옴 | 무료 플랜은 기본 메일 발송 한도가 **시간당 몇 통** 수준입니다. 테스트를 연달아 하면 금방 막힙니다. 현재 한도는 **Authentication → Rate Limits** 에서 볼 수 있고, 계속 쓸 거면 Supabase에 직접 SMTP를 연결하세요 |

---

## 남은 것

- `legacy/index-localStorage.html` — 예전 단일 파일 버전. 필요 없으면 지우세요.
- `.netlify/`, `node_modules/` — 이제 안 쓰는 Netlify 흔적과 예전 의존성. 지워도 됩니다.
- `AX/vibe/inventory/` — 골프와 무관한 다른 프로젝트라 `.gitignore`에 넣어 뒀습니다. 따로 옮기는 걸 권합니다.
- `KakaoTalk_*.jpg` — 공개 저장소에 올라가지 않도록 기본 제외해 뒀습니다. 같이 올리려면 `.gitignore`에서 빼세요.
