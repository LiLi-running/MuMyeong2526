// 과제: 상시 과제(별 잡기) · 기간 과제(글 + 그림 제출)
import { sb, esc, errMsg, toast } from './supabase.js';
import { renderLayout, setSideThreads } from './layout.js';
import { needLogin, md, uploadImage, fmtDateTime } from './ui.js';

const page = document.getElementById('page');
const me = await renderLayout();
const body = () => document.getElementById('tab-body');
let game = null;

if (!me) needLogin(page, '과제');
else {
  page.innerHTML = `
    <div class="page-head"><h1>과제</h1><span class="sub">재난대비성약자양성소</span></div>
    <div class="tabs">
      <button class="tab" data-tab="always">상시 과제</button>
      <button class="tab" data-tab="period">기간 과제</button>
    </div>
    <div id="tab-body"></div>`;
  const go = t => {
    page.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
    if (!location.hash.startsWith(`#${t}`)) history.replaceState(null, '', `#${t}`);
    (t === 'period' ? renderPeriod : renderAlways)();
  };
  page.querySelectorAll('.tab').forEach(x => x.onclick = () => go(x.dataset.tab));
  go(location.hash.startsWith('#period') ? 'period' : 'always');
}

// =====================================================================
//  상시 과제 — 별 잡기
// =====================================================================
async function renderAlways() {
  body().innerHTML = `
    <div class="game-layout">
      <section>
        <div class="stage" id="stage">
          <div class="stage-hud"><span>점수 <b id="hud-score">0</b></span><span id="hud-time">30.0</span></div>
          <div class="stage-field" id="field"></div>
          <div class="stage-overlay" id="overlay"></div>
        </div>
      </section>
      <aside class="side-stack">
        <div class="card"><h3>내 기록</h3><div id="my-stats" class="muted">불러오는 중…</div></div>
        <div class="card"><h3>순위표</h3><div id="ranking" class="muted">불러오는 중…</div></div>
      </aside>
    </div>`;
  showIdle();
  loadStats();
}

function showIdle() {
  document.getElementById('overlay').innerHTML = `
    <div class="ov-box">
      <div class="ov-title">별 잡기</div>
      <p>30초 동안 나타났다 사라지는 별을 클릭하세요.<br>
      <span class="star-ex">✦</span> 1점 · <span class="star-ex gold">✦</span> 밝은 별 3점</p>
      <p class="muted" style="font-size:13px">10점마다 실타래 1개 (최대 5개) · 하루 3판까지 보상 · 기록은 계속 순위표에 남습니다</p>
      <button class="btn sky-btn" id="btn-start">시작</button>
    </div>`;
  document.getElementById('overlay').hidden = false;
  document.getElementById('btn-start').onclick = startGame;
}

async function loadStats() {
  const [{ data: rank }, { data: mine }, { data: today }] = await Promise.all([
    sb.rpc('star_ranking', { p_limit: 20 }),
    sb.from('star_sessions').select('score, rewarded, submitted_at').eq('profile_id', me.id).not('score', 'is', null).order('score', { ascending: false }).limit(1),
    sb.rpc('kst_today'),
  ]);
  const { data: todays } = await sb.from('star_sessions').select('rewarded, submitted_at').eq('profile_id', me.id).eq('rewarded', true)
    .gte('submitted_at', new Date(`${today}T00:00:00+09:00`).toISOString());
  const used = (todays ?? []).length;
  const best = mine?.[0]?.score;
  const myRank = (rank ?? []).find(r => r.profile_id === me.id)?.rank;
  document.getElementById('my-stats').innerHTML = `
    <div class="kv"><span>최고 기록</span><b>${best ?? '—'}${best !== undefined ? '점' : ''}</b></div>
    <div class="kv"><span>순위</span><b>${myRank ? myRank + '위' : '—'}</b></div>
    <div class="kv"><span>오늘 남은 보상</span><b>${Math.max(0, 3 - used)} / 3판</b></div>`;
  document.getElementById('ranking').innerHTML = (rank ?? []).length
    ? `<table class="table rank"><tbody>${rank.map(r => `<tr${r.profile_id === me.id ? ' class="me"' : ''}>
        <td class="r-no">${r.rank}</td><td>${esc(r.name)}<small class="muted"> ${esc(r.team ?? '')}</small></td><td class="r-score">${r.best}</td></tr>`).join('')}</tbody></table>`
    : '<div class="muted">아직 기록이 없습니다.</div>';
}

async function startGame() {
  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  const { data, error } = await sb.rpc('start_star_game');
  if (error) { btn.disabled = false; return toast(errMsg(error), 'error'); }
  game = { session: data.session, stars: data.stars, duration: data.duration, hits: [], score: 0, idx: 0, live: new Map() };
  document.getElementById('hud-score').textContent = '0';
  document.getElementById('field').innerHTML = '';

  const ov = document.getElementById('overlay');
  for (const n of [3, 2, 1]) {
    ov.innerHTML = `<div class="countdown">${n}</div>`;
    await new Promise(r => setTimeout(r, 700));
  }
  ov.hidden = true;
  game.t0 = performance.now();
  requestAnimationFrame(frame);
}

function frame() {
  if (!game) return;
  const now = performance.now() - game.t0;
  const field = document.getElementById('field');
  if (!field) { game = null; return; }

  // 등장
  while (game.idx < game.stars.length && game.stars[game.idx].t <= now) {
    const s = game.stars[game.idx++];
    const el = document.createElement('button');
    el.className = 'star' + (s.p > 1 ? ' bright' : '');
    el.style.left = s.x + '%';
    el.style.top = s.y + '%';
    el.style.setProperty('--life', s.life + 'ms');
    el.setAttribute('aria-label', '별');
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!game || el.dataset.hit) return;
      el.dataset.hit = '1';
      game.hits.push({ id: s.id, at: Math.round(performance.now() - game.t0) });
      game.score += s.p;
      document.getElementById('hud-score').textContent = game.score;
      el.classList.add('pop');
      if (s.p > 1) { const f = document.createElement('span'); f.className = 'float'; f.textContent = '+3'; f.style.left = s.x + '%'; f.style.top = s.y + '%'; field.appendChild(f); setTimeout(() => f.remove(), 700); }
      setTimeout(() => el.remove(), 250);
      game.live.delete(s.id);
    });
    field.appendChild(el);
    game.live.set(s.id, { el, end: s.t + s.life });
  }
  // 소멸
  for (const [id, v] of game.live) {
    if (now > v.end) { v.el.classList.add('fade'); setTimeout(() => v.el.remove(), 200); game.live.delete(id); }
  }
  document.getElementById('hud-time').textContent = Math.max(0, (game.duration - now) / 1000).toFixed(1);

  if (now >= game.duration) return endGame();
  requestAnimationFrame(frame);
}

async function endGame() {
  const g = game; game = null;
  const ov = document.getElementById('overlay');
  ov.hidden = false;
  ov.innerHTML = `<div class="ov-box"><div class="ov-title">기록 확인 중…</div></div>`;
  // 서버가 30초 경과를 확인하므로 아주 잠깐 여유를 둠
  await new Promise(r => setTimeout(r, 400));
  const { data, error } = await sb.rpc('submit_star_game', { p_session: g.session, p_hits: g.hits });
  if (error) {
    ov.innerHTML = `<div class="ov-box"><div class="ov-title">제출 실패</div><p>${esc(errMsg(error))}</p><button class="btn sky-btn" id="btn-again">다시 하기</button></div>`;
  } else {
    ov.innerHTML = `<div class="ov-box">
      <div class="ov-label">이번 기록</div>
      <div class="ov-score">${data.score}<small>점</small></div>
      <p>${data.rewarded ? (data.reward > 0 ? `실타래 <b>+${data.reward}</b>` : '10점 이상부터 실타래를 받을 수 있습니다') : '오늘 보상은 모두 받았습니다 (기록은 저장됨)'}</p>
      <p class="muted" style="font-size:13px">최고 기록 ${data.best}점 · ${data.rank}위 · 오늘 남은 보상 ${data.rewards_left}판</p>
      <button class="btn sky-btn" id="btn-again">다시 하기</button></div>`;
    if (data.reward > 0) {
      const { data: p } = await sb.from('profiles').select('threads').eq('id', me.id).single();
      setSideThreads(p?.threads);
    }
    loadStats();
  }
  document.getElementById('btn-again').onclick = showIdle;
}

// =====================================================================
//  기간 과제
// =====================================================================
function statusOf(a) {
  const now = Date.now();
  if (now < new Date(a.starts_at)) return ['upcoming', '예정'];
  if (now > new Date(a.ends_at)) return ['closed', '마감'];
  return ['open', '진행 중'];
}

async function renderPeriod() {
  const id = Number(location.hash.split('/')[1]) || null;
  if (id) return renderAssignment(id);

  const [{ data: list }, { data: subs }] = await Promise.all([
    sb.from('assignments').select('*').order('ends_at', { ascending: false }),
    sb.from('submissions').select('assignment_id, updated_at').eq('profile_id', me.id),
  ]);
  const done = new Map((subs ?? []).map(s => [s.assignment_id, s]));
  const order = { open: 0, upcoming: 1, closed: 2 };
  const rows = (list ?? []).sort((a, b) => order[statusOf(a)[0]] - order[statusOf(b)[0]]);

  body().innerHTML = rows.length ? `<div class="assign-list">${rows.map(a => {
    const [st, label] = statusOf(a);
    return `<a class="card assign ${st}" href="#period/${a.id}">
      <div class="as-top"><span class="status ${st === 'open' ? 'active' : ''}">${label}</span>
        ${done.has(a.id) ? '<span class="status mine">제출함</span>' : ''}</div>
      <div class="as-title">${esc(a.title)}</div>
      <div class="as-meta">${fmtDateTime(a.starts_at)} ~ ${fmtDateTime(a.ends_at)}${a.reward ? ` · 실타래 ${a.reward}` : ''}</div>
    </a>`;
  }).join('')}</div>` : '<div class="card empty">등록된 기간 과제가 없습니다.</div>';
  body().querySelectorAll('a.assign').forEach(a => a.onclick = (e) => { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); renderPeriod(); });
}

async function renderAssignment(id) {
  const [{ data: a }, { data: sub }] = await Promise.all([
    sb.from('assignments').select('*').eq('id', id).maybeSingle(),
    sb.from('submissions').select('*').eq('assignment_id', id).eq('profile_id', me.id).maybeSingle(),
  ]);
  if (!a) { body().innerHTML = '<div class="card empty">과제를 찾을 수 없습니다.</div>'; return; }
  const [st, label] = statusOf(a);
  let image = sub?.image_url ?? '';

  body().innerHTML = `
    <p><a href="#period" id="back">← 기간 과제 목록</a></p>
    <article class="card article">
      <div class="as-top"><span class="status ${st === 'open' ? 'active' : ''}">${label}</span>${sub ? '<span class="status mine">제출함</span>' : ''}</div>
      <h2 class="article-title">${esc(a.title)}</h2>
      <div class="article-meta">${fmtDateTime(a.starts_at)} ~ ${fmtDateTime(a.ends_at)}${a.reward ? ` · 첫 제출 시 실타래 ${a.reward}` : ''}</div>
      <div class="prose">${md(a.description)}</div>
    </article>
    <section class="card" style="margin-top:18px">
      <h3>${st === 'open' ? (sub ? '제출물 수정' : '제출하기') : '내 제출물'}</h3>
      ${st === 'upcoming' ? '<div class="muted">아직 제출 기간이 아닙니다.</div>' : st === 'closed' && !sub ? '<div class="muted">제출하지 않은 과제입니다.</div>' : `
        <label class="field"><span>글 <em class="muted" id="cnt"></em></span>
          <textarea class="input" id="s-body" rows="16" ${st !== 'open' ? 'readonly' : ''}>${esc(sub?.body ?? '')}</textarea></label>
        <div class="field"><span class="label">그림 1장${a.require_image ? ' (필수)' : ' (선택)'}</span>
          <div class="upload-box" id="img-box"></div></div>
        ${st === 'open' ? `<button class="btn" id="s-ok">${sub ? '수정해서 다시 제출' : '제출'}</button>
          <span class="hint" style="margin-left:10px">마감 전까지 몇 번이든 수정할 수 있습니다.</span>` : ''}
        ${sub ? `<div class="hint">마지막 제출 ${fmtDateTime(sub.updated_at)}</div>` : ''}`}
    </section>`;

  document.getElementById('back').onclick = (e) => { e.preventDefault(); history.replaceState(null, '', '#period'); renderPeriod(); };
  const ta = document.getElementById('s-body');
  if (!ta) return;
  const cnt = () => document.getElementById('cnt').textContent = `${ta.value.length.toLocaleString()}자`;
  ta.oninput = cnt; cnt();

  const box = document.getElementById('img-box');
  const drawImg = () => {
    box.innerHTML = (image ? `<img src="${esc(image)}" alt="" class="upload-preview">` : '<div class="muted">첨부한 그림이 없습니다.</div>')
      + (st === 'open' ? `<label class="btn ghost sm">${image ? '그림 바꾸기' : '그림 올리기'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>` : '');
    const input = box.querySelector('input');
    if (input) input.onchange = async () => {
      if (!input.files[0]) return;
      box.querySelector('label').textContent = '올리는 중…';
      try { image = await uploadImage(input.files[0]); } catch (e) { toast(e.message, 'error'); }
      drawImg();
    };
  };
  drawImg();

  const ok = document.getElementById('s-ok');
  if (ok) ok.onclick = async () => {
    ok.disabled = true;
    const { data, error } = await sb.rpc('submit_assignment', { p_assignment: id, p_body: ta.value, p_image_url: image || null });
    ok.disabled = false;
    if (error) return toast(errMsg(error), 'error');
    toast(data.reward ? `제출했습니다! 실타래 +${data.reward}` : '제출했습니다.');
    if (data.reward) {
      const { data: p } = await sb.from('profiles').select('threads').eq('id', me.id).single();
      setSideThreads(p?.threads);
    }
    renderAssignment(id);
  };
}
