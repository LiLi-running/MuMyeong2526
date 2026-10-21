// 커뮤니티 안내: 공지사항 · 세계관 · 캐릭터 가이드 · 시스템 (로그인 없이 열람 가능)
import { sb, esc, errMsg, toast } from './supabase.js';
import { renderLayout } from './layout.js';
import { md, fmtDate } from './ui.js';

export const CATS = { notice: '공지사항', world: '세계관', guide: '캐릭터 가이드', system: '시스템' };

const page = document.getElementById('page');
await renderLayout();

const params = new URLSearchParams(location.search);
const cat = CATS[params.get('c')] ? params.get('c') : 'notice';
const postId = Number(params.get('id')) || null;
document.title = `${CATS[cat]} · 무명의 유산`;

let query = sb.from('posts').select('id, title, pinned, sort_order, created_at, updated_at, published').eq('category', cat);
query = cat === 'notice'
  ? query.order('pinned', { ascending: false }).order('created_at', { ascending: false })
  : query.order('sort_order').order('id');
const { data: list, error } = await query;
if (error) toast(errMsg(error), 'error');
const posts = list ?? [];

async function loadBody(id) {
  const { data } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
  return data;
}

function article(p) {
  return `<article class="card article">
    <h2 class="article-title">${esc(p.title)}${p.published ? '' : ' <span class="tag">비공개</span>'}</h2>
    <div class="article-meta">${fmtDate(p.created_at)}${p.updated_at && fmtDate(p.updated_at) !== fmtDate(p.created_at) ? ` · 수정 ${fmtDate(p.updated_at)}` : ''}</div>
    <div class="prose">${md(p.body)}</div>
  </article>`;
}

const head = `<div class="page-head"><h1>${CATS[cat]}</h1></div>`;

if (!posts.length) {
  page.innerHTML = head + `<div class="card empty">아직 등록된 글이 없습니다.</div>`;
} else if (cat === 'notice') {
  // 공지사항: 목록 → 글
  if (postId) {
    const p = await loadBody(postId);
    page.innerHTML = head + (p ? article(p) : '<div class="card empty">글을 찾을 수 없습니다.</div>')
      + `<p><a class="btn ghost" href="guide.html?c=notice">← 목록으로</a></p>`;
  } else {
    page.innerHTML = head + `<div class="card"><table class="table notice-list">
      <tbody>${posts.map(p => `<tr${p.pinned ? ' class="pinned"' : ''}>
        <td class="nl-pin">${p.pinned ? '<span class="tag gold">공지</span>' : ''}</td>
        <td><a href="guide.html?c=notice&id=${p.id}">${esc(p.title)}</a>${p.published ? '' : ' <span class="tag">비공개</span>'}</td>
        <td class="nl-date">${fmtDate(p.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }
} else {
  // 세계관 · 가이드 · 시스템: 목차 + 본문
  const current = posts.find(p => p.id === postId) ?? posts[0];
  const p = await loadBody(current.id);
  page.innerHTML = head + `<div class="doc-layout">
    <nav class="card toc">${posts.map(x => `<a class="toc-link${x.id === current.id ? ' active' : ''}" href="guide.html?c=${cat}&id=${x.id}">${esc(x.title)}</a>`).join('')}</nav>
    <div>${p ? article(p) : ''}</div>
  </div>`;
}
