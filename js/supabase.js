import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LOGIN_EMAIL_DOMAIN } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const POSITION_LABEL = { dealer: '딜러', supporter: '서포터', healer: '힐러' };

// 팀 패시브 (실제 효과는 서버의 02_battle_functions.sql 에서 처리. 여기는 표시용)
export const TEAM_PASSIVES = {
  '자명고': '파티 속도 시작치 120 · 같은 속도면 먼저 행동',
  '이글': '크리티컬 확률 15% · 공격/강타 크리티컬 ×2',
  '아타락시아': '크리티컬 시 행동한 캐릭터 체력 10 회복',
};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function errMsg(e) {
  return e?.message || e?.error_description || '알 수 없는 오류가 발생했습니다.';
}

export async function login(loginId, password) {
  const email = `${loginId.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
}

export async function logout() {
  await sb.auth.signOut();
}

let _profileCache = null;
export async function currentProfile(force = false) {
  if (_profileCache && !force) return _profileCache;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (_profileCache = null);
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return (_profileCache = data ?? null);
}

export function toast(msg, kind = 'info') {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}
