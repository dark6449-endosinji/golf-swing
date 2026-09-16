-- ============================================================
--  골프 스윙 기록 · Supabase 스키마
--  Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
--  여러 번 실행해도 안전합니다(idempotent).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 스윙 기록 테이블 ----------
create table if not exists public.swings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- 기록마다 붙는 고유 표식. 기기(localStorage)에서 옮겨온 기록은
  -- 원래 id를 그대로 씁니다. 그래서 같은 코드를 두 번 가져와도
  -- 새 행이 생기지 않고 조용히 무시됩니다.
  client_id   text not null default gen_random_uuid()::text,

  played_on   date         not null,
  club        text         not null check (char_length(club) between 1 and 40),
  ball_speed  numeric(5,1) not null check (ball_speed  > 0 and ball_speed  < 1000),
  head_speed  numeric(5,1) not null check (head_speed  > 0 and head_speed  < 1000),
  distance    numeric(6,1) not null check (distance    > 0 and distance    < 10000),

  created_at  timestamptz  not null default now()
);

-- 달력/상세 화면이 항상 "내 기록을 날짜순으로" 읽으므로 그 모양에 맞춘 인덱스
create index if not exists swings_user_played_idx
  on public.swings (user_id, played_on desc, created_at);

-- 같은 사용자 안에서 client_id는 유일 → 가져오기를 반복해도 중복 생성되지 않음.
-- (부분 인덱스가 아니라 전체 인덱스여야 upsert의 ON CONFLICT가 이 인덱스를 잡습니다.)
create unique index if not exists swings_user_client_idx
  on public.swings (user_id, client_id);

-- ---------- 행 단위 보안(RLS) ----------
-- 이게 "사용자별 분리"의 핵심입니다. 켜두면 로그인한 본인 행만 보이고,
-- 남의 user_id로 위조해서 넣는 것도 막힙니다.
alter table public.swings enable row level security;

drop policy if exists swings_select_own on public.swings;
create policy swings_select_own on public.swings
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists swings_insert_own on public.swings;
create policy swings_insert_own on public.swings
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists swings_update_own on public.swings;
create policy swings_update_own on public.swings
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists swings_delete_own on public.swings;
create policy swings_delete_own on public.swings
  for delete to authenticated
  using (auth.uid() = user_id);
