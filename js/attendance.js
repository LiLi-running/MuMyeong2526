// 출석: 매일 06:00 ~ 20:00 (한국 시간), 실타래 10
import { sb, errMsg, toast } from './supabase.js';
import { renderLayout, setSideThreads } from './layout.js';
import { needLogin } from './ui.js';

const page = document.getElementById('page');
const me = await renderLayout();

if (!me) needLogin(page, '출석');
else init();

async function init() {
  // 서버의 한국 시간을 기준으로 시계를 맞춤 (내 컴퓨터 시계가 틀려도 상관없음)
  const { data: serverNow } = await sb.rpc('kst_now');
  const offset = new Date(serverNow).getTime() - Date.now();   // serverNow 는 시간대 없는 KST 문자열
  const kst = () => new Date(Date.now() + offset);

  const { data: rows } = await sb.from('attendance').select('day').eq('profile_id', me.id).order('day', { ascending: false });
  const days = new Set((rows ?? []).map(r => r.day));

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let view = kst(); view.setDate(1);

  page.innerHTML = `
    <div class="page-head"><h1>출석</h1><span class="sub">재난대비성약자양성소</span></div>
    <div class="two-col">
      <section class="card attend-card">
        <div class="label">현재 시각 (한국 시간)</div>
        <div class="clock" id="clock"></div>
        <div class="attend-rule">매일 <b>오전 6시 ~ 오후 8시</b> 출석 시 실타래 <b>10</b></div>
        <button class="btn big" id="btn-attend">출석하기</button>
        <div class="hint" id="attend-hint"></div>
        <div class="attend-stats">
          <div><div class="label">이번 달</div><div class="num" id="stat-month">0</div></div>
          <div><div class="label">누적</div><div class="num">${days.size}</div></div>
        </div>
      </section>
      <section class="card">
        <div class="cal-head"><h2 id="cal-title"></h2>
          <div class="cal-nav"><button class="btn ghost sm" id="prev">‹</button><button class="btn ghost sm" id="next">›</button></div></div>
        <div class="cal-grid mini" id="cal"></div>
      </section>
    </div>`;

  const btn = document.getElementById('btn-attend');
  const hint = document.getElementById('attend-hint');

  function tick() {
    const t = kst();
    document.getElementById('clock').textContent = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    const today = ymd(t);
    const mins = t.getHours() * 60 + t.getMinutes();
    const open = mins >= 360 && mins <= 1200;
    if (days.has(today)) { btn.disabled = true; btn.textContent = '오늘 출석 완료'; hint.textContent = '내일 다시 만나요.'; }
    else if (!open) { btn.disabled = true; btn.textContent = '출석 시간이 아닙니다'; hint.textContent = mins < 360 ? '오전 6시부터 출석할 수 있습니다.' : '오늘 출석 시간이 끝났습니다.'; }
    else { btn.disabled = false; btn.textContent = '출석하기'; hint.textContent = ''; }
  }

  function renderCal() {
    const y = view.getFullYear(), m = view.getMonth();
    document.getElementById('cal-title').textContent = `${y}년 ${m + 1}월`;
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0).getDate();
    const today = ymd(kst());
    let html = ['일', '월', '화', '수', '목', '금', '토'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < first.getDay(); i++) html += '<div class="cal-cell other"></div>';
    let cnt = 0;
    for (let d = 1; d <= last; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const on = days.has(key); if (on) cnt++;
      html += `<div class="cal-cell${key === today ? ' today' : ''}${on ? ' stamped' : ''}"><span class="cal-num">${d}</span>${on ? '<span class="stamp">✦</span>' : ''}</div>`;
    }
    document.getElementById('cal').innerHTML = html;
    const now = kst();
    if (y === now.getFullYear() && m === now.getMonth()) document.getElementById('stat-month').textContent = cnt;
  }

  document.getElementById('prev').onclick = () => { view.setMonth(view.getMonth() - 1); renderCal(); };
  document.getElementById('next').onclick = () => { view.setMonth(view.getMonth() + 1); renderCal(); };

  btn.onclick = async () => {
    btn.disabled = true;
    const { data, error } = await sb.rpc('attend');
    if (error) { toast(errMsg(error), 'error'); tick(); return; }
    days.add(data.day);
    setSideThreads(data.threads);
    toast(`출석 완료! 실타래 +${data.gained}`);
    tick(); renderCal();
  };

  tick(); renderCal();
  setInterval(tick, 1000);
}
