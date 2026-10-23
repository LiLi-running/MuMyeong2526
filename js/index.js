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
let view = new Date(); view.setDate(1);

async function renderCalendar() {
  const y = view.getFullYear(), m = view.getMonth();
  document.getElementById('cal-title').textContent = `${y}년 ${m + 1}월`;

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 41);

  const { data: events } = await sb.from('schedules')
    .select('*')
    .lte('starts_on', ymd(end))
    .order('starts_on');
  const list = (events ?? []).filter(ev => (ev.ends_on ?? ev.starts_on) >= ymd(start));

  const today = ymd(new Date());
  const dows = ['일', '월', '화', '수', '목', '금', '토'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  let cells = '';
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d);
    const evs = list.filter(ev => ev.starts_on <= key && (ev.ends_on ?? ev.starts_on) >= key);
    cells += `<div class="cal-cell${d.getMonth() !== m ? ' other' : ''}${key === today ? ' today' : ''}">
      <span class="cal-num">${d.getDate()}</span>
      ${evs.map(ev => `<span class="cal-ev${ev.ends_on && ev.ends_on !== ev.starts_on ? ' span' : ''}" title="${esc(ev.title)}${ev.note ? ' — ' + esc(ev.note) : ''}">${esc(ev.title)}</span>`).join('')}
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML = dows + cells;
}

document.getElementById('cal-prev').onclick = () => { view.setMonth(view.getMonth() - 1); renderCalendar(); };
document.getElementById('cal-next').onclick = () => { view.setMonth(view.getMonth() + 1); renderCalendar(); };
document.getElementById('cal-today').onclick = () => { view = new Date(); view.setDate(1); renderCalendar(); };
renderCalendar();
