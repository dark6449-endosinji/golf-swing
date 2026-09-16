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

### 2. 로그인(6자리 코드) 설정

**Authentication → Sign In / Providers → Email** 이 켜져 있는지 확인합니다. (기본값으로 켜져 있음)

#### 메일 템플릿을 코드 방식으로 — 이걸 안 하면 로그인이 아예 안 됩니다

**Authentication → Emails → Magic Link** 템플릿을 엽니다.
기본 템플릿은 링크(`{{ .ConfirmationURL }}`)를 보내는데, 앱은 6자리 코드를 입력받으므로
`{{ .Token }}` 을 쓰도록 바꿔야 합니다.

```html
<h2>골프 스윙 기록 로그인</h2>
<p>아래 6자리 코드를 앱에 입력해 주세요.</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
<p>코드는 1시간 동안 쓸 수 있어요. 요청한 적이 없다면 이 메일은 무시하세요.</p>
```

> **왜 링크가 아니라 코드인가**
>
> 링크 방식은 휴대폰에서 무한 반복에 빠집니다. Chrome에서 로그인을 시작해도
> 메일 앱에서 링크를 누르면 **메일 앱의 내장 브라우저**가 열리고 세션이 거기에 생깁니다.
> Chrome은 여전히 로그아웃 상태라 또 메일을 보내게 되죠.
>
> 코드는 눈으로 읽어 옮기므로 브라우저를 건너뛸 일이 없습니다.
> 앱이 `signInWithOtp`에 `emailRedirectTo`를 넘기지 않는 것도 같은 이유입니다
> (넘기면 Supabase가 코드 대신 링크를 보냅니다).

#### URL Configuration (선택)

코드 방식에서는 리다이렉트를 쓰지 않아 필수는 아닙니다.
다만 Site URL은 비워 두지 않는 편이 좋습니다.

| 항목 | 값 |
|---|---|
| Site URL | `https://<프로젝트>.vercel.app` |

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
| 메일에 코드가 아니라 링크가 옴 | Magic Link 템플릿이 아직 `{{ .ConfirmationURL }}` 임. `{{ .Token }}` 으로 바꾸세요 (2단계) |
| `swings 테이블이 없습니다` | `supabase/schema.sql`을 아직 실행하지 않음 |
| `권한이 없습니다` | RLS 정책이 빠짐 → `schema.sql`을 다시 Run |
| `SUPABASE_URL이 설정되지 않았습니다` | Vercel 환경변수 누락. 추가한 뒤 **재배포**해야 반영됩니다 |
| 로그인 메일이 안 옴 | 무료 플랜은 기본 메일 발송 한도가 **시간당 몇 통** 수준입니다. 테스트를 연달아 하면 금방 막힙니다. 현재 한도는 **Authentication → Rate Limits** 에서 볼 수 있고, 계속 쓸 거면 Supabase에 직접 SMTP를 연결하세요 |

---

## 남은 것

- `.netlify/`, `node_modules/` — 이제 안 쓰는 Netlify 흔적과 예전 의존성. 지워도 됩니다.
- `AX/vibe/inventory/` — 골프와 무관한 다른 프로젝트라 `.gitignore`에 넣어 뒀습니다. 따로 옮기는 걸 권합니다.
- `KakaoTalk_*.jpg` — 공개 저장소에 올라가지 않도록 기본 제외해 뒀습니다. 같이 올리려면 `.gitignore`에서 빼세요.
