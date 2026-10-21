// 상점: 실타래로 아이템 구매 · 선물
import { sb, esc, errMsg, toast } from './supabase.js';
import { renderLayout, setSideThreads } from './layout.js';
import { needLogin, modal, nameOf, fmtDate } from './ui.js';

const page = document.getElementById('page');
const me = await renderLayout();
let threads = me?.threads ?? 0;
let others = [];

if (!me) needLogin(page, '상점');
else render();

async function render() {
  const [items, inv, gifts, profs, mine] = await Promise.all([
    sb.from('shop_items').select('*').eq('active', true).order('sort_order').order('id'),
    sb.from('inventory').select('qty, item:shop_items(id, name, image_url)').eq('profile_id', me.id),
    sb.from('gifts').select('*, item:shop_items(name), from:profiles!gifts_from_profile_fkey(name, login_id)').eq('to_profile', me.id).order('id', { ascending: false }).limit(10),
    sb.from('profiles').select('id, name, login_id, team, is_admin').order('name'),
    sb.from('profiles').select('threads').eq('id', me.id).single(),
  ]);
  threads = mine.data?.threads ?? threads;
  setSideThreads(threads);
  others = (profs.data ?? []).filter(p => p.id !== me.id && !p.is_admin);

  const thumb = (url, cls = 'item-img') => url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<div class="${cls} ph">✦</div>`;

  page.innerHTML = `
    <div class="page-head"><h1>상점</h1><span class="sub">재난대비성약자양성소</span>
      <span class="wallet">보유 실타래 <b>${threads}</b></span></div>
    ${(items.data ?? []).length ? `<div class="item-grid">${items.data.map(it => {
      const sold = it.stock !== null && it.stock <= 0;
      return `<div class="card item${sold ? ' sold' : ''}">
        ${thumb(it.image_url)}
        <div class="item-name">${esc(it.name)}</div>
        ${it.description ? `<div class="item-desc">${esc(it.description)}</div>` : ''}
        <div class="item-foot">
          <span class="price">실타래 <b>${it.price}</b></span>
          <span class="muted" style="font-size:12.5px">${it.stock === null ? '' : sold ? '품절' : `남은 ${it.stock}개`}</span>
        </div>
        <button class="btn block" data-buy="${it.id}" ${sold ? 'disabled' : ''}>${sold ? '품절' : '구매 · 선물'}</button>
      </div>`;
    }).join('')}</div>` : '<div class="card empty">판매 중인 아이템이 없습니다.</div>'}

    <div class="two-col" style="margin-top:24px">
      <section class="card"><h3>보유 아이템</h3>
        ${(inv.data ?? []).length ? `<div class="inv-list">${inv.data.map(r => `<div class="inv-row">
          ${thumb(r.item?.image_url, 'inv-img')}<span class="inv-name">${esc(r.item?.name)}</span><span class="muted">×${r.qty}</span>
          <button class="btn sm ghost" data-gift="${r.item?.id}" data-max="${r.qty}" data-name="${esc(r.item?.name)}">선물하기</button></div>`).join('')}</div>`
          : '<div class="muted">아직 보유한 아이템이 없습니다.</div>'}
      </section>
      <section class="card"><h3>받은 선물</h3>
        ${(gifts.data ?? []).length ? gifts.data.map(g => `<div class="gift-row">
          <div><b>${esc(nameOf(g.from))}</b>님이 <b>${esc(g.item?.name)}</b> ×${g.qty}<span class="muted" style="font-size:12px"> · ${fmtDate(g.created_at)}</span></div>
          ${g.message ? `<div class="gift-msg">“${esc(g.message)}”</div>` : ''}</div>`).join('') : '<div class="muted">받은 선물이 없습니다.</div>'}
      </section>
    </div>`;

  page.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => openBuy(items.data.find(i => i.id === Number(b.dataset.buy))));
  page.querySelectorAll('[data-gift]').forEach(b => b.onclick = () => openGift(Number(b.dataset.gift), b.dataset.name, Number(b.dataset.max)));
}

const recipientOptions = (withSelf) =>
  (withSelf ? `<option value="">나 (${esc(nameOf(me))})</option>` : '<option value="">받을 캐릭터 선택</option>')
  + others.map(p => `<option value="${p.id}">${esc(nameOf(p))}${p.team ? ' · ' + esc(p.team) : ''}</option>`).join('');

function openBuy(it) {
  const max = Math.min(99, it.stock ?? 99);
  const dlg = modal(it.name, `
    <label class="field"><span>수량</span><input class="input" type="number" id="b-qty" min="1" max="${max}" value="1"></label>
    <label class="field"><span>받는 사람</span><select class="input" id="b-to">${recipientOptions(true)}</select></label>
    <label class="field" id="b-msg-wrap" hidden><span>선물 메시지 (선택, 200자)</span><input class="input" id="b-msg" maxlength="200"></label>
    <div class="buy-sum">합계 <b id="b-total">${it.price}</b> / 보유 ${threads}</div>
    <button class="btn block" id="b-ok">구매</button>`);
  const qty = dlg.querySelector('#b-qty'), to = dlg.querySelector('#b-to'), ok = dlg.querySelector('#b-ok');
  const upd = () => {
    const total = it.price * (Number(qty.value) || 0);
    dlg.querySelector('#b-total').textContent = total;
    dlg.querySelector('#b-msg-wrap').hidden = !to.value;
    ok.textContent = to.value ? '구매해서 선물하기' : '구매';
    ok.disabled = total > threads || !(Number(qty.value) >= 1);
  };
  qty.oninput = upd; to.onchange = upd; upd();
  ok.onclick = async () => {
    ok.disabled = true;
    const { data, error } = await sb.rpc('buy_item', {
      p_item: it.id, p_qty: Number(qty.value), p_to: to.value || null, p_message: dlg.querySelector('#b-msg').value || null,
    });
    if (error) { ok.disabled = false; return toast(errMsg(error), 'error'); }
    toast(to.value ? '선물을 보냈습니다.' : '구매했습니다.');
    dlg.close();
    setSideThreads(data.threads);
    render();
  };
}

function openGift(itemId, name, maxQty) {
  const dlg = modal(`${name} 선물하기`, `
    <label class="field"><span>받는 사람</span><select class="input" id="g-to">${recipientOptions(false)}</select></label>
    <label class="field"><span>수량 (보유 ${maxQty}개)</span><input class="input" type="number" id="g-qty" min="1" max="${maxQty}" value="1"></label>
    <label class="field"><span>메시지 (선택, 200자)</span><input class="input" id="g-msg" maxlength="200"></label>
    <button class="btn block" id="g-ok">선물하기</button>`);
  dlg.querySelector('#g-ok').onclick = async (e) => {
    const to = dlg.querySelector('#g-to').value;
    if (!to) return toast('받을 캐릭터를 선택하세요.', 'error');
    e.target.disabled = true;
    const { error } = await sb.rpc('gift_item', {
      p_item: itemId, p_to: to, p_qty: Number(dlg.querySelector('#g-qty').value), p_message: dlg.querySelector('#g-msg').value || null,
    });
    if (error) { e.target.disabled = false; return toast(errMsg(error), 'error'); }
    toast('선물을 보냈습니다.');
    dlg.close();
    render();
  };
}
