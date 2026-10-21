-- =====================================================================
--  무명의 유산 · 1단계 : 공통 스키마 + 차원의 틈(전투)
--  Supabase 대시보드 > SQL Editor 에 01 → 02 순서로 붙여 넣고 Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 캐릭터(프로필)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  login_id      text unique not null,
  name          text not null default '',
  team          text check (team in ('A','B','C')),
  position      text check (position in ('dealer','supporter','healer')),  -- null = 포지션 없음(전부 사용)
  threads       integer not null default 0 check (threads >= 0),           -- 실타래
  is_admin      boolean not null default false,
  profile_image text,
  bio           text,
  created_at    timestamptz not null default now()
);

-- 관리자 여부 (RLS·함수에서 사용)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- 계정이 만들어지면 프로필 자동 생성 (아이디 = 이메일 앞부분)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, login_id, name)
  values (new.id, split_part(new.email, '@', 1), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);
-- 수정은 전부 서버 함수(admin_update_profile 등)로만 가능

-- ---------------------------------------------------------------------
-- 2. 일정 (메인 달력)
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id        bigint generated always as identity primary key,
  starts_on date not null,
  ends_on   date,
  title     text not null,
  note      text,
  created_at timestamptz not null default now()
);
alter table public.schedules enable row level security;
drop policy if exists schedules_read on public.schedules;
create policy schedules_read on public.schedules
  for select to anon, authenticated using (true);
drop policy if exists schedules_admin on public.schedules;
create policy schedules_admin on public.schedules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. 차원의 틈 (전투)
-- ---------------------------------------------------------------------
create table if not exists public.battles (
  id           bigint generated always as identity primary key,
  room         smallint not null check (room between 1 and 3),
  title        text not null default '',
  status       text not null default 'waiting' check (status in ('waiting','active','finished')),
  round        smallint not null default 0,
  max_rounds   smallint not null default 5,
  winner_party bigint,
  result_note  text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create table if not exists public.battle_parties (
  id         bigint generated always as identity primary key,
  battle_id  bigint not null references public.battles(id) on delete cascade,
  side       smallint not null check (side in (1,2)),
  team       text not null check (team in ('A','B','C')),
  name       text not null default '',
  speed_pool integer not null default 100,       -- 파티 공용 속도 투자 가능치
  unique (battle_id, side)
);

create table if not exists public.battle_members (
  id           bigint generated always as identity primary key,
  battle_id    bigint not null references public.battles(id) on delete cascade,
  party_id     bigint not null references public.battle_parties(id) on delete cascade,
  profile_id   uuid   not null references public.profiles(id) on delete cascade,
  hp           integer not null default 200,
  max_hp       integer not null default 200,
  shield       integer not null default 0,        -- 보호 수치
  shield_until smallint not null default 0,       -- 보호가 유효한 마지막 라운드
  boost        integer not null default 0,        -- 다음 행동에 더해질 증진 수치
  unique (battle_id, profile_id)
);

create table if not exists public.battle_actions (
  id               bigint generated always as identity primary key,
  battle_id        bigint not null references public.battles(id) on delete cascade,
  round            smallint not null,
  member_id        bigint not null references public.battle_members(id) on delete cascade,
  party_id         bigint not null references public.battle_parties(id) on delete cascade,
  speed            integer not null check (speed >= 0),
  action           text not null check (action in ('attack','smash','boost','protect','heal','covenant','none')),
  target_member_id bigint references public.battle_members(id) on delete set null,
  auto             boolean not null default false,  -- 미결정이라 '행동 없음' 처리됨
  created_at       timestamptz not null default now(),
  unique (battle_id, round, member_id)
);

create table if not exists public.battle_logs (
  id         bigint generated always as identity primary key,
  battle_id  bigint not null references public.battles(id) on delete cascade,
  round      smallint not null default 0,
  kind       text not null default 'info',   -- round / act / crit / down / admin / result / info
  message    text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.battle_chats (
  id         bigint generated always as identity primary key,
  battle_id  bigint not null references public.battles(id) on delete cascade,
  party_id   bigint references public.battle_parties(id) on delete cascade, -- null = 전투방 전체
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message    text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists battle_members_battle_idx on public.battle_members(battle_id);
create index if not exists battle_actions_battle_idx on public.battle_actions(battle_id, round);
create index if not exists battle_logs_battle_idx    on public.battle_logs(battle_id, id);
create index if not exists battle_chats_battle_idx   on public.battle_chats(battle_id, id);

-- ---------------------------------------------------------------------
-- 4. 읽기 권한 (쓰기는 전부 서버 함수로만)
-- ---------------------------------------------------------------------
alter table public.battles        enable row level security;
alter table public.battle_parties enable row level security;
alter table public.battle_members enable row level security;
alter table public.battle_actions enable row level security;
alter table public.battle_logs    enable row level security;
alter table public.battle_chats   enable row level security;

drop policy if exists battles_read on public.battles;
create policy battles_read on public.battles for select to authenticated using (true);
drop policy if exists parties_read on public.battle_parties;
create policy parties_read on public.battle_parties for select to authenticated using (true);
drop policy if exists members_read on public.battle_members;
create policy members_read on public.battle_members for select to authenticated using (true);
drop policy if exists logs_read on public.battle_logs;
create policy logs_read on public.battle_logs for select to authenticated using (true);

-- 행동 선택: 같은 파티원 것만 보임. 상대 파티 선택은 라운드가 끝난 뒤에만 공개
drop policy if exists actions_read on public.battle_actions;
create policy actions_read on public.battle_actions for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.battle_members m
             where m.party_id = battle_actions.party_id and m.profile_id = auth.uid())
  or exists (select 1 from public.battles b
             where b.id = battle_actions.battle_id
               and (b.round > battle_actions.round or b.status = 'finished'))
);

-- 채팅: 파티 채팅은 파티원만, 전체 채팅은 해당 전투 참가자만 (관리자는 전부)
drop policy if exists chats_read on public.battle_chats;
create policy chats_read on public.battle_chats for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.battle_members m
             where m.battle_id = battle_chats.battle_id
               and m.profile_id = auth.uid()
               and (battle_chats.party_id is null or m.party_id = battle_chats.party_id))
);

-- ---------------------------------------------------------------------
-- 5. 실시간 갱신 대상
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['battles','battle_parties','battle_members','battle_actions','battle_logs','battle_chats'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;
