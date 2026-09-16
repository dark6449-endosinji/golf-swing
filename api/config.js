/**
 * 브라우저에 넘겨줄 Supabase 공개 설정.
 *
 * anon key는 원래 브라우저에 노출되는 값이라 비밀이 아닙니다.
 * (실제 보호는 schema.sql의 RLS 정책이 합니다.)
 * 그래도 소스에 박아두지 않고 Vercel 환경변수로 빼두면
 * 프로젝트를 새로 만들거나 키를 교체할 때 코드를 안 고쳐도 됩니다.
 */
export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({
      error: 'missing_env',
      message: 'Vercel 환경변수 SUPABASE_URL / SUPABASE_ANON_KEY 가 설정되지 않았습니다.',
    });
    return;
  }

  // 값이 바뀌는 일이 거의 없으므로 CDN에서 잠시 캐시.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
