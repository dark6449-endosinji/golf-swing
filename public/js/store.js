/* ============================================================
 *  store.js — 백엔드와 이야기하는 유일한 곳
 *  (Supabase 인증 + swings 테이블 CRUD)
 *
 *  화면 코드(app.js)는 Supabase를 직접 모릅니다.
 *  여기서 DB의 행(row)을 앱이 쓰던 모양으로 바꿔서 넘겨줍니다.
 *    row : { id, played_on, club, ball_speed, head_speed, distance, created_at }
 *    rec : { id, date,      club, ball,       head,       dist,     createdAt  }
 * ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { loadConfig } from './config.js';

let sb = null;
let session = null;

/* ---------- 초기화 ---------- */
export async function initStore() {
  const cfg = await loadConfig();
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,        // 새로고침해도 로그인 유지
      autoRefreshToken: true,
      // 로그인은 6자리 코드로 하지만, 예전에 받은 링크를 눌렀을 때를 위한 대비책.
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  });

  const { data } = await sb.auth.getSession();
  session = data.session || null;
  return session;
}

/* ---------- 인증 ---------- */
export function currentUser() {
  return session ? session.user : null;
}

export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_event, next) => {
    session = next || null;
    cb(session);
  });
}

/* 로그인 코드(6자리)를 메일로 보냅니다.
   emailRedirectTo를 넘기지 않아야 링크가 아니라 코드가 발송됩니다.
   (Supabase 메일 템플릿에도 {{ .Token }} 이 들어 있어야 합니다.)

   링크 방식은 메일 앱의 내장 브라우저에서 열려 버려서, 정작 로그인을 시작한
   브라우저는 계속 로그아웃 상태로 남는 문제가 있었습니다. 코드는 눈으로 읽어
   옮기므로 브라우저를 건너뛸 일이 없습니다. */
export async function sendLoginCode(email) {
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) throw authError(error);
}

/* 사용자가 입력한 코드를 확인하고 세션을 만듭니다. */
export async function verifyLoginCode(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw verifyError(error);
  session = (data && data.session) || null;
  return session;
}

export async function signOut() {
  await sb.auth.signOut();
  session = null;
}

/* ---------- 기록 읽기 / 쓰기 ---------- */
export async function fetchRecords() {
  const { data, error } = await sb
    .from('swings')
    .select('id, played_on, club, ball_speed, head_speed, distance, created_at')
    .order('played_on', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw dbError(error, '기록을 불러오지 못했습니다.');
  return (data || []).map(toRecord);
}

export async function addRecord(rec) {
  const { data, error } = await sb
    .from('swings')
    .insert({
      user_id: requireUserId(),
      played_on: rec.date,
      club: rec.club,
      ball_speed: rec.ball,
      head_speed: rec.head,
      distance: rec.dist,
    })
    .select('id, played_on, club, ball_speed, head_speed, distance, created_at')
    .single();
  if (error) throw dbError(error, '저장하지 못했습니다.');
  return toRecord(data);
}

export async function removeRecord(id) {
  const { error } = await sb.from('swings').delete().eq('id', id);
  if (error) throw dbError(error, '삭제하지 못했습니다.');
}

export async function removeAllRecords() {
  const { error } = await sb.from('swings').delete().eq('user_id', requireUserId());
  if (error) throw dbError(error, '삭제하지 못했습니다.');
}

/* ---------- 변환 & 에러 ---------- */
function toRecord(row) {
  return {
    id: row.id,
    date: row.played_on,                     // Postgres date → 'YYYY-MM-DD'
    club: row.club,
    ball: Number(row.ball_speed),
    head: Number(row.head_speed),
    dist: Number(row.distance),
    createdAt: Date.parse(row.created_at) || 0,
  };
}

function requireUserId() {
  const u = currentUser();
  if (!u) throw new StoreError('로그인이 풀렸습니다. 다시 로그인해 주세요.', 'NO_SESSION');
  return u.id;
}

export class StoreError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

function dbError(error, fallback) {
  const msg = String((error && error.message) || '');
  if (/JWT|not authenticated|session/i.test(msg)) {
    return new StoreError('로그인이 풀렸습니다. 다시 로그인해 주세요.', 'NO_SESSION');
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return new StoreError('인터넷 연결이 끊겼습니다. 연결을 확인하고 다시 시도해 주세요.', 'OFFLINE');
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return new StoreError('권한이 없습니다. schema.sql의 RLS 정책이 적용됐는지 확인해 주세요.', 'RLS');
  }
  if (/relation .*swings.* does not exist/i.test(msg)) {
    return new StoreError('swings 테이블이 없습니다. supabase/schema.sql을 먼저 실행해 주세요.', 'NO_TABLE');
  }
  return new StoreError(fallback + ' (' + msg + ')', 'DB');
}

function verifyError(error) {
  const msg = String((error && error.message) || '');
  const status = error && error.status;
  const tail = ' (' + (msg || '원인 미상') + (status ? ' / HTTP ' + status : '') + ')';

  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) {
    return new StoreError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.' + tail, 'OFFLINE');
  }
  if (status === 429 || /rate limit|too many/i.test(msg)) {
    return new StoreError('시도가 너무 잦습니다. 잠시 뒤에 다시 해 주세요.' + tail, 'RATE_LIMIT');
  }
  // Supabase는 "틀린 코드"와 "만료된 코드"에 같은 메시지를 줍니다.
  // 둘을 구분할 수 없으므로 양쪽 대처법을 같이 안내합니다.
  if (/expired|invalid|incorrect|not found|token/i.test(msg)) {
    return new StoreError(
      '코드가 맞지 않거나 만료됐습니다. 숫자를 다시 확인하고, 그래도 안 되면 새 코드를 받아 주세요.' + tail,
      'BAD_CODE'
    );
  }
  return new StoreError('로그인하지 못했습니다.' + tail, 'VERIFY');
}

function authError(error) {
  const msg = String((error && error.message) || '');
  const status = error && error.status;
  const tail = ' (' + (msg || '원인 미상') + (status ? ' / HTTP ' + status : '') + ')';

  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) {
    return new StoreError('서버에 연결하지 못했습니다. 인터넷 연결과 Supabase 주소 설정을 확인해 주세요.' + tail, 'OFFLINE');
  }
  if (status === 429 || /rate limit|too many requests|for security purposes|after \d+ seconds/i.test(msg)) {
    return new StoreError('메일을 너무 자주 요청했습니다. 잠시 뒤에 다시 시도해 주세요.' + tail, 'RATE_LIMIT');
  }
  if (/signups? (not allowed|disabled)|signup is disabled/i.test(msg)) {
    return new StoreError(
      '이 Supabase 프로젝트에서 신규 가입이 꺼져 있습니다. Authentication → Sign In / Providers 에서 "Allow new users to sign up"을 켜 주세요.' + tail,
      'SIGNUP_DISABLED'
    );
  }
  if (/error sending|smtp|confirmation email|failed to send/i.test(msg)) {
    return new StoreError(
      'Supabase가 메일을 보내지 못했습니다. 무료 플랜 발송 한도이거나 SMTP 설정 문제일 수 있습니다.' + tail,
      'SMTP'
    );
  }
  if (/invalid[_ ]?email|email[_ ]?address[_ ]?invalid|email.*not.*(valid|allowed)/i.test(msg)) {
    return new StoreError('이메일 주소를 Supabase가 거부했습니다.' + tail, 'BAD_EMAIL');
  }
  return new StoreError('로그인 메일을 보내지 못했습니다.' + tail, 'AUTH');
}
