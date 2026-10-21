-- =====================================================================
--  무명의 유산 · 1단계 : 전투 판정 서버 함수
--  모든 주사위·크리티컬·속도 검증은 여기(서버)에서만 일어납니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 내부 도우미
-- ---------------------------------------------------------------------
create or replace function public._battle_log(p_battle bigint, p_round integer, p_kind text, p_msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into battle_logs (battle_id, round, kind, message) values (p_battle, p_round, p_kind, p_msg);
end $$;

create or replace function public._member_name(p_member bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.name, ''), p.login_id)
  from battle_members m join profiles p on p.id = m.profile_id where m.id = p_member
$$;

create or replace function public._party_label(p_party bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name, ''), team) from battle_parties where id = p_party
$$;

-- 이번 라운드에 파티가 아직 쓸 수 있는 속도 (= 잔여 풀 - 이번 라운드 이미 결정된 속도)
create or replace function public._party_speed_left(p_party bigint, p_round integer) returns integer
language sql stable security definer set search_path = public as $$
  select bp.speed_pool - coalesce((select sum(a.speed) from battle_actions a
                                   where a.party_id = p_party and a.round = p_round), 0)::int
  from battle_parties bp where bp.id = p_party
$$;

-- ---------------------------------------------------------------------
-- 전투 종료 + 승패 판정
--  1) 쓰러진 파티원이 없는 파티가 우선
--  2) 둘 다 같다면 파티 전체 체력 감소량이 적은 쪽
--  3) 그래도 같으면 무승부
-- ---------------------------------------------------------------------
create or replace function public._finish_battle(p_battle_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b battles%rowtype;
  p1 bigint; p2 bigint;
  d1 int; d2 int; l1 int; l2 int;
  v_winner bigint;
  v_msg text;
begin
  select * into v_b from battles where id = p_battle_id for update;
  if not found or v_b.status = 'finished' then return; end if;

  select bp.id,
         count(*) filter (where m.hp <= 0),
         coalesce(sum(m.max_hp - m.hp), 0)
    into p1, d1, l1
    from battle_parties bp join battle_members m on m.party_id = bp.id
   where bp.battle_id = p_battle_id and bp.side = 1 group by bp.id;
  select bp.id,
         count(*) filter (where m.hp <= 0),
         coalesce(sum(m.max_hp - m.hp), 0)
    into p2, d2, l2
    from battle_parties bp join battle_members m on m.party_id = bp.id
   where bp.battle_id = p_battle_id and bp.side = 2 group by bp.id;

  if (d1 = 0) <> (d2 = 0) then
    v_winner := case when d1 = 0 then p1 else p2 end;
  elsif l1 <> l2 then
    v_winner := case when l1 < l2 then p1 else p2 end;
  else
    v_winner := null;
  end if;

  update battles
     set status = 'finished', winner_party = v_winner, finished_at = now(), result_note = p_note
   where id = p_battle_id;

  v_msg := format('전투 종료 — %s : 쓰러짐 %s명 · 체력 감소 %s  /  %s : 쓰러짐 %s명 · 체력 감소 %s',
                  _party_label(p1), d1, l1, _party_label(p2), d2, l2);
  perform _battle_log(p_battle_id, v_b.round, 'result', v_msg);
  perform _battle_log(p_battle_id, v_b.round, 'result',
    case when v_winner is null then '결과: 무승부' else format('결과: %s 승리', _party_label(v_winner)) end
    || coalesce(' (' || p_note || ')', ''));
end $$;

-- ---------------------------------------------------------------------
-- 라운드 처리 (모두 결정했거나, 관리자가 강제 진행했을 때)
-- ---------------------------------------------------------------------
create or replace function public._resolve_round(p_battle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b      battles%rowtype;
  r        integer;
  a        record;
  v_actor  battle_members%rowtype;
  v_t      battle_members%rowtype;
  v_name   text;
  v_tname  text;
  v_base   integer;
  v_val    integer;
  v_crit   boolean;
  v_boost  integer;
  v_abs    integer;
  v_dmg    integer;
  v_old    integer;
  v_tags   text;
  v_alive1 integer;
  v_alive2 integer;
  v_rate   numeric;
  v_mult   numeric;
  v_selfhp integer;
begin
  select * into v_b from battles where id = p_battle_id for update;
  if not found or v_b.status <> 'active' then return; end if;
  r := v_b.round;

  -- 이월 기간이 지난 보호 소멸
  update battle_members set shield = 0, shield_until = 0
   where battle_id = p_battle_id and shield > 0 and shield_until < r;

  -- 결정하지 않은 생존자 → 행동 없음(속도 0)
  insert into battle_actions (battle_id, round, member_id, party_id, speed, action, auto)
  select p_battle_id, r, m.id, m.party_id, 0, 'none', true
    from battle_members m
   where m.battle_id = p_battle_id and m.hp > 0
     and not exists (select 1 from battle_actions x
                      where x.battle_id = p_battle_id and x.round = r and x.member_id = m.id);

  perform _battle_log(p_battle_id, r, 'round', format('━━━━━━  %s 라운드  ━━━━━━', r));

  -- 속도 높은 순. 같으면 자명고 우선, 그다음 무작위
  for a in
    select ba.*, bp.team from battle_actions ba
      join battle_parties bp on bp.id = ba.party_id
     where ba.battle_id = p_battle_id and ba.round = r
     order by ba.speed desc, (bp.team = '자명고') desc, random()
  loop
    select * into v_actor from battle_members where id = a.member_id;
    v_name := _member_name(a.member_id);

    if v_actor.hp <= 0 then
      perform _battle_log(p_battle_id, r, 'act', format('%s (속도 %s) — 쓰러져 행동하지 못했다.', v_name, a.speed));
      continue;
    end if;

    if a.action = 'none' then
      perform _battle_log(p_battle_id, r, 'act',
        format('%s (속도 %s) — 행동하지 않았다.%s', v_name, a.speed, case when a.auto then ' (미결정)' else '' end));
      continue;
    end if;

    if a.action = 'covenant' then
      -- TODO: 캐릭터별 성약 스킬이 정해지면 여기에서 분기
      perform _battle_log(p_battle_id, r, 'act', format('%s (속도 %s) ▸ 성약 스킬 발동! (효과 미정)', v_name, a.speed));
      continue;
    end if;

    select * into v_t from battle_members where id = a.target_member_id;
    v_tname := _member_name(a.target_member_id);
    if v_t.id is null or v_t.hp <= 0 then
      perform _battle_log(p_battle_id, r, 'act',
        format('%s (속도 %s) — 대상 %s이(가) 이미 쓰러져 행동이 무효가 되었다.', v_name, a.speed, coalesce(v_tname, '?')));
      continue;
    end if;

    -- 기본 수치
    v_base := case a.action
                when 'attack'  then 11 + floor(random() * 10)::int   -- 11~20
                when 'smash'   then 21 + floor(random() * 10)::int   -- 기본 공격 + 10
                when 'boost'   then 10
                when 'protect' then 11 + floor(random() * 10)::int   -- 11~20
                when 'heal'    then 21 + floor(random() * 10)::int   -- 21~30
              end;

    -- 증진 적용: 크리티컬보다 먼저 더함 (증진 스킬 자체에는 적용하지 않음)
    v_boost := 0;
    v_val   := v_base;
    if v_actor.boost > 0 and a.action <> 'boost' then
      v_boost := v_actor.boost;
      v_val   := v_val + v_boost;
      update battle_members set boost = 0 where id = v_actor.id;
    end if;

    -- 크리티컬: 기본 10% × 1.5
    --   이글: 확률 15%, 공격·강타는 × 2
    v_rate := case when a.team = '이글' then 0.15 else 0.10 end;
    v_mult := case when a.team = '이글' and a.action in ('attack', 'smash') then 2 else 1.5 end;
    v_crit := random() < v_rate;
    if v_crit then v_val := floor(v_val * v_mult)::int; end if;

    v_tags := case when v_crit then format(' [크리티컬 ×%s!]', trim(trailing '.0' from v_mult::text)) else '' end
           || case when v_boost > 0 then format(' [증진 +%s]', v_boost) else '' end;

    if a.action in ('attack', 'smash') then
      v_abs := least(v_t.shield, v_val);
      v_dmg := v_val - v_abs;
      update battle_members
         set hp = greatest(0, hp - v_dmg), shield = 0, shield_until = 0
       where id = v_t.id returning * into v_t;
      perform _battle_log(p_battle_id, r, case when v_crit then 'crit' else 'act' end,
        format('%s (속도 %s) ▸ %s → %s에게 %s 피해%s%s  (남은 체력 %s)',
               v_name, a.speed, case a.action when 'attack' then '공격' else '강타' end,
               v_tname, v_dmg, v_tags,
               case when v_abs > 0 then format(' [보호 %s 상쇄]', v_abs) else '' end,
               v_t.hp));
      if v_t.hp <= 0 then
        perform _battle_log(p_battle_id, r, 'down', format('%s 쓰러짐!', v_tname));
      end if;

    elsif a.action = 'boost' then
      update battle_members set boost = boost + v_val where id = v_t.id;
      perform _battle_log(p_battle_id, r, case when v_crit then 'crit' else 'act' end,
        format('%s (속도 %s) ▸ 증진 → %s의 다음 행동 수치 +%s%s', v_name, a.speed, v_tname, v_val, v_tags));

    elsif a.action = 'protect' then
      update battle_members set shield = v_val, shield_until = r + 1 where id = v_t.id;
      perform _battle_log(p_battle_id, r, case when v_crit then 'crit' else 'act' end,
        format('%s (속도 %s) ▸ 보호 → %s에게 보호 %s%s', v_name, a.speed, v_tname, v_val, v_tags));

    elsif a.action = 'heal' then
      v_old := v_t.hp;
      update battle_members set hp = least(max_hp, hp + v_val) where id = v_t.id returning * into v_t;
      perform _battle_log(p_battle_id, r, case when v_crit then 'crit' else 'act' end,
        format('%s (속도 %s) ▸ 치유 → %s 체력 %s 회복%s  (체력 %s)',
               v_name, a.speed, v_tname, v_t.hp - v_old, v_tags, v_t.hp));
    end if;

    -- 아타락시아: 크리티컬 시 행동한 캐릭터 체력 10 회복
    if v_crit and a.team = '아타락시아' then
      select hp into v_old from battle_members where id = v_actor.id;
      update battle_members set hp = least(max_hp, hp + 10) where id = v_actor.id returning hp into v_selfhp;
      perform _battle_log(p_battle_id, r, 'passive',
        format('  └ 아타락시아 · %s 체력 %s 회복  (체력 %s)', v_name, v_selfhp - v_old, v_selfhp));
    end if;
  end loop;

  -- 이번 라운드 사용 속도 차감
  update battle_parties bp
     set speed_pool = speed_pool - coalesce((select sum(x.speed) from battle_actions x
                                              where x.party_id = bp.id and x.round = r), 0)
   where bp.battle_id = p_battle_id;

  select count(*) filter (where bp.side = 1 and m.hp > 0),
         count(*) filter (where bp.side = 2 and m.hp > 0)
    into v_alive1, v_alive2
    from battle_members m join battle_parties bp on bp.id = m.party_id
   where m.battle_id = p_battle_id;

  if v_alive1 = 0 or v_alive2 = 0 or r >= v_b.max_rounds then
    perform _finish_battle(p_battle_id,
      case when v_alive1 = 0 or v_alive2 = 0 then '전멸' else format('%s라운드 종료', r) end);
  else
    update battles set round = r + 1 where id = p_battle_id;
    perform _battle_log(p_battle_id, r + 1, 'info', format('%s 라운드 — 각 파티는 속도와 행동을 결정하세요.', r + 1));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- [참가자] 이번 라운드 행동 결정
-- ---------------------------------------------------------------------
create or replace function public.submit_action(
  p_battle_id bigint, p_speed integer, p_action text, p_target bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_b       battles%rowtype;
  v_me      battle_members%rowtype;
  v_t       battle_members%rowtype;
  v_pos     text;
  v_left    integer;
  v_pending integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_b from battles where id = p_battle_id for update;
  if not found then raise exception '전투를 찾을 수 없습니다.'; end if;
  if v_b.status <> 'active' then raise exception '진행 중인 전투가 아닙니다.'; end if;

  select * into v_me from battle_members where battle_id = p_battle_id and profile_id = auth.uid();
  if not found then raise exception '이 전투의 참가자가 아닙니다.'; end if;
  if v_me.hp <= 0 then raise exception '쓰러진 캐릭터는 행동할 수 없습니다.'; end if;

  if exists (select 1 from battle_actions
              where battle_id = p_battle_id and round = v_b.round and member_id = v_me.id) then
    raise exception '이번 라운드 행동을 이미 결정했습니다.';
  end if;

  if p_action is null or p_action not in ('attack','smash','boost','protect','heal','covenant','none') then
    raise exception '알 수 없는 행동입니다.';
  end if;

  select position into v_pos from profiles where id = auth.uid();
  if v_pos is not null and (
       (p_action = 'smash' and v_pos <> 'dealer')
    or (p_action in ('boost','protect') and v_pos <> 'supporter')
    or (p_action = 'heal' and v_pos <> 'healer')) then
    raise exception '내 포지션에서 사용할 수 없는 스킬입니다.';
  end if;

  if p_speed is null or p_speed < 0 then raise exception '속도는 0 이상이어야 합니다.'; end if;
  v_left := _party_speed_left(v_me.party_id, v_b.round);
  if p_speed > v_left then
    raise exception '파티의 남은 속도(%)를 초과했습니다.', v_left;
  end if;

  if p_action in ('attack','smash','boost','protect','heal') then
    if p_target is null then raise exception '대상을 선택하세요.'; end if;
    select * into v_t from battle_members where id = p_target and battle_id = p_battle_id;
    if not found then raise exception '대상을 찾을 수 없습니다.'; end if;
    if v_t.hp <= 0 then raise exception '이미 쓰러진 대상입니다.'; end if;
    if p_action in ('attack','smash') and v_t.party_id = v_me.party_id then
      raise exception '아군은 공격할 수 없습니다.';
    end if;
    if p_action in ('boost','protect','heal') and v_t.party_id <> v_me.party_id then
      raise exception '이 스킬은 아군에게만 사용할 수 있습니다.';
    end if;
  else
    p_target := null;
  end if;

  insert into battle_actions (battle_id, round, member_id, party_id, speed, action, target_member_id)
  values (p_battle_id, v_b.round, v_me.id, v_me.party_id, p_speed, p_action, p_target);

  select count(*) into v_pending
    from battle_members m
   where m.battle_id = p_battle_id and m.hp > 0
     and not exists (select 1 from battle_actions x
                      where x.battle_id = p_battle_id and x.round = v_b.round and x.member_id = m.id);

  if v_pending = 0 then
    perform _resolve_round(p_battle_id);
    return jsonb_build_object('resolved', true);
  end if;
  return jsonb_build_object('resolved', false, 'waiting', v_pending);
end $$;

-- ---------------------------------------------------------------------
-- [참가자] 전투 채팅 (scope: 'party' | 'all')
-- ---------------------------------------------------------------------
create or replace function public.send_battle_chat(p_battle_id bigint, p_scope text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me  battle_members%rowtype;
  v_msg text := btrim(coalesce(p_message, ''));
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if char_length(v_msg) = 0 then raise exception '메시지를 입력하세요.'; end if;
  if char_length(v_msg) > 300 then raise exception '메시지는 300자까지입니다.'; end if;

  select * into v_me from battle_members where battle_id = p_battle_id and profile_id = auth.uid();
  if not found then
    if public.is_admin() and p_scope = 'all' then
      insert into battle_chats (battle_id, party_id, profile_id, message) values (p_battle_id, null, auth.uid(), v_msg);
      return;
    end if;
    raise exception '이 전투의 참가자가 아닙니다.';
  end if;

  insert into battle_chats (battle_id, party_id, profile_id, message)
  values (p_battle_id, case when p_scope = 'party' then v_me.party_id else null end, auth.uid(), v_msg);
end $$;

-- =====================================================================
-- 관리자 함수 (모두 is_admin 확인)
-- =====================================================================
create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
end $$;

-- (캐릭터 정보 수정 admin_update_profile 은 04_features.sql 로 옮겨졌습니다)

-- 전투 생성 (각 파티 1~3명, 정식 규칙은 2~3명)
create or replace function public.admin_create_battle(
  p_room integer, p_title text,
  p_team1 text, p_members1 uuid[],
  p_team2 text, p_members2 uuid[],
  p_name1 text default null, p_name2 text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_p1 bigint; v_p2 bigint; u uuid;
begin
  perform _require_admin();
  if p_room not between 1 and 3 then raise exception '전투 방은 1~3번입니다.'; end if;
  if coalesce(p_team1, '') = '' or coalesce(p_team2, '') = '' then raise exception '팀을 지정하세요.'; end if;
  if p_team1 = p_team2 then raise exception '서로 다른 팀끼리만 전투할 수 있습니다.'; end if;
  if coalesce(array_length(p_members1, 1), 0) not between 1 and 3
     or coalesce(array_length(p_members2, 1), 0) not between 1 and 3 then
    raise exception '각 파티는 1~3명이어야 합니다.';
  end if;
  if exists (select unnest(p_members1) intersect select unnest(p_members2)) then
    raise exception '한 캐릭터가 양쪽 파티에 들어갈 수 없습니다.';
  end if;
  if exists (select 1 from battles where room = p_room and status in ('waiting','active')) then
    raise exception '%번 방에 아직 끝나지 않은 전투가 있습니다.', p_room;
  end if;

  insert into battles (room, title) values (p_room, coalesce(p_title, '')) returning id into v_id;
  -- 자명고: 파티 속도 시작치 120
  insert into battle_parties (battle_id, side, team, name, speed_pool)
    values (v_id, 1, p_team1, coalesce(p_name1, ''), case when p_team1 = '자명고' then 120 else 100 end)
    returning id into v_p1;
  insert into battle_parties (battle_id, side, team, name, speed_pool)
    values (v_id, 2, p_team2, coalesce(p_name2, ''), case when p_team2 = '자명고' then 120 else 100 end)
    returning id into v_p2;

  foreach u in array p_members1 loop
    insert into battle_members (battle_id, party_id, profile_id) values (v_id, v_p1, u);
  end loop;
  foreach u in array p_members2 loop
    insert into battle_members (battle_id, party_id, profile_id) values (v_id, v_p2, u);
  end loop;

  perform _battle_log(v_id, 0, 'info',
    format('%s vs %s — 전투방이 열렸습니다.', _party_label(v_p1), _party_label(v_p2)));
  return v_id;
end $$;

create or replace function public.admin_start_battle(p_battle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  update battles set status = 'active', round = 1, started_at = now()
   where id = p_battle_id and status = 'waiting';
  if not found then raise exception '대기 중인 전투가 아닙니다.'; end if;
  perform _battle_log(p_battle_id, 1, 'round', '전투 시작!');
  perform _battle_log(p_battle_id, 1, 'info',
    (select string_agg(format('%s 속도 %s', _party_label(id), speed_pool), ' · ' order by side)
       from battle_parties where battle_id = p_battle_id));
  perform _battle_log(p_battle_id, 1, 'info', '1 라운드 — 각 파티는 속도와 행동을 결정하세요.');
end $$;

-- 결정하지 않은 사람은 '행동 없음'으로 처리하고 라운드 진행
create or replace function public.admin_force_resolve(p_battle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  perform _battle_log(p_battle_id, (select round from battles where id = p_battle_id), 'admin',
                      '[중재] 관리자가 라운드를 진행시켰습니다.');
  perform _resolve_round(p_battle_id);
end $$;

create or replace function public.admin_end_battle(p_battle_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  perform _finish_battle(p_battle_id, coalesce(nullif(p_note, ''), '관리자 종료'));
end $$;

create or replace function public.admin_set_hp(p_member_id bigint, p_hp integer, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_m battle_members%rowtype; v_old int;
begin
  perform _require_admin();
  select * into v_m from battle_members where id = p_member_id;
  if not found then raise exception '참가자를 찾을 수 없습니다.'; end if;
  v_old := v_m.hp;
  update battle_members set hp = greatest(0, least(max_hp, p_hp)) where id = p_member_id returning * into v_m;
  perform _battle_log(v_m.battle_id, (select round from battles where id = v_m.battle_id), 'admin',
    format('[중재] %s 체력 %s → %s%s', _member_name(p_member_id), v_old, v_m.hp,
           coalesce(' (' || nullif(p_reason, '') || ')', '')));
end $$;

create or replace function public.admin_post_log(p_battle_id bigint, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  if char_length(btrim(coalesce(p_message, ''))) = 0 then raise exception '내용을 입력하세요.'; end if;
  perform _battle_log(p_battle_id, (select round from battles where id = p_battle_id), 'admin',
                      '[중재] ' || btrim(p_message));
end $$;

create or replace function public.admin_delete_battle(p_battle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  delete from battles where id = p_battle_id;
end $$;

-- =====================================================================
-- 실행 권한: 내부 함수는 브라우저에서 호출 불가
-- =====================================================================
revoke execute on function public._battle_log(bigint, integer, text, text)  from public, anon, authenticated;
revoke execute on function public._member_name(bigint)                      from public, anon, authenticated;
revoke execute on function public._party_label(bigint)                      from public, anon, authenticated;
revoke execute on function public._party_speed_left(bigint, integer)        from public, anon, authenticated;
revoke execute on function public._finish_battle(bigint, text)              from public, anon, authenticated;
revoke execute on function public._resolve_round(bigint)                    from public, anon, authenticated;
revoke execute on function public._require_admin()                          from public, anon, authenticated;
revoke execute on function public.handle_new_user()                         from public, anon, authenticated;

revoke execute on function public.submit_action(bigint, integer, text, bigint) from public, anon;
revoke execute on function public.send_battle_chat(bigint, text, text)         from public, anon;
revoke execute on function public.admin_create_battle(integer, text, text, uuid[], text, uuid[], text, text) from public, anon;
revoke execute on function public.admin_start_battle(bigint)          from public, anon;
revoke execute on function public.admin_force_resolve(bigint)         from public, anon;
revoke execute on function public.admin_end_battle(bigint, text)      from public, anon;
revoke execute on function public.admin_set_hp(bigint, integer, text) from public, anon;
revoke execute on function public.admin_post_log(bigint, text)        from public, anon;
revoke execute on function public.admin_delete_battle(bigint)         from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.submit_action(bigint, integer, text, bigint) to authenticated;
grant execute on function public.send_battle_chat(bigint, text, text)         to authenticated;
grant execute on function public.admin_create_battle(integer, text, text, uuid[], text, uuid[], text, text) to authenticated;
grant execute on function public.admin_start_battle(bigint)          to authenticated;
grant execute on function public.admin_force_resolve(bigint)         to authenticated;
grant execute on function public.admin_end_battle(bigint, text)      to authenticated;
grant execute on function public.admin_set_hp(bigint, integer, text) to authenticated;
grant execute on function public.admin_post_log(bigint, text)        to authenticated;
grant execute on function public.admin_delete_battle(bigint)         to authenticated;
