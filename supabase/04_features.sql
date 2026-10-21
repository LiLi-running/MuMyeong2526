-- =====================================================================
--  무명의 유산 · 2단계 : 실타래 · 출석 · 운세 · 상점 · 과제 · 안내글 · 캐릭터
--  01 → 02 → 03 다음에 실행하세요. (여러 번 실행해도 안전합니다)
--  이어서 05_storage.sql 도 실행하세요.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 공통
-- ---------------------------------------------------------------------
-- 한국 시간 (서버 시계 기준. 사용자의 컴퓨터 시계는 믿지 않음)
create or replace function public.kst_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Asia/Seoul') $$;
create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

alter table public.profiles add column if not exists quote text;          -- 명단 한마디
alter table public.profiles add column if not exists sort_order integer not null default 0;

create or replace function public._display_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name, ''), login_id) from profiles where id = p_id
$$;

-- ---------------------------------------------------------------------
-- 1. 실타래 장부 — 모든 증감은 여기를 거쳐 기록됩니다
-- ---------------------------------------------------------------------
create table if not exists public.thread_logs (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta      integer not null,
  balance    integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists thread_logs_profile_idx on public.thread_logs(profile_id, id desc);

create or replace function public._add_threads(p_profile uuid, p_delta integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_bal integer;
begin
  select threads into v_bal from profiles where id = p_profile for update;
  if not found then raise exception '캐릭터를 찾을 수 없습니다.'; end if;
  if v_bal + p_delta < 0 then
    raise exception '실타래가 부족합니다. (보유 %개, 필요 %개)', v_bal, -p_delta;
  end if;
  update profiles set threads = threads + p_delta where id = p_profile returning threads into v_bal;
  insert into thread_logs (profile_id, delta, balance, reason) values (p_profile, p_delta, v_bal, p_reason);
  return v_bal;
end $$;

-- ---------------------------------------------------------------------
-- 2. 출석 — 매일 06:00 ~ 20:00 (한국 시간), 실타래 10
-- ---------------------------------------------------------------------
create table if not exists public.attendance (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);

create or replace function public.attend() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := kst_now();
  v_bal integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if v_now::time < time '06:00' or v_now::time > time '20:00' then
    raise exception '출석은 오전 6시부터 오후 8시까지 할 수 있습니다. (현재 %)', to_char(v_now, 'HH24:MI');
  end if;
  insert into attendance (profile_id, day) values (auth.uid(), v_now::date) on conflict do nothing;
  if not found then raise exception '오늘은 이미 출석했습니다.'; end if;
  v_bal := _add_threads(auth.uid(), 10, '출석');
  return jsonb_build_object('threads', v_bal, 'gained', 10, 'day', v_now::date);
end $$;

-- ---------------------------------------------------------------------
-- 3. 운세 — 하루 1번, 실타래 0~5
-- ---------------------------------------------------------------------
create table if not exists public.fortunes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  grade      smallint not null check (grade between 0 and 5),
  grade_name text not null,
  star       text not null,
  message    text not null,
  threads    integer not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);

create or replace function public.draw_fortune() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day   date := kst_today();
  v_f     fortunes%rowtype;
  v_r     double precision := random();
  v_grade integer;
  v_bal   integer;
  names   text[] := array['흐린 하늘', '옅은 별빛', '고요한 별', '맑은 밤', '빛나는 성좌', '별의 축복'];
  stars   text[] := array['시리우스','베가','알타이르','데네브','폴라리스','카펠라','리겔','베텔게우스',
                          '안타레스','스피카','아크투루스','레굴루스','카스토르','폴룩스','알데바란','프로키온',
                          '포말하우트','미라','알골','카노푸스'];
  msgs    text[][] := array[
    array['구름이 별을 가렸습니다. 오늘은 무리하지 말고 쉬어 가세요.',
          '별의 흐름이 잠시 멈춰 있습니다. 서두를수록 실이 엉킵니다.',
          '어두운 하늘도 지나갑니다. 내일의 별을 기다려 보세요.'],
    array['희미하지만 분명한 빛이 있습니다. 작은 일부터 차근차근.',
          '멀리서 별 하나가 당신을 비추고 있습니다. 혼자가 아닙니다.',
          '흐릿한 별빛이 길을 알려 줍니다. 익숙한 길로 가세요.'],
    array['고요한 별이 머리 위에 떠 있습니다. 평온한 하루가 될 것입니다.',
          '별의 흐름이 잔잔합니다. 오늘 시작한 일은 오래 이어집니다.',
          '조용한 밤하늘처럼, 말보다 행동이 빛나는 날입니다.'],
    array['맑은 밤, 별이 또렷합니다. 망설이던 일을 시작하기 좋은 날.',
          '별과 별 사이에 실이 이어집니다. 뜻밖의 인연을 만날지도.',
          '하늘이 열려 있습니다. 오늘의 선택은 좋은 쪽으로 흐릅니다.'],
    array['성좌가 빛을 냅니다. 동료와 함께라면 무엇이든 해낼 수 있습니다.',
          '별들이 한 방향을 가리킵니다. 믿는 대로 나아가세요.',
          '빛나는 성좌가 당신의 이름을 부릅니다. 주목받는 하루.'],
    array['별이 쏟아집니다. 오늘 하늘은 온전히 당신의 편입니다.',
          '모든 별의 흐름이 당신에게로 모입니다. 대길(大吉).',
          '잊힌 별마저 당신을 위해 빛납니다. 무엇을 해도 좋은 날.']
  ];
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_f from fortunes where profile_id = auth.uid() and day = v_day;
  if found then
    return to_jsonb(v_f) || jsonb_build_object('already', true);
  end if;

  v_grade := case when v_r < 0.10 then 0 when v_r < 0.30 then 1 when v_r < 0.55 then 2
                  when v_r < 0.77 then 3 when v_r < 0.92 then 4 else 5 end;

  insert into fortunes (profile_id, day, grade, grade_name, star, message, threads)
  values (auth.uid(), v_day, v_grade, names[v_grade + 1],
          stars[1 + floor(random() * array_length(stars, 1))::int],
          msgs[v_grade + 1][1 + floor(random() * 3)::int],
          v_grade)
  returning * into v_f;

  if v_grade > 0 then v_bal := _add_threads(auth.uid(), v_grade, '운세'); end if;
  return to_jsonb(v_f) || jsonb_build_object('already', false);
end $$;

-- ---------------------------------------------------------------------
-- 4. 상점 · 보유 아이템 · 선물
-- ---------------------------------------------------------------------
create table if not exists public.shop_items (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text not null default '',
  price       integer not null check (price >= 0),
  image_url   text,
  stock       integer check (stock >= 0),         -- null = 무제한
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.inventory (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id    bigint not null references public.shop_items(id) on delete cascade,
  qty        integer not null check (qty > 0),
  primary key (profile_id, item_id)
);

create table if not exists public.gifts (
  id           bigint generated always as identity primary key,
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile   uuid not null references public.profiles(id) on delete cascade,
  item_id      bigint not null references public.shop_items(id) on delete cascade,
  qty          integer not null,
  message      text,
  created_at   timestamptz not null default now()
);

create or replace function public._give_item(p_to uuid, p_item bigint, p_qty integer)
returns void language sql security definer set search_path = public as $$
  insert into inventory (profile_id, item_id, qty) values (p_to, p_item, p_qty)
  on conflict (profile_id, item_id) do update set qty = inventory.qty + excluded.qty
$$;

-- 구매 (p_to 를 지정하면 그 캐릭터에게 선물로 보냄)
create or replace function public.buy_item(p_item bigint, p_qty integer default 1, p_to uuid default null, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_i    shop_items%rowtype;
  v_to   uuid;
  v_gift boolean;
  v_bal  integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_qty is null or p_qty not between 1 and 99 then raise exception '수량은 1~99개입니다.'; end if;

  select * into v_i from shop_items where id = p_item for update;
  if not found or not v_i.active then raise exception '판매 중인 아이템이 아닙니다.'; end if;
  if v_i.stock is not null and v_i.stock < p_qty then
    raise exception '재고가 부족합니다. (남은 수량 %개)', v_i.stock;
  end if;

  v_to := coalesce(p_to, auth.uid());
  v_gift := v_to <> auth.uid();
  if v_gift and not exists (select 1 from profiles where id = v_to) then
    raise exception '받을 캐릭터를 찾을 수 없습니다.';
  end if;

  v_bal := _add_threads(auth.uid(), -(v_i.price * p_qty),
             format('구매 · %s ×%s', v_i.name, p_qty)
             || case when v_gift then format(' → %s에게 선물', _display_name(v_to)) else '' end);

  if v_i.stock is not null then update shop_items set stock = stock - p_qty where id = p_item; end if;
  perform _give_item(v_to, p_item, p_qty);

  if v_gift then
    insert into gifts (from_profile, to_profile, item_id, qty, message)
    values (auth.uid(), v_to, p_item, p_qty, nullif(left(btrim(coalesce(p_message, '')), 200), ''));
  end if;
  return jsonb_build_object('threads', v_bal);
end $$;

-- 보유 아이템 선물
create or replace function public.gift_item(p_item bigint, p_to uuid, p_qty integer default 1, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_have integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_to is null or p_to = auth.uid() then raise exception '선물할 다른 캐릭터를 선택하세요.'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception '받을 캐릭터를 찾을 수 없습니다.'; end if;
  if p_qty is null or p_qty < 1 then raise exception '수량을 확인하세요.'; end if;

  select qty into v_have from inventory where profile_id = auth.uid() and item_id = p_item for update;
  if coalesce(v_have, 0) < p_qty then raise exception '보유 수량이 부족합니다. (보유 %개)', coalesce(v_have, 0); end if;

  if v_have = p_qty then
    delete from inventory where profile_id = auth.uid() and item_id = p_item;
  else
    update inventory set qty = qty - p_qty where profile_id = auth.uid() and item_id = p_item;
  end if;
  perform _give_item(p_to, p_item, p_qty);
  insert into gifts (from_profile, to_profile, item_id, qty, message)
  values (auth.uid(), p_to, p_item, p_qty, nullif(left(btrim(coalesce(p_message, '')), 200), ''));
end $$;

-- ---------------------------------------------------------------------
-- 5. 상시 과제 — 별 잡기 (30초)
--    별 배치는 서버가 정하고, 제출된 클릭이 실제로 별이 떠 있던 시간인지 서버가 검사합니다.
--    점수 10점당 실타래 1 (최대 5), 하루 3판까지 보상. 순위표는 개인 최고 기록.
-- ---------------------------------------------------------------------
create table if not exists public.star_sessions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  stars        jsonb not null,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  score        integer,
  reward       integer not null default 0,
  rewarded     boolean not null default false
);
create index if not exists star_sessions_score_idx on public.star_sessions(score desc) where score is not null;

create or replace function public.start_star_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_stars jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  delete from star_sessions
   where profile_id = auth.uid() and submitted_at is null and started_at < now() - interval '10 minutes';
  if (select count(*) from star_sessions where profile_id = auth.uid() and submitted_at is null) >= 3 then
    raise exception '진행 중인 게임이 너무 많습니다. 잠시 후 다시 시도하세요.';
  end if;

  -- 50개의 별: 등장 시각 t(ms), 떠 있는 시간 life(ms), 위치 x·y(%), 점수 p (밝은 별 3점)
  select jsonb_agg(jsonb_build_object(
           'id', i,
           't', 300 + i * 580 + floor(random() * 300)::int,
           'life', 800 + floor(random() * 700)::int,
           'x', 6 + floor(random() * 88)::int,
           'y', 8 + floor(random() * 82)::int,
           'p', case when random() < 0.12 then 3 else 1 end) order by i)
    into v_stars
    from generate_series(0, 49) i;

  insert into star_sessions (profile_id, stars) values (auth.uid(), v_stars) returning id into v_id;
  return jsonb_build_object('session', v_id, 'stars', v_stars, 'duration', 30000);
end $$;

create or replace function public.submit_star_game(p_session uuid, p_hits jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s      star_sessions%rowtype;
  v_hits   jsonb := case when jsonb_typeof(p_hits) = 'array' then p_hits else '[]'::jsonb end;
  v_score  integer;
  v_today  integer;
  v_reward integer := 0;
  v_ok     boolean;
  v_best   integer;
  v_rank   integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_s from star_sessions where id = p_session and profile_id = auth.uid() for update;
  if not found then raise exception '게임 기록을 찾을 수 없습니다.'; end if;
  if v_s.submitted_at is not null then raise exception '이미 제출한 게임입니다.'; end if;
  if now() - v_s.started_at < interval '29 seconds' then raise exception '게임이 끝나기 전에는 제출할 수 없습니다.'; end if;
  if now() - v_s.started_at > interval '5 minutes' then raise exception '제출 시간이 지났습니다. 다시 시작해 주세요.'; end if;

  -- 별이 실제로 떠 있던 시간에 누른 것만 인정 (같은 별 중복 클릭은 한 번만)
  select coalesce(sum((s->>'p')::int), 0) into v_score
    from jsonb_array_elements(v_s.stars) s
   where exists (
     select 1 from jsonb_array_elements(v_hits) h
      where h->>'id' = s->>'id'
        and (h->>'at') ~ '^[0-9]{1,6}(\.[0-9]+)?$'
        and (h->>'at')::numeric between (s->>'t')::int - 50 and (s->>'t')::int + (s->>'life')::int + 250);

  select count(*) into v_today from star_sessions
   where profile_id = auth.uid() and rewarded and (submitted_at at time zone 'Asia/Seoul')::date = kst_today();
  v_ok := v_today < 3;
  if v_ok then v_reward := least(5, v_score / 10); end if;

  update star_sessions set submitted_at = now(), score = v_score, reward = v_reward, rewarded = v_ok
   where id = p_session;
  if v_reward > 0 then perform _add_threads(auth.uid(), v_reward, format('상시 과제 · 별 %s점', v_score)); end if;

  select max(score) into v_best from star_sessions where profile_id = auth.uid() and score is not null;
  select 1 + count(*) into v_rank from (
    select profile_id, max(score) b from star_sessions where score is not null group by profile_id) x
   where x.b > v_best;

  return jsonb_build_object('score', v_score, 'reward', v_reward, 'rewarded', v_ok,
                            'rewards_left', greatest(0, 3 - v_today - case when v_ok then 1 else 0 end),
                            'best', v_best, 'rank', v_rank);
end $$;

create or replace function public.star_ranking(p_limit integer default 20)
returns table (rank integer, profile_id uuid, name text, team text, best integer, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  with b as (
    select distinct on (s.profile_id) s.profile_id, s.score, s.submitted_at
      from star_sessions s where s.score is not null
     order by s.profile_id, s.score desc, s.submitted_at asc)
  select (rank() over (order by b.score desc))::int, b.profile_id,
         coalesce(nullif(p.name, ''), p.login_id), p.team, b.score, b.submitted_at
    from b join profiles p on p.id = b.profile_id
   order by b.score desc, b.submitted_at asc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- ---------------------------------------------------------------------
-- 6. 기간 과제 — 기간 안에 긴 글 + 그림 1장 제출
-- ---------------------------------------------------------------------
create table if not exists public.assignments (
  id            bigint generated always as identity primary key,
  title         text not null,
  description   text not null default '',     -- 마크다운
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reward        integer not null default 0 check (reward >= 0),
  require_image boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.submissions (
  id            bigint generated always as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  body          text not null,
  image_url     text,
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  rewarded      boolean not null default false,
  unique (assignment_id, profile_id)
);

create or replace function public.submit_assignment(p_assignment bigint, p_body text, p_image_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a    assignments%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_img  text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_id   bigint;
  v_rew  boolean;
  v_bal  integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_a from assignments where id = p_assignment;
  if not found then raise exception '과제를 찾을 수 없습니다.'; end if;
  if now() < v_a.starts_at then raise exception '아직 제출 기간이 아닙니다.'; end if;
  if now() > v_a.ends_at then raise exception '제출 기간이 끝났습니다.'; end if;
  if char_length(v_body) = 0 then raise exception '글을 입력하세요.'; end if;
  if char_length(v_body) > 30000 then raise exception '글은 30,000자까지입니다.'; end if;
  if v_a.require_image and v_img is null then raise exception '그림 1장을 첨부하세요.'; end if;
  if v_img is not null and v_img not like '%/storage/v1/object/public/uploads/' || auth.uid()::text || '/%' then
    raise exception '그림은 이 사이트에서 업로드한 파일만 사용할 수 있습니다.';
  end if;

  insert into submissions (assignment_id, profile_id, body, image_url)
  values (p_assignment, auth.uid(), v_body, v_img)
  on conflict (assignment_id, profile_id)
  do update set body = excluded.body, image_url = excluded.image_url, updated_at = now()
  returning id, rewarded into v_id, v_rew;

  if not v_rew and v_a.reward > 0 then
    v_bal := _add_threads(auth.uid(), v_a.reward, format('기간 과제 · %s', v_a.title));
    update submissions set rewarded = true where id = v_id;
    return jsonb_build_object('id', v_id, 'reward', v_a.reward);
  end if;
  return jsonb_build_object('id', v_id, 'reward', 0);
end $$;

-- ---------------------------------------------------------------------
-- 7. 커뮤니티 안내 (공지사항 · 세계관 · 캐릭터 가이드 · 시스템)
-- ---------------------------------------------------------------------
create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  category   text not null check (category in ('notice', 'world', 'guide', 'system')),
  title      text not null,
  body       text not null default '',            -- 마크다운 (글 · 표 · 그림)
  pinned     boolean not null default false,
  sort_order integer not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. 관리자 함수
-- ---------------------------------------------------------------------
-- 캐릭터 기본 정보 (실타래 변경은 장부에 '관리자 조정'으로 기록)
create or replace function public.admin_update_profile(
  p_id uuid, p_name text, p_team text, p_position text, p_threads integer, p_is_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur integer;
begin
  perform _require_admin();
  if p_id = auth.uid() and not coalesce(p_is_admin, false) then
    raise exception '자기 자신의 관리자 권한은 해제할 수 없습니다.';
  end if;
  update profiles
     set name = coalesce(p_name, name),
         team = nullif(btrim(coalesce(p_team, '')), ''),
         position = nullif(p_position, ''),
         is_admin = coalesce(p_is_admin, is_admin)
   where id = p_id
  returning threads into v_cur;
  if not found then raise exception '캐릭터를 찾을 수 없습니다.'; end if;
  if p_threads is not null and greatest(0, p_threads) <> v_cur then
    perform _add_threads(p_id, greatest(0, p_threads) - v_cur, '관리자 조정');
  end if;
end $$;

-- 명단 카드 (사진 · 한마디 · 소개)
create or replace function public.admin_set_profile_card(p_id uuid, p_image_url text, p_quote text, p_bio text, p_sort integer default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  update profiles
     set profile_image = nullif(btrim(coalesce(p_image_url, '')), ''),
         quote = nullif(btrim(coalesce(p_quote, '')), ''),
         bio = nullif(btrim(coalesce(p_bio, '')), ''),
         sort_order = coalesce(p_sort, 0)
   where id = p_id;
end $$;

-- 여러 캐릭터에게 한꺼번에 실타래 지급/차감
create or replace function public.admin_grant_threads(p_ids uuid[], p_delta integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare u uuid; n integer := 0;
begin
  perform _require_admin();
  if coalesce(p_delta, 0) = 0 then raise exception '지급할 수량을 입력하세요.'; end if;
  foreach u in array coalesce(p_ids, '{}') loop
    perform _add_threads(u, p_delta, coalesce(nullif(btrim(p_reason), ''), '관리자 지급'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- 보유 아이템 수량 직접 지정 (0이면 삭제)
create or replace function public.admin_set_inventory(p_profile uuid, p_item bigint, p_qty integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  if coalesce(p_qty, 0) <= 0 then
    delete from inventory where profile_id = p_profile and item_id = p_item;
  else
    insert into inventory (profile_id, item_id, qty) values (p_profile, p_item, p_qty)
    on conflict (profile_id, item_id) do update set qty = excluded.qty;
  end if;
end $$;

-- 비밀번호 초기화 (가상 이메일이라 메일로 재설정할 수 없으므로)
create or replace function public.admin_reset_password(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  perform public._require_admin();
  if char_length(coalesce(p_password, '')) < 6 then raise exception '비밀번호는 6자 이상이어야 합니다.'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_id;
  if not found then raise exception '계정을 찾을 수 없습니다.'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. 읽기 권한 (RLS)
-- ---------------------------------------------------------------------
alter table public.thread_logs   enable row level security;
alter table public.attendance    enable row level security;
alter table public.fortunes      enable row level security;
alter table public.shop_items    enable row level security;
alter table public.inventory     enable row level security;
alter table public.gifts         enable row level security;
alter table public.star_sessions enable row level security;
alter table public.assignments   enable row level security;
alter table public.submissions   enable row level security;
alter table public.posts         enable row level security;

-- 본인 것 + 관리자
drop policy if exists own_read on public.thread_logs;
create policy own_read on public.thread_logs   for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists own_read on public.attendance;
create policy own_read on public.attendance    for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists own_read on public.fortunes;
create policy own_read on public.fortunes      for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists own_read on public.inventory;
create policy own_read on public.inventory     for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists own_read on public.gifts;
create policy own_read on public.gifts         for select to authenticated using (from_profile = auth.uid() or to_profile = auth.uid() or public.is_admin());
drop policy if exists own_read on public.star_sessions;
create policy own_read on public.star_sessions for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists admin_delete on public.star_sessions;
create policy admin_delete on public.star_sessions for delete to authenticated using (public.is_admin());
drop policy if exists own_read on public.submissions;
create policy own_read on public.submissions   for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists admin_delete on public.submissions;
create policy admin_delete on public.submissions for delete to authenticated using (public.is_admin());

-- 모두 읽기 + 관리자가 직접 편집
drop policy if exists items_read on public.shop_items;
create policy items_read on public.shop_items for select to authenticated using (active or public.is_admin());
drop policy if exists items_admin on public.shop_items;
create policy items_admin on public.shop_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists assign_read on public.assignments;
create policy assign_read on public.assignments for select to authenticated using (true);
drop policy if exists assign_admin on public.assignments;
create policy assign_admin on public.assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 안내글은 로그인하지 않아도 읽을 수 있음 (신청 전에 세계관을 볼 수 있도록)
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to anon, authenticated using (published or public.is_admin());
drop policy if exists posts_admin on public.posts;
create policy posts_admin on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 10. 실행 권한
-- ---------------------------------------------------------------------
-- 이전 버전(02)에 있던 관리자 함수는 위에서 새 버전으로 교체됨
revoke execute on function public._add_threads(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public._give_item(uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function public._display_name(uuid)               from public, anon, authenticated;

revoke execute on function public.attend()                                       from public, anon;
revoke execute on function public.draw_fortune()                                 from public, anon;
revoke execute on function public.buy_item(bigint, integer, uuid, text)          from public, anon;
revoke execute on function public.gift_item(bigint, uuid, integer, text)         from public, anon;
revoke execute on function public.start_star_game()                              from public, anon;
revoke execute on function public.submit_star_game(uuid, jsonb)                  from public, anon;
revoke execute on function public.star_ranking(integer)                          from public, anon;
revoke execute on function public.submit_assignment(bigint, text, text)          from public, anon;
revoke execute on function public.admin_update_profile(uuid, text, text, text, integer, boolean) from public, anon;
revoke execute on function public.admin_set_profile_card(uuid, text, text, text, integer)       from public, anon;
revoke execute on function public.admin_grant_threads(uuid[], integer, text)     from public, anon;
revoke execute on function public.admin_set_inventory(uuid, bigint, integer)     from public, anon;
revoke execute on function public.admin_reset_password(uuid, text)               from public, anon;

grant execute on function public.kst_now()   to anon, authenticated;
grant execute on function public.kst_today() to anon, authenticated;
grant execute on function public.is_admin()  to anon, authenticated;
grant execute on function public.attend()                                       to authenticated;
grant execute on function public.draw_fortune()                                 to authenticated;
grant execute on function public.buy_item(bigint, integer, uuid, text)          to authenticated;
grant execute on function public.gift_item(bigint, uuid, integer, text)         to authenticated;
grant execute on function public.start_star_game()                              to authenticated;
grant execute on function public.submit_star_game(uuid, jsonb)                  to authenticated;
grant execute on function public.star_ranking(integer)                          to authenticated;
grant execute on function public.submit_assignment(bigint, text, text)          to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, integer, boolean) to authenticated;
grant execute on function public.admin_set_profile_card(uuid, text, text, text, integer)       to authenticated;
grant execute on function public.admin_grant_threads(uuid[], integer, text)     to authenticated;
grant execute on function public.admin_set_inventory(uuid, bigint, integer)     to authenticated;
grant execute on function public.admin_reset_password(uuid, text)               to authenticated;
