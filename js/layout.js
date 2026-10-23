// 모든 페이지 공통: 왼쪽 고정 메뉴
import { currentProfile, logout, esc } from './supabase.js';
import { SITE_TITLE } from './config.js';

const MENU = [
  { title: '커뮤니티 안내', items: [
    ['공지사항', 'guide.html?c=notice'], ['세계관', 'guide.html?c=world'],
    ['캐릭터 가이드', 'guide.html?c=guide'], ['시스템', 'guide.html?c=system'],
  ]},
  { title: '재난대비성약자양성소', items: [
    ['출석', 'attendance.html'], ['운세', 'fortune.html'], ['상점', 'shop.html'], ['과제', 'tasks.html'],
  ]},
  { title: '차원의 틈', href: 'battle.html' },
  { title: '캐릭터', items: [
    ['명단', 'characters.html'], ['내 캐릭터', 'me.html'],
  ]},
];

function currentKey() {
  const file = location.pathname.split('/').pop() || 'index.html';
  const c = new URLSearchParams(location.search).get('c');
  return file === 'guide.html' ? `guide.html?c=${c || 'notice'}` : file;
}

function link(label, href, current, extra = '') {
  return `<a class="nav-link${extra}${current === href ? ' active' : ''}" href="${href}">${esc(label)}</a>`;
}

export async function renderLayout() {
  const current = currentKey();
  const aside = document.getElementById('sidebar');

  const groups = MENU.map(g => g.href
    ? `<div class="nav-group">${link(g.title, g.href, current, ' nav-top')}</div>`
    : `<div class="nav-group"><div class="nav-title">${esc(g.title)}</div>${g.items.map(([l, h]) => link(l, h, current)).join('')}</div>`
  ).join('');

  aside.innerHTML = `
    <a class="brand" href="index.html">
      <span class="brand-mark">✦</span>
      <span class="brand-name">${esc(SITE_TITLE)}</span>
    </a>
    <button class="nav-toggle" aria-label="메뉴 열기">☰</button>
    <nav class="nav">${groups}</nav>
    <div class="side-user" id="side-user"></div>
    <a class="side-policy${current === 'policy.html' ? ' active' : ''}" href="policy.html">개인정보 · 저작권 안내</a>`;

  aside.querySelector('.nav-toggle').addEventListener('click', () => aside.classList.toggle('open'));

  const me = await currentProfile();
  const box = document.getElementById('side-user');
  if (me) {
    box.innerHTML = `
      <a class="su-name" href="me.html">${esc(me.name || me.login_id)}</a>
      <div class="su-meta">실타래 <b id="side-threads">${me.threads}</b></div>
      <button class="su-logout" type="button">로그아웃</button>`;
    box.querySelector('.su-logout').addEventListener('click', async () => { await logout(); location.href = 'index.html'; });
  } else {
    box.innerHTML = `<a class="su-login" href="index.html">로그인</a>`;
  }
  return me;
}

/** 실타래가 바뀌었을 때 왼쪽 아래 숫자 갱신 */
export function setSideThreads(n) {
  const el = document.getElementById('side-threads');
  if (el && n !== undefined && n !== null) el.textContent = n;
}
