// 명단: 등록된 캐릭터 프로필
import { sb, esc, errMsg, toast, POSITION_LABEL } from './supabase.js';
import { renderLayout } from './layout.js';
import { needLogin, modal, md, nameOf } from './ui.js';

const page = document.getElementById('page');
const me = await renderLayout();

if (!me) needLogin(page, '명단');
else init();

async function init() {
  const { data, error } = await sb.from('profiles')
    .select('id, login_id, name, team, position, profile_image, quote, bio, sort_order, is_admin')
    .order('sort_order').order('name');
  if (error) return toast(errMsg(error), 'error');
  // 관리자 계정은 명단에서 제외
  const chars = (data ?? []).filter(p => !p.is_admin);
  const teams = [...new Set(chars.map(c => c.team).filter(Boolean))];
  let filter = '';

  page.innerHTML = `
    <div class="page-head"><h1>명단</h1><span class="sub">${chars.length}명</span></div>
    <div class="chips" id="chips"></div>
    <div class="char-grid" id="grid"></div>`;

  const draw = () => {
    document.getElementById('chips').innerHTML = ['', ...teams].map(t =>
      `<button class="chip${t === filter ? ' on' : ''}" data-t="${esc(t)}">${t ? esc(t) : '전체'}</button>`).join('');
    document.querySelectorAll('.chip').forEach(c => c.onclick = () => { filter = c.dataset.t; draw(); });
    const list = chars.filter(c => !filter || c.team === filter);
    document.getElementById('grid').innerHTML = list.length ? list.map(c => `
      <button class="card char" data-id="${c.id}">
        ${c.profile_image ? `<img class="char-img" src="${esc(c.profile_image)}" alt="" loading="lazy">` : `<div class="char-img ph">${esc(nameOf(c).slice(0, 1))}</div>`}
        <div class="char-name">${esc(nameOf(c))}</div>
        <div class="char-meta">${esc(c.team ?? '')}${c.team && c.position ? ' · ' : ''}${POSITION_LABEL[c.position] ?? ''}</div>
        ${c.quote ? `<div class="char-quote">“${esc(c.quote)}”</div>` : ''}
      </button>`).join('') : '<div class="card empty" style="grid-column:1/-1">등록된 캐릭터가 없습니다.</div>';
    document.querySelectorAll('.char').forEach(el => el.onclick = () => open(chars.find(c => c.id === el.dataset.id)));
  };

  const open = c => modal(nameOf(c), `
    <div class="char-detail${c.profile_image ? '' : ' noimg'}">
      ${c.profile_image ? `<img class="cd-img" src="${esc(c.profile_image)}" alt="">` : ''}
      <div>
        <div class="char-meta" style="margin-bottom:8px">${esc(c.team ?? '소속 없음')} · ${POSITION_LABEL[c.position] ?? '포지션 없음'}</div>
        ${c.quote ? `<p class="char-quote">“${esc(c.quote)}”</p>` : ''}
        <div class="prose">${c.bio ? md(c.bio) : '<p class="muted">소개가 아직 없습니다.</p>'}</div>
      </div>
    </div>`, { wide: true });

  draw();
}
