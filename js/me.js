// 내 캐릭터: 실타래 · 아이템 · 출석 · 운세 · 과제 현황 · 비밀번호 변경
import { sb, esc, errMsg, toast, POSITION_LABEL } from './supabase.js';
import { renderLayout } from './layout.js';
import { needLogin, nameOf, fmtDate, fmtDateTime } from './ui.js';
import { LOGIN_EMAIL_DOMAIN } from './config.js';

const page = document.getElementById('page');
const me = await renderLayout();

if (!me) needLogin(page, '내 캐릭터');
else init();

async function init() {
  const { data: today } = await sb.rpc('kst_today');
  const monthStart = today.slice(0, 8) + '01';
  const [prof, att, fort, inv, gifts, logs, best, todayGames, subs] = await Promise.all([
    sb.from('profiles').select('*').eq('id', me.id).single(),
    sb.from('attendance').select('day').eq('profile_id', me.id).gte('day', monthStart),
    sb.from('fortunes').select('*').eq('profile_id', me.id).eq('day', today).maybeSingle(),
    sb.from('inventory').select('qty, item:shop_items(name, image_url)').eq('profile_id', me.id),
    sb.from('gifts').select('qty, message, created_at, item:shop_items(name), from:profiles!gifts_from_profile_fkey(name, login_id)').eq('to_profile', me.id).order('id', { ascending: false }).limit(5),
    sb.from('thread_logs').select('*').eq('profile_id', me.id).order('id', { ascending: false }).limit(15),
    sb.from('star_sessions').select('score').eq('profile_id', me.id).not('score', 'is', null).order('score', { ascending: false }).limit(1),
    sb.from('star_sessions').select('id').eq('profile_id', me.id).eq('rewarded', true).gte('submitted_at', new Date(`${today}T00:00:00+09:00`).toISOString()),
    sb.from('submissions').select('updated_at, assignment:assignments(id, title, ends_at)').eq('profile_id', me.id).order('updated_at', { ascending: false }),
  ]);
  const p = prof.data;
  const attendedToday = (att.data ?? []).some(r => r.day === today);

  page.innerHTML = `
    <div class="page-head"><h1>내 캐릭터</h1></div>
    <section class="card me-head">
      ${p.profile_image ? `<img class="me-img" src="${esc(p.profile_image)}" alt="">` : `<div class="me-img ph">${esc(nameOf(p).slice(0, 1))}</div>`}
      <div class="me-info">
        <div class="me-name">${esc(nameOf(p))}</div>
        <div class="char-meta">${esc(p.team ?? '소속 없음')} · ${POSITION_LABEL[p.position] ?? '포지션 없음'} · 아이디 ${esc(p.login_id)}</div>
        ${p.quote ? `<div class="char-quote">“${esc(p.quote)}”</div>` : ''}
      </div>
      <div class="me-threads"><div class="label">보유 실타래</div><div class="num">${p.threads}</div></div>
    </section>

    <div class="me-grid">
      <section class="card"><h3>출석</h3>
        <div class="kv"><span>오늘</span><b>${attendedToday ? '출석 완료' : '미출석'}</b></div>
        <div class="kv"><span>이번 달</span><b>${(att.data ?? []).length}일</b></div>
        ${attendedToday ? '' : '<a class="btn sm ghost" href="attendance.html">출석하러 가기</a>'}
      </section>
      <section class="card"><h3>오늘의 운세</h3>
        ${fort.data ? `<div class="kv"><span>${esc(fort.data.star)}</span><b>${esc(fort.data.grade_name)}</b></div>
          <p class="muted" style="font-size:13.5px;margin:6px 0 0">${esc(fort.data.message)}</p>`
          : '<div class="muted" style="margin-bottom:8px">아직 보지 않았습니다.</div><a class="btn sm ghost" href="fortune.html">운세 보기</a>'}
      </section>
      <section class="card"><h3>과제 현황</h3>
        <div class="kv"><span>별 잡기 최고 기록</span><b>${best.data?.[0]?.score ?? '—'}</b></div>
        <div class="kv"><span>오늘 남은 보상</span><b>${Math.max(0, 3 - (todayGames.data ?? []).length)} / 3판</b></div>
        <div class="label" style="margin-top:10px">기간 과제 제출</div>
        ${(subs.data ?? []).length ? subs.data.map(s => `<div class="kv"><a href="tasks.html#period/${s.assignment?.id}">${esc(s.assignment?.title)}</a><span class="muted">${fmtDate(s.updated_at)}</span></div>`).join('') : '<div class="muted">제출한 과제가 없습니다.</div>'}
      </section>
      <section class="card"><h3>보유 아이템</h3>
        ${(inv.data ?? []).length ? inv.data.map(r => `<div class="kv"><span>${esc(r.item?.name)}</span><b>×${r.qty}</b></div>`).join('') : '<div class="muted">보유한 아이템이 없습니다.</div>'}
        <a class="btn sm ghost" href="shop.html" style="margin-top:8px">상점</a>
      </section>
      <section class="card"><h3>받은 선물</h3>
        ${(gifts.data ?? []).length ? gifts.data.map(g => `<div class="gift-row"><div><b>${esc(nameOf(g.from))}</b> · ${esc(g.item?.name)} ×${g.qty} <span class="muted" style="font-size:12px">${fmtDate(g.created_at)}</span></div>${g.message ? `<div class="gift-msg">“${esc(g.message)}”</div>` : ''}</div>`).join('') : '<div class="muted">받은 선물이 없습니다.</div>'}
      </section>
      <section class="card"><h3>비밀번호 변경</h3>
        <form id="pw-form">
          <label class="field"><span>현재 비밀번호</span><input class="input" type="password" name="cur" autocomplete="current-password" required></label>
          <label class="field"><span>새 비밀번호 (8자 이상 권장)</span><input class="input" type="password" name="pw" autocomplete="new-password" minlength="6" required></label>
          <label class="field"><span>새 비밀번호 확인</span><input class="input" type="password" name="pw2" autocomplete="new-password" required></label>
          <button class="btn">변경</button>
        </form>
      </section>
    </div>

    <section class="card" style="margin-top:18px"><h3>실타래 기록</h3>
      ${(logs.data ?? []).length ? `<table class="table"><tbody>${logs.data.map(l => `<tr>
        <td class="muted" style="width:140px">${fmtDateTime(l.created_at)}</td><td>${esc(l.reason)}</td>
        <td class="delta ${l.delta > 0 ? 'plus' : 'minus'}">${l.delta > 0 ? '+' : ''}${l.delta}</td><td class="muted" style="text-align:right">${l.balance}</td></tr>`).join('')}</tbody></table>`
        : '<div class="muted">기록이 없습니다.</div>'}
    </section>`;

  document.getElementById('pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector('button');
    if (f.pw.value !== f.pw2.value) return toast('새 비밀번호가 서로 다릅니다.', 'error');
    if (f.pw.value.length < 6) return toast('비밀번호는 6자 이상이어야 합니다.', 'error');
    btn.disabled = true;
    // 현재 비밀번호 확인
    const { error: e1 } = await sb.auth.signInWithPassword({ email: `${p.login_id}@${LOGIN_EMAIL_DOMAIN}`, password: f.cur.value });
    if (e1) { btn.disabled = false; return toast('현재 비밀번호가 올바르지 않습니다.', 'error'); }
    const { error: e2 } = await sb.auth.updateUser({ password: f.pw.value });
    btn.disabled = false;
    if (e2) return toast(errMsg(e2), 'error');
    f.reset();
    toast('비밀번호를 변경했습니다.');
  };
}
