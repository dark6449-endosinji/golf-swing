/* Supabase 접속 정보를 가져옵니다.
 *
 * 1) /api/config  — Vercel 서버리스 함수. 배포 환경의 정상 경로입니다.
 *                   값은 Vercel 환경변수(SUPABASE_URL / SUPABASE_ANON_KEY)에서 옵니다.
 * 2) js/config.local.js — 로컬에서 정적 서버만 띄워 볼 때 쓰는 파일.
 *                   git에 올리지 않으며, 없으면 조용히 건너뜁니다.
 */

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export async function loadConfig() {
  let apiError = null;

  try {
    return await fromApi();
  } catch (e) {
    // /api/config 자체가 없는 경우에만 로컬 파일로 넘어갑니다.
    // (환경변수 누락 같은 진짜 설정 문제는 그대로 알려야 하니까요.)
    if (!(e instanceof ConfigError) || e.code !== 'NO_API') throw e;
    apiError = e;
  }

  const local = await fromLocalFile();
  if (local) return local;
  throw apiError;
}

async function fromApi() {
  let res;
  try {
    res = await fetch('/api/config', { cache: 'no-store' });
  } catch (e) {
    throw new ConfigError('NETWORK', '설정을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }

  if (res.status === 404) {
    throw new ConfigError(
      'NO_API',
      '/api/config 를 찾을 수 없습니다. `npm run dev`(vercel dev)로 실행하거나 Vercel에 배포한 주소로 접속해 주세요.'
    );
  }
  if (!res.ok) {
    let msg = '설정을 불러오지 못했습니다.';
    try {
      const body = await res.json();
      if (body && body.message) msg = body.message;
    } catch (e) { /* JSON이 아니면 기본 메시지 */ }
    throw new ConfigError('SERVER', msg);
  }

  const cfg = await res.json();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new ConfigError('SERVER', 'Supabase 설정값이 비어 있습니다.');
  }
  return cfg;
}

async function fromLocalFile() {
  try {
    const mod = await import('./config.local.js');
    const cfg = mod.default || mod;
    if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) return cfg;
  } catch (e) { /* 파일이 없으면 정상 */ }
  return null;
}
