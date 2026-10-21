// 모든 페이지 공통: 왼쪽 고정 메뉴
import { currentProfile, logout, esc } from './supabase.js';
import { SITE_TITLE } from './config.js';

// href 가 null 이면 아직 만들지 않은 페이지(준비 중)
const MENU = [
  { title: '커뮤니티 안내', items: [
    ['공지사항', null], ['세계관', null], ['캐릭터 가이드', null], ['시스템', null],
  ]},
  { title: '재난대비성약자양성소', items: [
    ['출석', null], ['운세', null], ['상점', null], ['과제', null],
  ]},
  { title: '차원의 틈', href: 'battle.html' },
  { title: '캐릭터', items: [
    ['명단', null], ['내 캐릭터', null],
  ]},
];

function link(label, href, current) {
  if (!href) return `<span class="nav-link soon" title="준비 중">${esc(label)}<em>준비 중</em></span>`;
  const on = current === href ? ' active' : '';
  return `<a class="nav-link${on}" href="${href}">${esc(label)}</a>`;
}

export async function renderLayout() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const aside = document.getElementById('sidebar');

  const groups = MENU.map(g => g.href
    ? `<div class="nav-group">${link(g.title, g.href, current).replace('nav-link', 'nav-link nav-top')}</div>`
    : `<div class="nav-group"><div class="nav-title">${esc(g.title)}</div>${g.items.map(([l, h]) => link(l, h, current)).join('')}</div>`
  ).join('');

  aside.innerHTML = `
    <a class="brand" href="index.html">
      <span class="brand-mark">✦</span>
      <span class="brand-name">${esc(SITE_TITLE)}</span>
    </a>
    <button class="nav-toggle" aria-label="메뉴 열기">☰</button>
    <nav class="nav">${groups}</nav>
    <div class="side-user" id="side-user"></div>`;

  aside.querySelector('.nav-toggle').addEventListener('click', () => aside.classList.toggle('open'));

  const me = await currentProfile();
  const box = document.getElementById('side-user');
  if (me) {
    box.innerHTML = `
      <div class="su-name">${esc(me.name || me.login_id)}</div>
      <div class="su-meta">실타래 <b>${me.threads}</b></div>
      <button class="su-logout" type="button">로그아웃</button>`;
    box.querySelector('.su-logout').addEventListener('click', async () => { await logout(); location.href = 'index.html'; });
  } else {
    box.innerHTML = `<a class="su-login" href="index.html">로그인</a>`;
  }
  return me;
}
