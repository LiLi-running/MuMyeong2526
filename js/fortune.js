// 운세: 하루 1번 별의 흐름을 읽고 실타래 0~5
import { sb, esc, errMsg, toast } from './supabase.js';
import { renderLayout, setSideThreads } from './layout.js';
import { needLogin, fmtDate } from './ui.js';

const page = document.getElementById('page');
const me = await renderLayout();

if (!me) needLogin(page, '운세');
else init();

function skyStars(n = 70) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const size = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1;
    s += `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:${(Math.random() * 3).toFixed(2)}s"></i>`;
  }
  return s;
}

function resultHtml(f) {
  const dots = [0, 1, 2, 3, 4, 5].map(i => `<span class="${i < f.grade ? 'on' : ''}">✦</span>`).join('');
  return `<div class="fortune-result">
    <div class="fr-label">오늘의 별</div>
    <div class="fr-star">${esc(f.star)}</div>
    <div class="fr-grade">${esc(f.grade_name)}</div>
    <div class="fr-dots">${dots}</div>
    <p class="fr-msg">${esc(f.message)}</p>
    <div class="fr-reward">${f.threads > 0 ? `실타래 <b>+${f.threads}</b>` : '오늘은 실타래가 없습니다'}</div>
  </div>`;
}

async function init() {
  const { data: today } = await sb.rpc('kst_today');
  const { data: hist } = await sb.from('fortunes').select('*').eq('profile_id', me.id).order('day', { ascending: false }).limit(8);
  const todays = (hist ?? []).find(f => f.day === today);
  const past = (hist ?? []).filter(f => f.day !== today).slice(0, 7);

  page.innerHTML = `
    <div class="page-head"><h1>운세</h1><span class="sub">하루 한 번, 별의 흐름을 읽습니다</span></div>
    <section class="sky" id="sky">
      <div class="sky-stars">${skyStars()}</div>
      <div class="sky-inner" id="sky-inner">
        ${todays ? resultHtml(todays) : `
          <p class="sky-intro">오늘 밤하늘의 흐름을 읽어 보세요.<br>운세에 따라 실타래를 0~5개 얻습니다.</p>
          <button class="btn sky-btn" id="btn-draw">별의 흐름 보기</button>`}
      </div>
    </section>
    ${past.length ? `<section class="card" style="margin-top:20px"><h3>지난 운세</h3>
      <table class="table"><tbody>${past.map(f => `<tr><td class="muted" style="width:110px">${fmtDate(f.day)}</td>
        <td>${esc(f.star)} · ${esc(f.grade_name)}</td><td class="muted">${esc(f.message)}</td><td style="text-align:right">+${f.threads}</td></tr>`).join('')}</tbody></table></section>` : ''}`;

  const btn = document.getElementById('btn-draw');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    const sky = document.getElementById('sky');
    sky.classList.add('reading');
    const inner = document.getElementById('sky-inner');
    inner.innerHTML = `<p class="sky-intro reading-text">별의 흐름을 읽는 중…</p>`;
    const [{ data, error }] = await Promise.all([sb.rpc('draw_fortune'), new Promise(r => setTimeout(r, 1800))]);
    sky.classList.remove('reading');
    if (error) { toast(errMsg(error), 'error'); inner.innerHTML = '<p class="sky-intro">잠시 후 다시 시도해 주세요.</p>'; return; }
    inner.innerHTML = resultHtml(data);
    inner.firstElementChild.classList.add('reveal');
    if (data.threads > 0) {
      const { data: p } = await sb.from('profiles').select('threads').eq('id', me.id).single();
      setSideThreads(p?.threads);
    }
  };
}
