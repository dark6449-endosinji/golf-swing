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
      detectSessionInUrl: true,    // 메일 링크로 돌아왔을 때 URL에서 세션을 꺼냄
      // 암시적(implicit) 흐름: 메일 앱의 내장 브라우저처럼
      // 로그인을 요청한 브라우저와 링크를 여는 브라우저가 달라도 성공합니다.
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

export async function sendMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw authError(error);
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
