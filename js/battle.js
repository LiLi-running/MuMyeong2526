// 차원의 틈 — 방 목록 + 전투방
// 이 파일은 "보여주기"와 "선택 전송"만 합니다. 판정은 전부 서버(submit_action)에서.
import { sb, esc, errMsg, toast, POSITION_LABEL } from './supabase.js';
import { renderLayout } from './layout.js';

const page = document.getElementById('page');
const me = await renderLayout();
const battleId = Number(new URLSearchParams(location.search).get('id')) || null;

const ACTION_LABEL = {
  attack: '공격', smash: '강타', boost: '증진', protect: '보호', heal: '치유', covenant: '성약 스킬', none: '행동 없음',
};
const POSITION_SKILLS = {
  dealer: ['smash'], supporter: ['boost', 'protect'], healer: ['heal'],
  null: ['smash', 'boost', 'protect', 'heal'],
};
const SKILL_DESC = {
  attack: '적 1명에게 11~20 피해',
  smash: '적 1명에게 기본 공격 +10 피해 (21~30)',
  boost: '아군 1명의 다음 행동 수치 +10',
  protect: '아군 1명이 받는 피해 11~20 상쇄. 맞지 않으면 다음 라운드까지 유지',
  heal: '아군 1명의 체력 21~30 회복',
  covenant: '캐릭터 전용 스킬 (효과 추후 결정)',
  none: '이번 라운드에 행동하지 않습니다',
};

if (!me) {
  page.innerHTML = `<div class="page-head"><h1>차원의 틈</h1></div>
    <div class="card empty">전투에 참여하려면 먼저 <a href="index.html">로그인</a>하세요.</div>`;
} else if (!battleId) {
  renderRoomList();
} else {
  enterRoom(battleId);
}

// =====================================================================
//  방 목록
// =====================================================================
async function renderRoomList() {
  page.innerHTML = `<div class="page-head"><h1>차원의 틈</h1><span class="sub">세 개의 균열, 세 개의 전장</span></div>
    <div class="rooms" id="rooms"></div>
    <section class="history card"><h3>지난 전투</h3><div id="history" class="muted">불러오는 중…</div></section>`;

  const { data: battles, error } = await sb.from('battles')
    .select('*, parties:battle_parties(id, side, team, name, members:battle_members(profile_id, profile:profiles(name, login_id)))')
    .order('id', { ascending: false }).limit(40);
  if (error) { toast(errMsg(error), 'error'); return; }

  const label = p => esc(p?.name || `${p?.team}팀`);
  const names = p => (p?.members ?? []).map(m => esc(m.profile?.name || m.profile?.login_id)).join(', ');

  document.getElementById('rooms').innerHTML = [1, 2, 3].map(room => {
    const b = battles.find(x => x.room === room && x.status !== 'finished');
    if (!b) return `<div class="card room"><div class="room-no">ROOM ${room}</div><div class="muted">열린 전투가 없습니다.</div></div>`;
    const [p1, p2] = [...b.parties].sort((a, c) => a.side - c.side);
    const mine = b.parties.some(p => p.members.some(m => m.profile_id === me.id));
    return `<div class="card room">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="room-no">ROOM ${room}</span>
        <span>${mine ? '<span class="status mine">내 전투</span> ' : ''}<span class="status ${b.status}">${b.status === 'active' ? `${b.round} 라운드 진행 중` : '대기 중'}</span></span>
      </div>
      <div class="room-vs">${label(p1)}<span>vs</span>${label(p2)}</div>
      ${b.title ? `<div class="muted" style="font-size:13.5px">${esc(b.title)}</div>` : ''}
      <div class="room-names">${names(p1)}<br>${names(p2)}</div>
      <a class="btn ${mine ? '' : 'ghost'}" href="battle.html?id=${b.id}">${mine ? '입장' : '관전'}</a>
    </div>`;
  }).join('');

  const done = battles.filter(b => b.status === 'finished');
  document.getElementById('history').innerHTML = done.length ? `<table><thead><tr><th>방</th><th>대진</th><th>결과</th><th></th></tr></thead><tbody>${
    done.map(b => {
      const [p1, p2] = [...b.parties].sort((a, c) => a.side - c.side);
      const w = b.parties.find(p => p.id === b.winner_party);
      return `<tr><td>${b.room}</td><td>${label(p1)} vs ${label(p2)}</td><td>${w ? label(w) + ' 승리' : '무승부'}</td>
        <td><a href="battle.html?id=${b.id}">기록 보기</a></td></tr>`;
    }).join('')}</tbody></table>` : '아직 끝난 전투가 없습니다.';
}

// =====================================================================
//  전투방
// =====================================================================
const S = {
  battle: null, parties: [], members: [], actions: [], logs: [], chats: [],
  myMember: null, myParty: null, foeParty: null,
  draft: { speed: '', top: 'attack', skill: null, target: '' },
  ctlKey: '', logCount: 0,
};

async function enterRoom(id) {
  page.innerHTML = `
    <div class="page-head">
      <h1><a href="battle.html" style="text-decoration:none">차원의 틈</a></h1>
      <span class="sub" id="room-sub"></span>
    </div>
    <div id="admin-bar"></div>
    <div class="arena">
      <div class="arena-col side-ally">
        <div class="panel"><div class="panel-head"><h3 id="left-title">우리 파티</h3><span class="label" id="left-team"></span></div>
          <div class="panel-body" id="left-hp"></div></div>
        <div class="panel grow chat">
          <div class="panel-head"><h3>파티 채팅</h3><span class="label">파티원만</span></div>
          <div class="chat-list" id="chat-party"></div>
          <form class="chat-form" id="form-party"><input class="input" maxlength="300" placeholder="작전 상의…"><button class="btn sm">전송</button></form>
        </div>
      </div>

      <div class="arena-col arena-center">
        <div class="panel grow log"><div class="panel-head"><h3>전투 로그</h3><span class="label" id="round-label"></span></div>
          <div class="panel-body log-list" id="log"></div></div>
        <div class="panel control" id="control"></div>
      </div>

      <div class="arena-col side-enemy">
        <div class="panel"><div class="panel-head"><h3 id="right-title">상대 파티</h3><span class="label" id="right-team"></span></div>
          <div class="panel-body" id="right-hp"></div></div>
        <div class="panel grow chat">
          <div class="panel-head"><h3>전투방 채팅</h3><span class="label">전투 참가자 전체</span></div>
          <div class="chat-list" id="chat-all"></div>
          <form class="chat-form" id="form-all"><input class="input" maxlength="300" placeholder="모두에게…"><button class="btn sm">전송</button></form>
        </div>
      </div>
    </div>`;

  bindChat('form-party', 'party');
  bindChat('form-all', 'all');

  await refresh();
  if (!S.battle) return;

  // 실시간 갱신
  const ch = sb.channel(`battle-${id}`);
  for (const t of ['battle_parties', 'battle_members', 'battle_actions', 'battle_logs', 'battle_chats']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `battle_id=eq.${id}` }, scheduleRefresh);
  }
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: `id=eq.${id}` }, scheduleRefresh);
  ch.subscribe();
  // 실시간 연결이 끊겨도 15초마다 동기화
  setInterval(refresh, 15000);
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 250);
}

async function refresh() {
  const id = battleId;
  const [b, p, m, a, l, c] = await Promise.all([
    sb.from('battles').select('*').eq('id', id).maybeSingle(),
    sb.from('battle_parties').select('*').eq('battle_id', id).order('side'),
    sb.from('battle_members').select('*, profile:profiles(id, name, login_id, position)').eq('battle_id', id).order('id'),
    sb.from('battle_actions').select('*').eq('battle_id', id),
    sb.from('battle_logs').select('*').eq('battle_id', id).order('id'),
    sb.from('battle_chats').select('*, profile:profiles(name, login_id)').eq('battle_id', id).order('id').limit(500),
  ]);
  if (!b.data) {
    page.innerHTML = `<div class="card empty">전투를 찾을 수 없습니다. <a href="battle.html">목록으로</a></div>`;
    return;
  }
  Object.assign(S, { battle: b.data, parties: p.data ?? [], members: m.data ?? [], actions: a.data ?? [], logs: l.data ?? [], chats: c.data ?? [] });
  S.myMember = S.members.find(x => x.profile_id === me.id) ?? null;
  S.myParty = S.myMember ? S.parties.find(x => x.id === S.myMember.party_id) : S.parties.find(x => x.side === 1);
  S.foeParty = S.parties.find(x => x.id !== S.myParty?.id);
  render();
}

// ---------- 렌더 ----------
const partyLabel = p => p ? esc(p.name || `${p.team}팀`) : '';
const nameOf = m => esc(m?.profile?.name || m?.profile?.login_id || '?');

function render() {
  const { battle, myParty, foeParty } = S;
  const spectator = !S.myMember;

  document.getElementById('room-sub').innerHTML =
    `ROOM ${battle.room} · ${partyLabel(S.parties[0])} vs ${partyLabel(S.parties[1])}${battle.title ? ' · ' + esc(battle.title) : ''}${spectator ? ' · <b>관전 중</b>' : ''}`;
  document.getElementById('round-label').textContent =
    battle.status === 'active' ? `${battle.round} / ${battle.max_rounds} 라운드` : battle.status === 'waiting' ? '시작 전' : '종료';

  document.getElementById('left-title').textContent = spectator ? partyLabel(myParty) : `우리 파티 · ${myParty?.name || myParty?.team + '팀'}`;
  document.getElementById('right-title').textContent = spectator ? partyLabel(foeParty) : `상대 · ${foeParty?.name || foeParty?.team + '팀'}`;
  document.getElementById('left-team').textContent = myParty ? `${myParty.team}팀` : '';
  document.getElementById('right-team').textContent = foeParty ? `${foeParty.team}팀` : '';
  document.getElementById('left-hp').innerHTML = hpList(myParty, true);
  document.getElementById('right-hp').innerHTML = hpList(foeParty, false);

  renderLog();
  renderChats();
  renderControl();
  if (me.is_admin) renderAdminBar();
}

function hpList(party, ally) {
  if (!party) return '';
  const r = S.battle.round;
  return S.members.filter(m => m.party_id === party.id).map(m => {
    const pct = Math.max(0, Math.min(100, (m.hp / m.max_hp) * 100));
    const pos = POSITION_LABEL[m.profile?.position] ?? '포지션 없음';
    const decided = S.battle.status === 'active' && S.actions.some(a => a.member_id === m.id && a.round === r);
    const shieldOn = m.shield > 0 && m.shield_until >= r;
    const tags = [
      shieldOn ? `<span class="tag">보호 ${m.shield}</span>` : '',
      m.boost > 0 ? `<span class="tag gold">증진 +${m.boost}</span>` : '',
    ].join('');
    return `<div class="hp-row${m.hp <= 0 ? ' down' : ''}">
      <div class="hp-top">
        <span class="hp-name">${nameOf(m)}<small>${pos}</small></span>
        <span class="hp-num">${m.hp <= 0 ? '쓰러짐' : `${m.hp} / ${m.max_hp}`}</span>
      </div>
      <div class="hp-bar"><div class="hp-fill" style="width:${pct}%"></div></div>
      ${tags || (ally && decided) ? `<div class="hp-tags">${tags}${ally && decided ? '<span class="decided">✓ 결정함</span>' : ''}</div>` : ''}
    </div>`;
  }).join('');
}

function renderLog() {
  const box = document.getElementById('log');
  if (S.logs.length === S.logCount) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = S.logs.map(l => `<div class="log-line ${l.kind}">${esc(l.message)}</div>`).join('');
  if (atBottom || S.logCount === 0) box.scrollTop = box.scrollHeight;
  S.logCount = S.logs.length;
}

function renderChats() {
  const fill = (elId, list) => {
    const box = document.getElementById(elId);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = list.length ? list.map(c => {
      const t = new Date(c.created_at);
      return `<div class="chat-msg"><b>${esc(c.profile?.name || c.profile?.login_id)}</b>${esc(c.message)}<time>${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}</time></div>`;
    }).join('') : '<div class="muted" style="font-size:13px">아직 대화가 없습니다.</div>';
    if (atBottom) box.scrollTop = box.scrollHeight;
  };
  const partyChats = S.chats.filter(c => c.party_id !== null && (S.myMember ? c.party_id === S.myMember.party_id : true));
  fill('chat-party', partyChats);
  fill('chat-all', S.chats.filter(c => c.party_id === null));

  const canParty = !!S.myMember;
  const canAll = !!S.myMember || me.is_admin;
  document.querySelector('#form-party input').disabled = !canParty;
  document.querySelector('#form-party input').placeholder = canParty ? '작전 상의…' : '파티원만 쓸 수 있습니다';
  document.querySelector('#form-all input').disabled = !canAll;
  document.querySelector('#form-all input').placeholder = canAll ? '모두에게…' : '전투 참가자만 쓸 수 있습니다';
}

function bindChat(formId, scope) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const msg = input.value.trim();
    if (!msg) return;
    input.disabled = true;
    const { error } = await sb.rpc('send_battle_chat', { p_battle_id: battleId, p_scope: scope, p_message: msg });
    input.disabled = false;
    if (error) return toast(errMsg(error), 'error');
    input.value = '';
    input.focus();
    scheduleRefresh();
  });
}

// ---------- 행동 결정 패널 ----------
function speedLeft() {
  if (!S.myMember) return 0;
  const used = S.actions.filter(a => a.party_id === S.myMember.party_id && a.round === S.battle.round)
    .reduce((s, a) => s + a.speed, 0);
  return S.myParty.speed_pool - used;
}

function renderControl() {
  const box = document.getElementById('control');
  const { battle, myMember } = S;
  const r = battle.round;
  const myAction = myMember && S.actions.find(a => a.member_id === myMember.id && a.round === r);
  const left = speedLeft();
  const mates = myMember ? S.members.filter(m => m.party_id === myMember.party_id && m.id !== myMember.id) : [];
  const matesHtml = mates.length ? `<div class="mates">${mates.map(m => {
    const a = S.actions.find(x => x.member_id === m.id && x.round === r);
    const t = a?.target_member_id ? S.members.find(x => x.id === a.target_member_id) : null;
    return `<div>${nameOf(m)} — ${m.hp <= 0 ? '쓰러짐' : a ? `속도 ${a.speed} · ${ACTION_LABEL[a.action]}${t ? ' → ' + nameOf(t) : ''}` : '고민 중…'}</div>`;
  }).join('')}</div>` : '';

  // 다시 그릴 필요가 없으면 입력 중인 내용을 지키기 위해 건너뜀
  const key = JSON.stringify([battle.status, r, !!myAction, left, myMember?.hp > 0, matesHtml, S.members.map(m => m.hp > 0)]);
  if (key === S.ctlKey) return;
  S.ctlKey = key;

  const stats = myMember ? `<div class="ctl-stats">
      <div class="ctl-stat"><div class="label">라운드</div><div class="num">${r}<small> / ${battle.max_rounds}</small></div></div>
      <div class="ctl-stat"><div class="label">파티 남은 속도</div><div class="num">${left}<small> / ${S.myParty.speed_pool}</small></div></div>
    </div>` : '';

  if (!myMember) {
    box.innerHTML = `<div class="muted">관전 중입니다. 행동 선택은 전투 참가자만 할 수 있습니다.</div>`;
    return;
  }
  if (battle.status === 'waiting') {
    box.innerHTML = `<div class="muted">관리자가 전투를 시작하면 행동을 결정할 수 있습니다.</div>`;
    return;
  }
  if (battle.status === 'finished') {
    const w = S.parties.find(p => p.id === battle.winner_party);
    box.innerHTML = `<div class="ctl-done"><b>전투 종료</b> — ${w ? (w.id === myMember.party_id ? '승리했습니다!' : `${partyLabel(w)} 승리`) : '무승부'}
      <div class="hint">자세한 결과는 전투 로그를 확인하세요. <a href="battle.html">목록으로</a></div></div>`;
    return;
  }
  if (myMember.hp <= 0) {
    box.innerHTML = `${stats}<div class="muted">쓰러져서 더 이상 행동할 수 없습니다. 파티원을 응원해 주세요.</div>${matesHtml}`;
    return;
  }
  if (myAction) {
    const t = myAction.target_member_id ? S.members.find(x => x.id === myAction.target_member_id) : null;
    box.innerHTML = `${stats}<div class="ctl-done"><b>결정 완료</b> — 속도 ${myAction.speed} · ${ACTION_LABEL[myAction.action]}${t ? ' → ' + nameOf(t) : ''}
      <div class="hint">모든 참가자가 결정하면 라운드가 자동으로 진행됩니다.</div></div>${matesHtml}`;
    return;
  }

  // 결정 폼
  const pos = me.position ?? null;
  const skills = POSITION_SKILLS[pos] ?? POSITION_SKILLS.null;
  const d = S.draft;
  if (d.top === 'position' && !skills.includes(d.skill)) d.skill = skills[0];
  const action = d.top === 'position' ? d.skill : d.top;
  const targetKind = ['attack', 'smash'].includes(action) ? 'enemy' : ['boost', 'protect', 'heal'].includes(action) ? 'ally' : null;
  const targets = targetKind === 'enemy'
    ? S.members.filter(m => m.party_id !== myMember.party_id && m.hp > 0)
    : targetKind === 'ally' ? S.members.filter(m => m.party_id === myMember.party_id && m.hp > 0) : [];
  if (!targets.some(t => String(t.id) === String(d.target))) d.target = targets[0]?.id ?? '';

  box.innerHTML = `${stats}
    <div class="ctl-actions"><span class="label">행동</span>
      <div class="act-tabs">
        ${[['attack', '공격'], ['position', '포지션 스킬'], ['covenant', '성약 스킬'], ['none', '행동 없음']]
          .map(([k, l]) => `<button type="button" class="act-tab${d.top === k ? ' on' : ''}" data-top="${k}">${l}</button>`).join('')}
      </div>
      ${d.top === 'position' ? `<div class="sub-acts">${skills.map(s => `<button type="button" class="sub-act${d.skill === s ? ' on' : ''}" data-skill="${s}">${ACTION_LABEL[s]}</button>`).join('')}</div>` : ''}
    </div>
    <div class="ctl-grid">
      <label><span class="label">이번 라운드 속도</span>
        <input class="input" id="in-speed" type="number" min="0" max="${left}" step="1" inputmode="numeric" value="${esc(d.speed)}" placeholder="0~${left}"></label>
      <label><span class="label">대상</span>
        <select class="input" id="in-target" ${targetKind ? '' : 'disabled'}>
          ${targetKind ? targets.map(t => `<option value="${t.id}" ${String(t.id) === String(d.target) ? 'selected' : ''}>${nameOf(t)} (${t.hp})</option>`).join('') : '<option>대상 없음</option>'}
        </select></label>
      <button class="btn" id="btn-decide" type="button">결정</button>
    </div>
    <div class="hint">${ACTION_LABEL[action]} — ${SKILL_DESC[action]}. 속도가 높을수록 먼저 행동하며, 결정 후에는 바꿀 수 없습니다.</div>
    ${matesHtml}`;

  box.querySelector('#in-speed').addEventListener('input', e => { d.speed = e.target.value; });
  box.querySelector('#in-target').addEventListener('change', e => { d.target = e.target.value; });
  box.querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => { d.top = b.dataset.top; S.ctlKey = ''; renderControl(); }));
  box.querySelectorAll('[data-skill]').forEach(b => b.addEventListener('click', () => { d.skill = b.dataset.skill; S.ctlKey = ''; renderControl(); }));
  box.querySelector('#btn-decide').addEventListener('click', () => decide(action, targetKind, left));
}

async function decide(action, targetKind, left) {
  const d = S.draft;
  const speed = d.speed === '' ? NaN : Number(d.speed);
  if (!Number.isInteger(speed) || speed < 0) return toast('속도를 0 이상의 정수로 입력하세요.', 'error');
  if (speed > left) return toast(`파티의 남은 속도는 ${left}입니다.`, 'error');
  const target = targetKind ? Number(d.target) : null;
  if (targetKind && !target) return toast('대상을 선택하세요.', 'error');

  const t = target ? S.members.find(m => m.id === target) : null;
  if (!confirm(`속도 ${speed} · ${ACTION_LABEL[action]}${t ? ' → ' + (t.profile?.name || '') : ''}\n이대로 결정할까요? 결정 후에는 바꿀 수 없습니다.`)) return;

  const btn = document.getElementById('btn-decide');
  btn.disabled = true;
  const { data, error } = await sb.rpc('submit_action', {
    p_battle_id: battleId, p_speed: speed, p_action: action, p_target: target,
  });
  if (error) { btn.disabled = false; return toast(errMsg(error), 'error'); }
  S.draft = { speed: '', top: 'attack', skill: null, target: '' };
  toast(data?.resolved ? '라운드가 진행되었습니다.' : '결정했습니다. 다른 참가자를 기다립니다.');
  S.ctlKey = '';
  refresh();
}

// ---------- 관리자 중재 막대 ----------
let adminKey = '';
function renderAdminBar() {
  const bar = document.getElementById('admin-bar');
  const key = JSON.stringify([S.battle.status, S.battle.round, S.members.map(m => [m.id, m.hp])]);
  if (key === adminKey) return;
  adminKey = key;
  const st = S.battle.status;
  bar.innerHTML = `<div class="admin-bar">
    <b style="color:var(--gold)">관리자</b>
    ${st === 'waiting' ? '<button class="btn sm" data-a="start">전투 시작</button>' : ''}
    ${st === 'active' ? '<button class="btn sm" data-a="force">라운드 강제 진행</button><button class="btn sm danger" data-a="end">전투 종료</button>' : ''}
    <span style="flex:1"></span>
    <select class="input" id="adm-member">${S.members.map(m => `<option value="${m.id}">${nameOf(m)} (${m.hp})</option>`).join('')}</select>
    <input class="input" id="adm-hp" type="number" style="width:80px" placeholder="체력">
    <button class="btn sm ghost" data-a="hp">체력 조정</button>
    <input class="input" id="adm-msg" style="width:200px" placeholder="로그에 남길 중재 메시지">
    <button class="btn sm ghost" data-a="msg">기록</button>
  </div>`;
  bar.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => adminAction(b.dataset.a)));
}

async function adminAction(kind) {
  let res;
  if (kind === 'start') res = await sb.rpc('admin_start_battle', { p_battle_id: battleId });
  if (kind === 'force') {
    if (!confirm('결정하지 않은 참가자는 "행동 없음"으로 처리하고 라운드를 진행합니다.')) return;
    res = await sb.rpc('admin_force_resolve', { p_battle_id: battleId });
  }
  if (kind === 'end') {
    const note = prompt('종료 사유 (선택)', '관리자 종료');
    if (note === null) return;
    res = await sb.rpc('admin_end_battle', { p_battle_id: battleId, p_note: note });
  }
  if (kind === 'hp') {
    const hp = Number(document.getElementById('adm-hp').value);
    if (!Number.isFinite(hp)) return toast('체력을 입력하세요.', 'error');
    const reason = prompt('조정 사유 (선택)', '') ?? '';
    res = await sb.rpc('admin_set_hp', { p_member_id: Number(document.getElementById('adm-member').value), p_hp: hp, p_reason: reason });
  }
  if (kind === 'msg') {
    const msg = document.getElementById('adm-msg').value.trim();
    if (!msg) return;
    res = await sb.rpc('admin_post_log', { p_battle_id: battleId, p_message: msg });
  }
  if (res?.error) return toast(errMsg(res.error), 'error');
  adminKey = '';
  toast('처리했습니다.');
  refresh();
}
