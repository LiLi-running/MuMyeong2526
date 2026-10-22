// 커뮤니티 안내: 공지사항 · 세계관 · 캐릭터 가이드 · 시스템
// 메뉴마다 글 1개를 바로 보여 줍니다. (로그인 없이 열람 가능)
import { sb, errMsg, toast } from './supabase.js';
import { renderLayout } from './layout.js';
import { md, fmtDate } from './ui.js';

const CATS = { notice: '공지사항', world: '세계관', guide: '캐릭터 가이드', system: '시스템' };

const page = document.getElementById('page');
await renderLayout();

const c = new URLSearchParams(location.search).get('c');
const cat = CATS[c] ? c : 'notice';
document.title = `${CATS[cat]} · 무명의 유산`;

// 공개된 글 중 가장 최근에 수정한 1개
const { data: post, error } = await sb.from('posts').select('*')
  .eq('category', cat).eq('published', true)
  .order('updated_at', { ascending: false }).limit(1).maybeSingle();
if (error) toast(errMsg(error), 'error');

page.innerHTML = `<div class="page-head"><h1>${CATS[cat]}</h1>
    ${post ? `<span class="sub">${fmtDate(post.updated_at ?? post.created_at)} 수정</span>` : ''}</div>
  ${post
    ? `<article class="card article single"><div class="prose">${md(post.body)}</div></article>`
    : '<div class="card empty">아직 등록된 내용이 없습니다.</div>'}`;
