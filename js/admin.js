// 관리자 페이지 — 주소를 알아도 서버가 관리자 계정이 아니면 모든 요청을 거부합니다.
import { sb, esc, errMsg, toast, POSITION_LABEL } from './supabase.js';
import { renderLayout } from './layout.js';

const page = document.getElementById('page');
const me = await renderLayout();

const body = () => document.getElementById('tab-body');
let profiles = [];

async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('*').order('team', { nullsFirst: false }).order('login_id');
  if (error) toast(errMsg(error), 'error');
  profiles = data ?? [];
}

const TABS = {
  // ------------------------------------------------------------ 캐릭터
  async chars() {
    await loadProfiles();
    const opt = (v, cur, l) => `<option value="${v}" ${v === (cur ?? '') ? 'selected' : ''}>${l}</option>`;
    body().innerHTML = `<div class="card">
      <p class="muted" style="margin-top:0;font-size:13.5px">
        새 계정은 Supabase 대시보드 › Authentication › Users › <b>Add user</b> 에서 <code>아이디@nameless.legacy</code> 형식으로 만들면 여기에 자동으로 나타납니다.
      </p>
      <div style="overflow-x:auto"><table class="table">
        <thead><tr><th>아이디</th><th>이름</th><th>팀</th><th>포지션</th><th>실타래</th><th>관리자</th><th></th></tr></thead>
        <tbody>${profiles.map(p => `<tr data-id="${p.id}">
          <td>${esc(p.login_id)}</td>
          <td><input class="input" data-f="name" value="${esc(p.name)}"></td>
          <td><select class="input" data-f="team">${opt('', p.team, '—')}${['A', 'B', 'C'].map(t => opt(t, p.team, t + '팀')).join('')}</select></td>
          <td><select class="input" data-f="position">${opt('', p.position, '없음 (전부 사용)')}${Object.entries(POSITION_LABEL).map(([k, l]) => opt(k, p.position, l)).join('')}</select></td>
          <td><input class="input" data-f="threads" type="number" min="0" style="width:90px" value="${p.threads}"></td>
          <td><input type="checkbox" data-f="is_admin" ${p.is_admin ? 'checked' : ''}></td>
          <td><button class="btn sm" data-save>저장</button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;

    body().querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
      const tr = btn.closest('tr'), f = n => tr.querySelector(`[data-f="${n}"]`);
      const { error } = await sb.rpc('admin_update_profile', {
        p_id: tr.dataset.id, p_name: f('name').value.trim(), p_team: f('team').value, p_position: f('position').value,
        p_threads: Number(f('threads').value) || 0, p_is_admin: f('is_admin').checked,
      });
      error ? toast(errMsg(error), 'error') : toast('저장했습니다.');
    }));
  },

  // ------------------------------------------------------------ 전투
  async battles() {
    await loadProfiles();
    const { data: battles } = await sb.from('battles')
      .select('*, parties:battle_parties(side, team, name, members:battle_members(profile:profiles(name, login_id)))')
      .order('id', { ascending: false }).limit(30);

    const pickBox = (side, team) => `
      <div class="picker-box">
        <div class="row">
          <label class="field"><span>${side}측 팀</span>
            <select class="input" id="team${side}">${['A', 'B', 'C'].map(t => `<option ${t === team ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field"><span>파티 이름 (선택)</span><input class="input" id="pname${side}" placeholder="예: ${team}팀 1파티"></label>
        </div>
        <div class="label">파티원 (2~3명 권장)</div>
        <div class="pick-list" id="pick${side}"></div>
      </div>`;

    body().innerHTML = `<div class="stack">
      <div class="card">
        <h3>전투방 열기</h3>
        <div class="row" style="margin-bottom:6px">
          <label class="field" style="max-width:140px"><span>방</span>
            <select class="input" id="room">${[1, 2, 3].map(r => `<option value="${r}">ROOM ${r}</option>`).join('')}</select></label>
          <label class="field"><span>제목 (선택)</span><input class="input" id="title" placeholder="예: 1차 균열 조사"></label>
        </div>
        <div class="picker">${pickBox(1, 'A')}${pickBox(2, 'B')}</div>
        <div style="margin-top:14px"><button class="btn" id="create">전투방 만들기</button></div>
      </div>
      <div class="card">
        <h3>전투 목록</h3>
        ${battles?.length ? `<table class="table"><thead><tr><th>#</th><th>방</th><th>대진</th><th>상태</th><th></th></tr></thead><tbody>${
          battles.map(b => {
            const ps = [...b.parties].sort((x, y) => x.side - y.side);
            const vs = ps.map(p => `${esc(p.name || p.team + '팀')} <small class="muted">(${p.members.map(m => esc(m.profile?.name || m.profile?.login_id)).join(', ')})</small>`).join(' vs ');
            const st = { waiting: '대기', active: `${b.round}R 진행`, finished: '종료' }[b.status];
            return `<tr><td>${b.id}</td><td>${b.room}</td><td>${vs}</td><td>${st}</td>
              <td style="white-space:nowrap">
                <a class="btn sm ghost" href="battle.html?id=${b.id}">관전·중재</a>
                ${b.status === 'waiting' ? `<button class="btn sm" data-start="${b.id}">시작</button>` : ''}
                <button class="btn sm danger" data-del="${b.id}">삭제</button>
              </td></tr>`;
          }).join('')}</tbody></table>` : '<div class="muted">아직 전투가 없습니다.</div>'}
      </div></div>`;

    const fillPick = side => {
      const team = document.getElementById(`team${side}`).value;
      const list = profiles.filter(p => p.team === team);
      document.getElementById(`pick${side}`).innerHTML = list.length
        ? list.map(p => `<label><input type="checkbox" value="${p.id}">${esc(p.name || p.login_id)} <span class="muted">${POSITION_LABEL[p.position] ?? ''}</span></label>`).join('')
        : '<div class="muted" style="font-size:13px">이 팀에 배정된 캐릭터가 없습니다. 캐릭터 탭에서 팀을 지정하세요.</div>';
    };
    [1, 2].forEach(s => { fillPick(s); document.getElementById(`team${s}`).addEventListener('change', () => fillPick(s)); });

    document.getElementById('create').addEventListener('click', async () => {
      const picked = s => [...document.querySelectorAll(`#pick${s} input:checked`)].map(i => i.value);
      const { error } = await sb.rpc('admin_create_battle', {
        p_room: Number(document.getElementById('room').value), p_title: document.getElementById('title').value.trim(),
        p_team1: document.getElementById('team1').value, p_members1: picked(1),
        p_team2: document.getElementById('team2').value, p_members2: picked(2),
        p_name1: document.getElementById('pname1').value.trim() || null, p_name2: document.getElementById('pname2').value.trim() || null,
      });
      if (error) return toast(errMsg(error), 'error');
      toast('전투방을 열었습니다.');
      TABS.battles();
    });
    body().querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', async () => {
      const { error } = await sb.rpc('admin_start_battle', { p_battle_id: Number(b.dataset.start) });
      error ? toast(errMsg(error), 'error') : (toast('전투를 시작했습니다.'), TABS.battles());
    }));
    body().querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 전투와 모든 기록을 삭제합니다. 되돌릴 수 없습니다.')) return;
      const { error } = await sb.rpc('admin_delete_battle', { p_battle_id: Number(b.dataset.del) });
      error ? toast(errMsg(error), 'error') : (toast('삭제했습니다.'), TABS.battles());
    }));
  },

  // ------------------------------------------------------------ 일정
  async schedule() {
    const { data } = await sb.from('schedules').select('*').order('starts_on', { ascending: false }).limit(100);
    body().innerHTML = `<div class="stack">
      <div class="card"><h3>일정 추가</h3>
        <div class="row">
          <label class="field"><span>시작일</span><input class="input" type="date" id="s-start"></label>
          <label class="field"><span>종료일 (선택)</span><input class="input" type="date" id="s-end"></label>
          <label class="field" style="flex:2"><span>제목</span><input class="input" id="s-title"></label>
          <label class="field" style="flex:2"><span>메모 (선택)</span><input class="input" id="s-note"></label>
        </div>
        <button class="btn" id="s-add">추가</button>
      </div>
      <div class="card"><h3>등록된 일정</h3>
        ${data?.length ? `<table class="table"><thead><tr><th>기간</th><th>제목</th><th>메모</th><th></th></tr></thead><tbody>${
          data.map(s => `<tr><td>${s.starts_on}${s.ends_on && s.ends_on !== s.starts_on ? ' ~ ' + s.ends_on : ''}</td><td>${esc(s.title)}</td><td class="muted">${esc(s.note ?? '')}</td>
            <td><button class="btn sm danger" data-del="${s.id}">삭제</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">등록된 일정이 없습니다.</div>'}
      </div></div>`;

    document.getElementById('s-add').addEventListener('click', async () => {
      const v = id => document.getElementById(id).value.trim();
      if (!v('s-start') || !v('s-title')) return toast('시작일과 제목을 입력하세요.', 'error');
      const { error } = await sb.from('schedules').insert({ starts_on: v('s-start'), ends_on: v('s-end') || null, title: v('s-title'), note: v('s-note') || null });
      error ? toast(errMsg(error), 'error') : (toast('추가했습니다.'), TABS.schedule());
    });
    body().querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 일정을 삭제할까요?')) return;
      const { error } = await sb.from('schedules').delete().eq('id', Number(b.dataset.del));
      error ? toast(errMsg(error), 'error') : TABS.schedule();
    }));
  },
};

// ------------------------------------------------------------ 시작
if (!me?.is_admin) {
  page.innerHTML = `<div class="card empty">접근 권한이 없습니다.</div>`;
} else {
  page.innerHTML = `
    <div class="page-head"><h1>관리</h1><span class="sub">관리자 전용</span></div>
    <div class="tabs">
      <button class="tab on" data-tab="chars">캐릭터</button>
      <button class="tab" data-tab="battles">전투</button>
      <button class="tab" data-tab="schedule">일정</button>
    </div>
    <div id="tab-body"></div>`;
  page.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    page.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    TABS[t.dataset.tab]();
  }));
  TABS.chars();
}
