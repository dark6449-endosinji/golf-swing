/**
 * 브라우저에 넘겨줄 Supabase 공개 설정.
 *
 * anon(publishable) key는 원래 브라우저에 노출되는 값이라 비밀이 아닙니다.
 * (실제 보호는 schema.sql의 RLS 정책이 합니다.)
 * 그래도 소스에 박아두지 않고 Vercel 환경변수로 빼두면
 * 프로젝트를 새로 만들거나 키를 교체할 때 코드를 안 고쳐도 됩니다.
 */
export default function handler(req, res) {
  const rawUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

  if (!rawUrl || !supabaseAnonKey) {
    res.status(500).json({
      error: 'missing_env',
      message: 'Vercel 환경변수 SUPABASE_URL / SUPABASE_ANON_KEY 가 설정되지 않았습니다.',
    });
    return;
  }

  // 붙여넣기 실수를 여기서 흡수합니다.
  // 끝 슬래시("...supabase.co/")나 경로("...supabase.co/rest/v1")가 붙어 있으면
  // 인증 요청 경로가 "//auth/v1/otp" 처럼 깨져서 Supabase가 404를 돌려줍니다.
  const supabaseUrl = normalizeUrl(rawUrl);
  if (!supabaseUrl) {
    res.status(500).json({
      error: 'bad_url',
      message:
        'SUPABASE_URL 형식이 올바르지 않습니다: "' + rawUrl + '"' +
        ' — https://<프로젝트>.supabase.co 형태여야 합니다.',
    });
    return;
  }

  // 값이 바뀌는 일이 거의 없으므로 CDN에서 잠시 캐시.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).json({ supabaseUrl, supabaseAnonKey });
}

/** 경로·끝 슬래시·빠진 스킴을 정리해 오리진만 남깁니다. 실패하면 null. */
function normalizeUrl(value) {
  let v = value.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    // 'not a url' 같은 값이 통과하지 않도록 최소한 도메인 모양은 갖췄는지 확인
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u.origin;
  } catch (e) {
    return null;
  }
}
