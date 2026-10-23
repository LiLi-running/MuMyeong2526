import { sb, login, esc, toast } from './supabase.js';
import { renderLayout } from './layout.js';
import { LINKS } from './config.js';

const me = await renderLayout();

document.getElementById('link-twitter').href = LINKS.twitter;
document.getElementById('link-apply').href = LINKS.application;

// ---------- 로그인 상자 ----------
const authBox = document.getElementById('auth-box');
if (me) {
  authBox.classList.add('welcome');
  authBox.innerHTML = `
    <div class="label">어서 오세요</div>
    <div class="who">${esc(me.name || me.login_id)}</div>
    <div class="muted" style="font-size:14px">보유 실타래 <b style="color:var(--gold)">${me.threads}</b></div>`;
} else {
  authBox.innerHTML = `
    <h2>로그인</h2>
    <form id="login-form">
      <label class="field"><span>아이디</span><input class="input" name="id" autocomplete="username" required></label>
      <label class="field"><span>비밀번호</span><input class="input" name="pw" type="password" autocomplete="current-password" required></label>
      <button class="btn block" type="submit">로그인</button>
    </form>
    <p class="login-note">로그인하면 <a href="policy.html">개인정보 수집 · 이용 안내</a>에 동의한 것으로 봅니다.</p>`;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await login(f.id.value, f.pw.value);
      location.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ---------- 달력 ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 오늘 날짜는 항상 한국 시간 기준
const kstToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = t => t ? t.slice(0, 5) : '';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
let view = new Date(kstToday() + 'T00:00:00'); view.setDate(1);

function evLabel(ev, key) {
  // 시작일 칸에만 시작 시간을 붙임
  const t = key === ev.starts_on && ev.start_time ? `<b>${hm(ev.start_time)}</b> ` : '';
  return t + esc(ev.title);
}
function evTitle(ev) {
  const range = `${ev.starts_on}${ev.start_time ? ' ' + hm(ev.start_time) : ''}`
    + (ev.ends_on && ev.ends_on !== ev.starts_on ? ` ~ ${ev.ends_on}${ev.end_time ? ' ' + hm(ev.end_time) : ''}` : ev.end_time ? ` ~ ${hm(ev.end_time)}` : '');
  return `${range}  ${ev.title}${ev.note ? ' — ' + ev.note : ''}`;
}

async function renderCalendar() {
  const y = view.getFullYear(), m = view.getMonth();
  document.getElementById('cal-title').textContent = `${y}년 ${m + 1}월`;

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 41);

  const { data: events } = await sb.from('schedules')
    .select('*')
    .lte('starts_on', ymd(end))
    .order('starts_on').order('start_time', { nullsFirst: true });
  const list = (events ?? []).filter(ev => (ev.ends_on ?? ev.starts_on) >= ymd(start));

  const today = kstToday();
  const dows = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');
  let cells = '';
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d);
    const evs = list.filter(ev => ev.starts_on <= key && (ev.ends_on ?? ev.starts_on) >= key);
    cells += `<div class="cal-cell${d.getMonth() !== m ? ' other' : ''}${key === today ? ' today' : ''}">
      <span class="cal-num">${d.getDate()}</span>
      ${evs.map(ev => `<span class="cal-ev${ev.ends_on && ev.ends_on !== ev.starts_on ? ' span' : ''}" title="${esc(evTitle(ev))}">${evLabel(ev, key)}</span>`).join('')}
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML = dows + cells;
}

// ---------- 다가오는 일정 (가까운 순) ----------
async function renderUpcoming() {
  const today = kstToday();
  const { data, error } = await sb.from('schedules').select('*')
    .or(`ends_on.gte.${today},and(ends_on.is.null,starts_on.gte.${today})`)
    .order('starts_on').order('start_time', { nullsFirst: true })
    .limit(8);
  const box = document.getElementById('upcoming');
  if (error || !(data ?? []).length) { box.textContent = '예정된 일정이 없습니다.'; return; }

  const dayDiff = d => Math.round((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5);
  box.classList.remove('muted');
  box.innerHTML = data.map(ev => {
    const d = new Date(ev.starts_on + 'T00:00:00');
    const diff = dayDiff(ev.starts_on);
    const badge = diff < 0 ? '<span class="up-badge on">진행 중</span>'
      : diff === 0 ? '<span class="up-badge on">오늘</span>'
      : `<span class="up-badge">D-${diff}</span>`;
    const multi = ev.ends_on && ev.ends_on !== ev.starts_on;
    const endTxt = multi ? ` ~ ${Number(ev.ends_on.slice(5, 7))}.${Number(ev.ends_on.slice(8))}${ev.end_time ? ' ' + hm(ev.end_time) : ''}`
      : ev.end_time ? ` ~ ${hm(ev.end_time)}` : '';
    return `<button type="button" class="up-item" data-ym="${ev.starts_on.slice(0, 7)}" title="${esc(evTitle(ev))}">
      <span class="up-date"><b>${d.getMonth() + 1}.${d.getDate()}</b><small>${DOW[d.getDay()]}</small></span>
      <span class="up-body"><span class="up-title">${esc(ev.title)}</span>
        <span class="up-time">${ev.start_time ? hm(ev.start_time) : '하루 종일'}${endTxt}</span></span>
      ${badge}
    </button>`;
  }).join('');
  // 누르면 달력이 그 달로 이동
  box.querySelectorAll('.up-item').forEach(b => b.onclick = () => {
    view = new Date(b.dataset.ym + '-01T00:00:00'); renderCalendar();
  });
}

document.getElementById('cal-prev').onclick = () => { view.setMonth(view.getMonth() - 1); renderCalendar(); };
document.getElementById('cal-next').onclick = () => { view.setMonth(view.getMonth() + 1); renderCalendar(); };
document.getElementById('cal-today').onclick = () => { view = new Date(kstToday() + 'T00:00:00'); view.setDate(1); renderCalendar(); };
renderCalendar();
renderUpcoming();
