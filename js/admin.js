// 관리자 페이지 — 주소를 알아도 서버가 관리자 계정이 아니면 모든 요청을 거부합니다.
import { sb, esc, errMsg, toast, POSITION_LABEL, TEAM_PASSIVES } from './supabase.js';
import { renderLayout } from './layout.js';
import { md, modal, uploadImage, fmtDate, fmtDateTime, toLocalInput, nameOf } from './ui.js';

const page = document.getElementById('page');
const me = await renderLayout();

const body = () => document.getElementById('tab-body');
let profiles = [];
// 팀 선택지: 기본 A·B·C + 패시브 팀 + 캐릭터에 입력된 그 밖의 팀
const BASE_TEAMS = ['A', 'B', 'C'];
const teamNames = () => [...new Set([...BASE_TEAMS, ...Object.keys(TEAM_PASSIVES), ...profiles.map(p => p.team).filter(Boolean)])];
const CATS = { notice: '공지사항', world: '세계관', guide: '캐릭터 가이드', system: '시스템' };

async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('*').order('team', { nullsFirst: false }).order('login_id');
  if (error) toast(errMsg(error), 'error');
  profiles = data ?? [];
}

/** 이미지 칸: 미리보기 + 올리기 버튼. get() 으로 현재 주소 */
function imageField(container, initial) {
  let url = initial || '';
  const draw = () => {
    container.innerHTML = `${url ? `<img class="upload-preview sm" src="${esc(url)}" alt="">` : '<span class="muted">이미지 없음</span>'}
      <label class="btn ghost sm">${url ? '바꾸기' : '올리기'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>
      ${url ? '<button type="button" class="btn ghost sm" data-clear>지우기</button>' : ''}`;
    container.querySelector('input').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { url = await uploadImage(f); } catch (err) { toast(err.message, 'error'); }
      draw();
    };
    const c = container.querySelector('[data-clear]');
    if (c) c.onclick = () => { url = ''; draw(); };
  };
  draw();
  return { get: () => url };
}

const TABS = {
  // ------------------------------------------------------------ 캐릭터
  async chars() {
    await loadProfiles();
    const opt = (v, cur, l) => `<option value="${v}" ${v === (cur ?? '') ? 'selected' : ''}>${l}</option>`;
    body().innerHTML = `<div class="card">
      <p class="muted" style="margin-top:0;font-size:13.5px">
        새 계정은 Supabase 대시보드 › Authentication › Users › <b>Add user</b> 에서 <code>아이디@nameless.legacy</code> 형식으로 만들면 여기에 자동으로 나타납니다.
        팀은 직접 입력하며, <b>자명고 · 이글 · 아타락시아</b>는 이름이 정확히 같아야 패시브가 적용됩니다.
      </p>
      <datalist id="team-list">${teamNames().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <div class="bulk">
        <b>선택한 캐릭터에게</b>
        <input class="input" id="bulk-n" type="number" placeholder="수량 (차감은 -)" style="width:140px">
        <input class="input" id="bulk-r" placeholder="사유 (예: 이벤트 보상)" style="width:220px">
        <button class="btn sm" id="bulk-go">실타래 지급</button>
      </div>
      <div style="overflow-x:auto"><table class="table">
        <thead><tr><th><input type="checkbox" id="chk-all"></th><th>아이디</th><th>이름</th><th>팀</th><th>포지션</th><th>실타래</th><th>관리자</th><th></th></tr></thead>
        <tbody>${profiles.map(p => `<tr data-id="${p.id}">
          <td><input type="checkbox" class="chk"></td>
          <td>${esc(p.login_id)}</td>
          <td><input class="input" data-f="name" value="${esc(p.name)}"></td>
          <td><input class="input" data-f="team" list="team-list" style="width:120px" value="${esc(p.team ?? '')}" placeholder="팀 이름"></td>
          <td><select class="input" data-f="position">${opt('', p.position, '없음 (전부 사용)')}${Object.entries(POSITION_LABEL).map(([k, l]) => opt(k, p.position, l)).join('')}</select></td>
          <td><input class="input" data-f="threads" type="number" min="0" style="width:84px" value="${p.threads}"></td>
          <td><input type="checkbox" data-f="is_admin" ${p.is_admin ? 'checked' : ''}></td>
          <td style="white-space:nowrap"><button class="btn sm" data-save>저장</button>
            <button class="btn sm ghost" data-card>명단 카드</button>
            <button class="btn sm ghost" data-pw>비밀번호</button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;

    const rowOf = el => el.closest('tr');
    body().querySelectorAll('[data-save]').forEach(btn => btn.onclick = async () => {
      const tr = rowOf(btn), f = n => tr.querySelector(`[data-f="${n}"]`);
      const { error } = await sb.rpc('admin_update_profile', {
        p_id: tr.dataset.id, p_name: f('name').value.trim(), p_team: f('team').value.trim(), p_position: f('position').value,
        p_threads: Number(f('threads').value) || 0, p_is_admin: f('is_admin').checked,
      });
      error ? toast(errMsg(error), 'error') : toast('저장했습니다.');
    });
    body().querySelectorAll('[data-pw]').forEach(btn => btn.onclick = async () => {
      const p = profiles.find(x => x.id === rowOf(btn).dataset.id);
      const pw = prompt(`${nameOf(p)} (${p.login_id})의 새 비밀번호 (6자 이상)`);
      if (!pw) return;
      const { error } = await sb.rpc('admin_reset_password', { p_id: p.id, p_password: pw });
      error ? toast(errMsg(error), 'error') : toast('비밀번호를 바꿨습니다. 본인에게 알려 주세요.');
    });
    body().querySelectorAll('[data-card]').forEach(btn => btn.onclick = () => {
      const p = profiles.find(x => x.id === rowOf(btn).dataset.id);
      const dlg = modal(`${nameOf(p)} · 명단 카드`, `
        <div class="field"><span class="label">프로필 이미지</span><div class="upload-box" id="c-img"></div></div>
        <label class="field"><span>한마디</span><input class="input" id="c-quote" value="${esc(p.quote ?? '')}" maxlength="100"></label>
        <label class="field"><span>소개 (마크다운: 글 · 표 · 그림)</span><textarea class="input" id="c-bio" rows="10">${esc(p.bio ?? '')}</textarea></label>
        <label class="field" style="max-width:160px"><span>명단 정렬 순서 (작을수록 앞)</span><input class="input" type="number" id="c-sort" value="${p.sort_order ?? 0}"></label>
        <button class="btn" id="c-ok">저장</button>`, { wide: true });
      const img = imageField(dlg.querySelector('#c-img'), p.profile_image);
      dlg.querySelector('#c-ok').onclick = async () => {
        const { error } = await sb.rpc('admin_set_profile_card', {
          p_id: p.id, p_image_url: img.get(), p_quote: dlg.querySelector('#c-quote').value,
          p_bio: dlg.querySelector('#c-bio').value, p_sort: Number(dlg.querySelector('#c-sort').value) || 0,
        });
        if (error) return toast(errMsg(error), 'error');
        toast('저장했습니다.'); dlg.close(); TABS.chars();
      };
    });
    document.getElementById('chk-all').onchange = e => body().querySelectorAll('.chk').forEach(c => c.checked = e.target.checked);
    document.getElementById('bulk-go').onclick = async () => {
      const ids = [...body().querySelectorAll('.chk:checked')].map(c => rowOf(c).dataset.id);
      const n = Number(document.getElementById('bulk-n').value);
      if (!ids.length) return toast('캐릭터를 선택하세요.', 'error');
      if (!n) return toast('수량을 입력하세요.', 'error');
      if (!confirm(`${ids.length}명에게 실타래 ${n > 0 ? '+' : ''}${n}`)) return;
      const { error } = await sb.rpc('admin_grant_threads', { p_ids: ids, p_delta: n, p_reason: document.getElementById('bulk-r').value });
      if (error) return toast(errMsg(error), 'error');
      toast('처리했습니다.'); TABS.chars();
    };
  },

  // ------------------------------------------------------------ 안내글 (메뉴마다 글 1개)
  async posts(cat = 'notice') {
    const { data: list } = await sb.from('posts').select('*').eq('category', cat)
      .order('updated_at', { ascending: false });
    const cur = (list ?? [])[0] ?? null;            // 가장 최근 글 1개를 편집
    const extra = (list ?? []).slice(1);             // 예전 방식으로 여러 개 쓴 글이 남아 있으면

    body().innerHTML = `
      <div class="chips">${Object.entries(CATS).map(([k, l]) => `<button class="chip${k === cat ? ' on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <h3 style="margin:0">${CATS[cat]}</h3>
          <span class="muted" style="font-size:13px">${cur ? `마지막 저장 ${fmtDateTime(cur.updated_at ?? cur.created_at)}` : '아직 작성하지 않았습니다'}</span>
        </div>
        <div class="md-toolbar">
          <button type="button" class="btn ghost sm" data-ins="h">소제목</button>
          <button type="button" class="btn ghost sm" data-ins="b">굵게</button>
          <button type="button" class="btn ghost sm" data-ins="table">표</button>
          <button type="button" class="btn ghost sm" data-ins="hr">구분선</button>
          <label class="btn ghost sm">그림<input type="file" id="p-img" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>
          <span class="muted" style="font-size:12px">마크다운으로 작성 · 오른쪽에 미리보기</span>
        </div>
        <div class="md-editor">
          <textarea class="input" id="p-body" spellcheck="false" placeholder="여기에 ${CATS[cat]} 내용을 작성하세요.">${esc(cur?.body ?? '')}</textarea>
          <div class="prose md-preview" id="p-prev"></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <label><input type="checkbox" id="p-pub" ${cur?.published ?? true ? 'checked' : ''}> 공개</label>
          <button class="btn" id="p-save">저장</button>
          <a class="btn ghost" href="guide.html?c=${cat}" target="_blank">사이트에서 보기</a>
        </div>
        ${extra.length ? `<p class="hint">이전에 작성한 글 ${extra.length}개가 더 있습니다. 사이트에는 위 글만 보입니다.
          <button type="button" class="btn ghost sm" id="p-clean">이전 글 정리</button></p>` : ''}
      </div>`;

    body().querySelectorAll('[data-cat]').forEach(b => b.onclick = () => TABS.posts(b.dataset.cat));

    const ta = document.getElementById('p-body'), prev = document.getElementById('p-prev');
    const preview = () => prev.innerHTML = md(ta.value) || '<p class="muted">미리보기</p>';
    ta.oninput = preview; preview();
    const insert = (text) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length; preview();
    };
    const SNIP = {
      h: '\n## 소제목\n',
      b: '**굵은 글씨**',
      table: '\n| 항목 | 내용 |\n| --- | --- |\n| 예시 | 설명 |\n| 예시 | 설명 |\n',
      hr: '\n\n---\n\n',
    };
    body().querySelectorAll('[data-ins]').forEach(b => b.onclick = () => insert(SNIP[b.dataset.ins]));
    document.getElementById('p-img').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { insert(`\n![](${await uploadImage(f)})\n`); } catch (err) { toast(err.message, 'error'); }
      e.target.value = '';
    };
    document.getElementById('p-save').onclick = async () => {
      const row = { category: cat, title: CATS[cat], body: ta.value,
        published: document.getElementById('p-pub').checked, updated_at: new Date().toISOString() };
      const res = cur
        ? await sb.from('posts').update(row).eq('id', cur.id)
        : await sb.from('posts').insert(row);
      if (res.error) return toast(errMsg(res.error), 'error');
      toast('저장했습니다.');
      TABS.posts(cat);
    };
    const clean = document.getElementById('p-clean');
    if (clean) clean.onclick = async () => {
      if (!confirm(`위 글만 남기고 이전 글 ${extra.length}개를 삭제합니다. 되돌릴 수 없습니다.`)) return;
      const { error } = await sb.from('posts').delete().in('id', extra.map(p => p.id));
      error ? toast(errMsg(error), 'error') : TABS.posts(cat);
    };
  },

  // ------------------------------------------------------------ 상점
  async shop() {
    await loadProfiles();
    const [{ data: items }, { data: inv }] = await Promise.all([
      sb.from('shop_items').select('*').order('sort_order').order('id'),
      sb.from('inventory').select('qty, profile_id, item_id'),
    ]);
    const owned = id => (inv ?? []).filter(r => r.item_id === id).reduce((a, r) => a + r.qty, 0);
    body().innerHTML = `<div class="stack">
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">아이템</h3><button class="btn sm" id="it-new">+ 아이템 추가</button></div>
        ${(items ?? []).length ? `<table class="table"><thead><tr><th></th><th>이름</th><th>가격</th><th>재고</th><th>보유 합계</th><th>상태</th><th></th></tr></thead><tbody>${
          items.map(it => `<tr><td>${it.image_url ? `<img class="inv-img" src="${esc(it.image_url)}" alt="">` : ''}</td>
            <td>${esc(it.name)}</td><td>${it.price}</td><td>${it.stock ?? '무제한'}</td><td>${owned(it.id)}</td>
            <td>${it.active ? '판매 중' : '<span class="muted">숨김</span>'}</td>
            <td><button class="btn sm ghost" data-edit="${it.id}">수정</button></td></tr>`).join('')}</tbody></table>`
          : '<div class="muted">등록된 아이템이 없습니다.</div>'}
      </div>
      <div class="card"><h3>보유 아이템 조정</h3>
        <div class="row">
          <label class="field"><span>캐릭터</span><select class="input" id="iv-p">${profiles.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select></label>
          <label class="field"><span>아이템</span><select class="input" id="iv-i">${(items ?? []).map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>
          <label class="field" style="max-width:120px"><span>수량 (0 = 회수)</span><input class="input" type="number" min="0" id="iv-q" value="1"></label>
          <button class="btn" id="iv-ok" style="flex:0;height:38px;margin-bottom:12px">적용</button>
        </div>
        <div id="iv-cur" class="muted" style="font-size:13px"></div>
      </div></div>`;

    const showCur = () => {
      const pid = document.getElementById('iv-p').value;
      const rows = (inv ?? []).filter(r => r.profile_id === pid);
      document.getElementById('iv-cur').textContent = rows.length
        ? '현재 보유: ' + rows.map(r => `${items.find(i => i.id === r.item_id)?.name} ×${r.qty}`).join(', ') : '현재 보유 아이템 없음';
    };
    document.getElementById('iv-p').onchange = showCur; showCur();
    document.getElementById('iv-ok').onclick = async () => {
      const { error } = await sb.rpc('admin_set_inventory', {
        p_profile: document.getElementById('iv-p').value, p_item: Number(document.getElementById('iv-i').value),
        p_qty: Number(document.getElementById('iv-q').value) || 0,
      });
      error ? toast(errMsg(error), 'error') : (toast('적용했습니다.'), TABS.shop());
    };

    const edit = (it) => {
      const dlg = modal(it ? '아이템 수정' : '아이템 추가', `
        <label class="field"><span>이름</span><input class="input" id="i-name" value="${esc(it?.name ?? '')}"></label>
        <label class="field"><span>설명</span><textarea class="input" id="i-desc" rows="3">${esc(it?.description ?? '')}</textarea></label>
        <div class="row">
          <label class="field"><span>가격 (실타래)</span><input class="input" type="number" min="0" id="i-price" value="${it?.price ?? 10}"></label>
          <label class="field"><span>재고 (비우면 무제한)</span><input class="input" type="number" min="0" id="i-stock" value="${it?.stock ?? ''}"></label>
          <label class="field"><span>정렬 순서</span><input class="input" type="number" id="i-sort" value="${it?.sort_order ?? 0}"></label>
        </div>
        <div class="field"><span class="label">이미지</span><div class="upload-box" id="i-img"></div></div>
        <label style="display:block;margin-bottom:14px"><input type="checkbox" id="i-active" ${it?.active ?? true ? 'checked' : ''}> 판매 중 (끄면 상점에서 숨김)</label>
        <div style="display:flex;gap:8px"><button class="btn" id="i-ok">저장</button>
          ${it ? '<span style="flex:1"></span><button class="btn danger" id="i-del">삭제</button>' : ''}</div>`);
      const img = imageField(dlg.querySelector('#i-img'), it?.image_url);
      dlg.querySelector('#i-ok').onclick = async () => {
        const v = id => dlg.querySelector(id).value;
        const row = { name: v('#i-name').trim(), description: v('#i-desc'), price: Number(v('#i-price')) || 0,
          stock: v('#i-stock') === '' ? null : Number(v('#i-stock')), sort_order: Number(v('#i-sort')) || 0,
          image_url: img.get() || null, active: dlg.querySelector('#i-active').checked };
        if (!row.name) return toast('이름을 입력하세요.', 'error');
        const { error } = it ? await sb.from('shop_items').update(row).eq('id', it.id) : await sb.from('shop_items').insert(row);
        if (error) return toast(errMsg(error), 'error');
        dlg.close(); toast('저장했습니다.'); TABS.shop();
      };
      const del = dlg.querySelector('#i-del');
      if (del) del.onclick = async () => {
        if (!confirm('삭제하면 모든 캐릭터의 보유 기록과 선물 기록에서도 사라집니다. 판매만 멈추려면 "판매 중"을 끄세요.')) return;
        const { error } = await sb.from('shop_items').delete().eq('id', it.id);
        if (error) return toast(errMsg(error), 'error');
        dlg.close(); TABS.shop();
      };
    };
    document.getElementById('it-new').onclick = () => edit(null);
    body().querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(items.find(i => i.id === Number(b.dataset.edit))));
  },

  // ------------------------------------------------------------ 과제
  async tasks() {
    const [{ data: list }, { data: subs }, { data: rank }, { data: recent }] = await Promise.all([
      sb.from('assignments').select('*').order('starts_at', { ascending: false }),
      sb.from('submissions').select('assignment_id'),
      sb.rpc('star_ranking', { p_limit: 30 }),
      sb.from('star_sessions').select('id, score, reward, submitted_at, profile:profiles(name, login_id)').not('score', 'is', null).order('submitted_at', { ascending: false }).limit(30),
    ]);
    const cnt = id => (subs ?? []).filter(s => s.assignment_id === id).length;
    body().innerHTML = `<div class="stack">
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">기간 과제</h3><button class="btn sm" id="a-new">+ 과제 추가</button></div>
        ${(list ?? []).length ? `<table class="table"><thead><tr><th>제목</th><th>기간</th><th>보상</th><th>제출</th><th></th></tr></thead><tbody>${
          list.map(a => `<tr><td>${esc(a.title)}</td><td class="muted">${fmtDateTime(a.starts_at)} ~ ${fmtDateTime(a.ends_at)}</td>
            <td>${a.reward}</td><td>${cnt(a.id)}명</td>
            <td style="white-space:nowrap"><button class="btn sm" data-subs="${a.id}">제출물</button> <button class="btn sm ghost" data-edit="${a.id}">수정</button></td></tr>`).join('')}</tbody></table>`
          : '<div class="muted">등록된 기간 과제가 없습니다.</div>'}
      </div>
      <div class="two-col">
        <div class="card"><h3>별 잡기 순위</h3>
          ${(rank ?? []).length ? `<table class="table rank"><tbody>${rank.map(r => `<tr><td class="r-no">${r.rank}</td><td>${esc(r.name)}</td><td class="r-score">${r.best}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">기록 없음</div>'}
        </div>
        <div class="card"><h3>최근 별 잡기 기록</h3>
          <p class="muted" style="font-size:12.5px;margin-top:0">비정상적인 기록은 삭제할 수 있습니다. (이미 지급된 실타래는 캐릭터 탭에서 조정)</p>
          ${(recent ?? []).length ? `<table class="table"><tbody>${recent.map(s => `<tr><td>${esc(nameOf(s.profile))}</td><td>${s.score}점</td><td class="muted">+${s.reward}</td>
            <td class="muted">${fmtDateTime(s.submitted_at)}</td><td><button class="btn sm ghost" data-del-star="${s.id}">삭제</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">기록 없음</div>'}
        </div>
      </div></div>`;

    const edit = (a) => {
      const now = new Date(), week = new Date(Date.now() + 7 * 864e5);
      const dlg = modal(a ? '기간 과제 수정' : '기간 과제 추가', `
        <label class="field"><span>제목</span><input class="input" id="a-title" value="${esc(a?.title ?? '')}"></label>
        <div class="row">
          <label class="field"><span>시작</span><input class="input" type="datetime-local" id="a-start" value="${toLocalInput(a?.starts_at ?? now)}"></label>
          <label class="field"><span>마감</span><input class="input" type="datetime-local" id="a-end" value="${toLocalInput(a?.ends_at ?? week)}"></label>
          <label class="field" style="max-width:130px"><span>보상 (실타래)</span><input class="input" type="number" min="0" id="a-reward" value="${a?.reward ?? 0}"></label>
        </div>
        <label style="display:block;margin-bottom:12px"><input type="checkbox" id="a-img" ${a?.require_image ?? true ? 'checked' : ''}> 그림 1장 필수</label>
        <label class="field"><span>주제 · 설명 (마크다운)</span><textarea class="input" id="a-desc" rows="10">${esc(a?.description ?? '')}</textarea></label>
        <div style="display:flex;gap:8px"><button class="btn" id="a-ok">저장</button>
          ${a ? '<span style="flex:1"></span><button class="btn danger" id="a-del">삭제</button>' : ''}</div>`, { wide: true });
      dlg.querySelector('#a-ok').onclick = async () => {
        const v = id => dlg.querySelector(id).value;
        const row = { title: v('#a-title').trim(), description: v('#a-desc'), reward: Number(v('#a-reward')) || 0,
          starts_at: new Date(v('#a-start')).toISOString(), ends_at: new Date(v('#a-end')).toISOString(),
          require_image: dlg.querySelector('#a-img').checked };
        if (!row.title) return toast('제목을 입력하세요.', 'error');
        if (row.ends_at <= row.starts_at) return toast('마감이 시작보다 늦어야 합니다.', 'error');
        const { error } = a ? await sb.from('assignments').update(row).eq('id', a.id) : await sb.from('assignments').insert(row);
        if (error) return toast(errMsg(error), 'error');
        dlg.close(); toast('저장했습니다.'); TABS.tasks();
      };
      const del = dlg.querySelector('#a-del');
      if (del) del.onclick = async () => {
        if (!confirm('과제와 모든 제출물을 삭제합니다. 되돌릴 수 없습니다.')) return;
        const { error } = await sb.from('assignments').delete().eq('id', a.id);
        if (error) return toast(errMsg(error), 'error');
        dlg.close(); TABS.tasks();
      };
    };
    const showSubs = async (a) => {
      const { data } = await sb.from('submissions').select('*, profile:profiles(name, login_id)').eq('assignment_id', a.id).order('submitted_at');
      modal(`${a.title} · 제출물 ${data?.length ?? 0}건`, (data ?? []).length ? data.map(s => `
        <details class="sub-item"><summary><b>${esc(nameOf(s.profile))}</b> <span class="muted">${fmtDateTime(s.updated_at)} · ${s.body.length.toLocaleString()}자</span></summary>
          ${s.image_url ? `<a href="${esc(s.image_url)}" target="_blank"><img class="upload-preview" src="${esc(s.image_url)}" alt=""></a>` : ''}
          <div class="sub-body">${esc(s.body)}</div></details>`).join('') : '<div class="muted">아직 제출물이 없습니다.</div>', { wide: true });
    };
    document.getElementById('a-new').onclick = () => edit(null);
    body().querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(list.find(a => a.id === Number(b.dataset.edit))));
    body().querySelectorAll('[data-subs]').forEach(b => b.onclick = () => showSubs(list.find(a => a.id === Number(b.dataset.subs))));
    body().querySelectorAll('[data-del-star]').forEach(b => b.onclick = async () => {
      if (!confirm('이 기록을 삭제할까요?')) return;
      const { error } = await sb.from('star_sessions').delete().eq('id', b.dataset.delStar);
      error ? toast(errMsg(error), 'error') : TABS.tasks();
    });
  },

  // ------------------------------------------------------------ 실타래 기록
  async logs(pid = '') {
    await loadProfiles();
    let q = sb.from('thread_logs').select('*, profile:profiles(name, login_id)').order('id', { ascending: false }).limit(200);
    if (pid) q = q.eq('profile_id', pid);
    const { data } = await q;
    body().innerHTML = `<div class="card">
      <div class="row" style="margin-bottom:6px"><label class="field" style="max-width:280px"><span>캐릭터</span>
        <select class="input" id="lg-p"><option value="">전체</option>${profiles.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(nameOf(p))} (${p.threads})</option>`).join('')}</select></label></div>
      ${(data ?? []).length ? `<table class="table"><thead><tr><th>시각</th><th>캐릭터</th><th>내용</th><th>증감</th><th>잔액</th></tr></thead><tbody>${
        data.map(l => `<tr><td class="muted">${fmtDateTime(l.created_at)}</td><td>${esc(nameOf(l.profile))}</td><td>${esc(l.reason)}</td>
          <td class="delta ${l.delta > 0 ? 'plus' : 'minus'}">${l.delta > 0 ? '+' : ''}${l.delta}</td><td class="muted">${l.balance}</td></tr>`).join('')}</tbody></table>`
        : '<div class="muted">기록이 없습니다.</div>'}
      <p class="muted" style="font-size:12.5px">최근 200건까지 표시합니다.</p></div>`;
    document.getElementById('lg-p').onchange = e => TABS.logs(e.target.value);
  },

  // ------------------------------------------------------------ 전투
  async battles() {
    await loadProfiles();
    const { data: battles } = await sb.from('battles')
      .select('*, parties:battle_parties(side, team, name, members:battle_members(profile:profiles(name, login_id)))')
      .order('id', { ascending: false }).limit(30);

    const teams = teamNames();
    const pickBox = (side, team) => `
      <div class="picker-box">
        <div class="row">
          <label class="field"><span>${side}측 팀</span>
            <select class="input" id="team${side}">${teams.map(t => `<option ${t === team ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <label class="field"><span>파티 이름 (선택)</span><input class="input" id="pname${side}" placeholder="비우면 팀 이름"></label>
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
        <div class="picker">${pickBox(1, teams[0])}${pickBox(2, teams[1])}</div>
        <div style="margin-top:14px"><button class="btn" id="create">전투방 만들기</button></div>
      </div>
      <div class="card">
        <h3>전투 목록</h3>
        ${battles?.length ? `<table class="table"><thead><tr><th>#</th><th>방</th><th>대진</th><th>상태</th><th></th></tr></thead><tbody>${
          battles.map(b => {
            const ps = [...b.parties].sort((x, y) => x.side - y.side);
            const vs = ps.map(p => `${esc(p.name || p.team)} <small class="muted">(${p.members.map(m => esc(m.profile?.name || m.profile?.login_id)).join(', ')})</small>`).join(' vs ');
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
  const T = [['chars', '캐릭터'], ['posts', '안내글'], ['shop', '상점'], ['tasks', '과제'], ['logs', '실타래 기록'], ['battles', '전투'], ['schedule', '일정']];
  page.innerHTML = `
    <div class="page-head"><h1>관리</h1><span class="sub">관리자 전용</span></div>
    <div class="tabs scroll">${T.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="tab-body"></div>`;
  const go = k => {
    page.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.tab === k));
    history.replaceState(null, '', '#' + k);
    TABS[k]();
  };
  page.querySelectorAll('.tab').forEach(t => t.onclick = () => go(t.dataset.tab));
  go(TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'chars');
}
