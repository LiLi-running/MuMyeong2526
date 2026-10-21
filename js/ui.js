// 공통 화면 도우미: 마크다운, 이미지 업로드, 모달, 날짜
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3/+esm';
import { sb, esc } from './supabase.js';

marked.setOptions({ gfm: true, breaks: true });

/** 마크다운 → 안전한 HTML (글 · 표 · 그림) */
export function md(src) {
  return DOMPurify.sanitize(marked.parse(src ?? ''));
}

/** 이미지 업로드 → 공개 주소. 항상 본인 폴더에 저장 */
export async function uploadImage(file) {
  const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (!TYPES.includes(file.type)) throw new Error('PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.');
  if (file.size > 5 * 1024 * 1024) throw new Error('이미지는 5MB 이하만 올릴 수 있습니다.');
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('uploads').upload(path, file, { contentType: file.type });
  if (error) throw new Error('업로드 실패: ' + error.message);
  return sb.storage.from('uploads').getPublicUrl(path).data.publicUrl;
}

/** 파일 선택 창을 열고 업로드까지 */
export function pickAndUpload() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = async () => {
      if (!input.files?.[0]) return resolve(null);
      try { resolve(await uploadImage(input.files[0])); } catch (e) { reject(e); }
    };
    input.click();
  });
}

/** 모달 창. 반환된 dialog 의 .body 에 내용이 들어 있음 */
export function modal(title, bodyHtml, { wide = false } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '');
  dlg.innerHTML = `
    <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="modal-x" aria-label="닫기">×</button></div>
    <div class="modal-body">${bodyHtml}</div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.modal-x').onclick = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.body = dlg.querySelector('.modal-body');
  dlg.showModal();
  return dlg;
}

const pad = n => String(n).padStart(2, '0');
export const fmtDate = v => { const d = new Date(v); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
export const fmtDateTime = v => { const d = new Date(v); return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** <input type="datetime-local"> 값 ↔ ISO */
export const toLocalInput = v => { if (!v) return ''; const d = new Date(v); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** 로그인이 필요한 페이지 */
export function needLogin(page, title) {
  page.innerHTML = `<div class="page-head"><h1>${esc(title)}</h1></div>
    <div class="card empty">먼저 <a href="index.html">로그인</a>해 주세요.</div>`;
}

export const nameOf = p => p?.name || p?.login_id || '?';
