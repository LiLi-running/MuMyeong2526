// 개인정보 수집·이용 안내 + 저작권·출처 안내 (로그인 없이 열람 가능)
// 운영 방침이 바뀌면 아래 문구를 직접 고치세요.
import { esc } from './supabase.js';
import { renderLayout } from './layout.js';
import { SITE_TITLE } from './config.js';

const UPDATED = '2026.10.23';        // 안내 최종 수정일
const RETENTION_DAYS = 30;           // 커뮤니티 종료 후 데이터 삭제까지 기간
const CONTACT_EMAIL = 'mumyeong2523@gmail.com';   // 개인정보 문의처

const page = document.getElementById('page');
await renderLayout();

const contact = `<a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>`;

page.innerHTML = `
  <div class="page-head"><h1>개인정보 · 저작권 안내</h1><span class="sub">최종 수정 ${UPDATED}</span></div>
  <div class="doc-layout">
    <nav class="card toc">
      <a class="toc-link" href="#privacy">개인정보 수집 · 이용</a>
      <a class="toc-link" href="#third">외부 서비스</a>
      <a class="toc-link" href="#rights">보관 · 삭제 · 문의</a>
      <a class="toc-link" href="#credits">저작권 · 출처</a>
      <a class="toc-link" href="#ai">AI 사용 안내</a>
    </nav>
    <div class="stack">

<article class="card article prose" id="privacy">
<h2>개인정보 수집 · 이용 안내</h2>
<p>${esc(SITE_TITLE)}(이하 "커뮤니티")는 커뮤니티 운영에 꼭 필요한 정보만 수집합니다.
<b>실명, 실제 이메일, 전화번호, 생년월일 등 현실의 개인을 식별할 수 있는 정보는 수집하지 않습니다.</b>
로그인 아이디 뒤에 붙는 이메일 주소는 실제로 메일을 받을 수 없는 가상 주소입니다.</p>

<h3>수집하는 정보</h3>
<table>
<thead><tr><th>구분</th><th>항목</th><th>수집 방법</th><th>이용 목적</th></tr></thead>
<tbody>
<tr><td>계정</td><td>로그인 아이디, 비밀번호</td><td>운영진이 계정 생성 시 입력</td><td>로그인, 본인 확인</td></tr>
<tr><td>캐릭터</td><td>캐릭터 이름 · 소속 팀 · 포지션 · 프로필 이미지 · 한마디 · 소개</td><td>신청서를 바탕으로 운영진이 입력</td><td>명단 공개, 전투 · 게임 진행</td></tr>
<tr><td>활동 기록</td><td>출석 날짜, 운세 결과, 실타래 증감 내역, 보유 아이템, 선물(메시지 포함), 별 잡기 점수와 클릭 시각, 기간 과제 제출물(글 · 그림), 전투 행동 · 전투 채팅</td><td>사이트 이용 시 자동 저장</td><td>게임 진행, 보상 지급, 순위표, 부정 이용 방지</td></tr>
<tr><td>접속 기록</td><td>로그인 시각, 접속 IP 주소, 브라우저 정보</td><td>로그인 서비스(Supabase)가 자동 기록</td><td>보안, 부정 접속 확인</td></tr>
<tr><td>브라우저 저장소</td><td>로그인 상태 유지용 정보(세션 토큰)</td><td>이용자 브라우저에 저장</td><td>다시 로그인하지 않아도 되도록</td></tr>
</tbody>
</table>

<h3>누가 볼 수 있나요</h3>
<table>
<thead><tr><th>정보</th><th>공개 범위</th></tr></thead>
<tbody>
<tr><td>캐릭터 명단(이름 · 팀 · 포지션 · 이미지 · 한마디 · 소개)</td><td>로그인한 참여자 전원</td></tr>
<tr><td>별 잡기 최고 기록</td><td>로그인한 참여자 전원 (순위표)</td></tr>
<tr><td>전투 로그 · 체력</td><td>로그인한 참여자 전원 (관전)</td></tr>
<tr><td>파티 채팅 / 전투방 채팅</td><td>같은 파티원 / 같은 전투 참가자, 운영진</td></tr>
<tr><td>실타래 · 아이템 · 출석 · 운세 · 과제 제출물</td><td>본인과 운영진</td></tr>
<tr><td>선물 기록과 메시지</td><td>보낸 사람 · 받은 사람과 운영진</td></tr>
<tr><td>비밀번호</td><td><b>아무도 볼 수 없음.</b> 암호화(해시)되어 저장되며 운영진도 확인할 수 없습니다. 분실 시 운영진이 새 비밀번호로 재설정합니다.</td></tr>
</tbody>
</table>
<p>운영진은 위 정보를 커뮤니티 운영 목적으로만 사용하며, 외부에 판매하거나 제공하지 않습니다.</p>
</article>

<article class="card article prose" id="third">
<h2>외부 서비스</h2>
<p>이 사이트는 아래 서비스를 이용해 운영됩니다. 각 서비스는 사이트를 보여 주는 과정에서 접속 IP 주소 등 기술적인 정보를 처리할 수 있으며, 각 회사의 개인정보 처리방침을 따릅니다.</p>
<table>
<thead><tr><th>서비스</th><th>역할</th><th>처리하는 정보</th></tr></thead>
<tbody>
<tr><td>Supabase</td><td>로그인, 데이터베이스, 그림 파일 저장</td><td>위 표의 계정 · 캐릭터 · 활동 · 접속 기록 전부</td></tr>
<tr><td>GitHub Pages</td><td>사이트 화면 파일 제공</td><td>접속 IP 주소, 브라우저 정보</td></tr>
<tr><td>jsDelivr</td><td>본문 글꼴 · 프로그램 라이브러리 전송(CDN)</td><td>접속 IP 주소, 브라우저 정보</td></tr>
<tr><td>Google Fonts</td><td>제목 글꼴 전송</td><td>접속 IP 주소, 브라우저 정보</td></tr>
</tbody>
</table>
<p>트위터 · 신청서 바로가기는 외부 사이트로 이동하는 링크이며, 이동한 뒤에는 해당 사이트의 방침이 적용됩니다.</p>
</article>

<article class="card article prose" id="rights">
<h2>보관 · 삭제 · 문의</h2>
<ul>
<li><b>보관 기간:</b> 커뮤니티가 운영되는 동안 보관하며, 커뮤니티 종료 후 <b>${RETENTION_DAYS}일 이내</b>에 모든 계정과 기록을 삭제합니다.</li>
<li><b>중도 하차:</b> 하차 시 요청하면 해당 계정과 기록을 삭제합니다. 다만 다른 참여자의 기록과 얽힌 정보(전투 로그, 받은 사람에게 남은 선물 기록 등)는 커뮤니티 기록 보존을 위해 남을 수 있습니다.</li>
<li><b>열람 · 정정 · 삭제 요청:</b> 내 캐릭터 페이지에서 대부분의 정보를 직접 확인할 수 있으며, 그 밖의 요청은 이메일(${contact})로 문의해 주세요.</li>
<li>사이트에 로그인하여 이용하는 것은 이 안내에 동의한 것으로 봅니다.</li>
</ul>
</article>

<article class="card article prose" id="credits">
<h2>저작권 · 출처</h2>

<h3>커뮤니티 콘텐츠</h3>
<ul>
<li>세계관, 설정, 전투 규칙, 공지 등 커뮤니티 고유 콘텐츠의 권리는 <b>운영진</b>에게 있습니다.</li>
<li>캐릭터 설정, 프로필 이미지, 과제 제출물(글 · 그림)의 권리는 <b>각 작성자(참여자)</b>에게 있습니다. 커뮤니티는 이를 사이트 안에서 보여 주는 용도로만 사용합니다.</li>
<li>사이트의 글과 그림을 무단으로 복제하거나 외부에 재배포하지 말아 주세요.</li>
</ul>

<h3>사용한 글꼴</h3>
<table>
<thead><tr><th>이름</th><th>제작</th><th>라이선스</th><th>사용처</th></tr></thead>
<tbody>
<tr><td>Pretendard v1.3.9</td><td>Kil Hyung-jin (orioncactus)</td><td>SIL Open Font License 1.1</td><td>본문</td></tr>
<tr><td>Chiron Sung HK</td><td>Tamcy (The Chiron Sung HK Project Authors)</td><td>SIL Open Font License 1.1</td><td>제목 · 숫자의 숫자와 영문</td></tr>
<tr><td>Noto Serif KR</td><td>Google · Adobe</td><td>SIL Open Font License 1.1</td><td>제목의 한글</td></tr>
</tbody>
</table>

<h3>사용한 오픈소스 라이브러리</h3>
<table>
<thead><tr><th>이름</th><th>라이선스</th><th>사용처</th></tr></thead>
<tbody>
<tr><td>supabase-js</td><td>MIT License</td><td>로그인 · 데이터 · 실시간 갱신</td></tr>
<tr><td>marked</td><td>MIT License</td><td>안내글 · 소개의 글 · 표 · 그림 표시(마크다운)</td></tr>
<tr><td>DOMPurify</td><td>Apache License 2.0 / Mozilla Public License 2.0</td><td>안내글 표시 시 위험한 코드 제거</td></tr>
</tbody>
</table>

<h3>그림 · 아이콘</h3>
<ul>
<li>사이트에 쓰인 별 모양(✦)은 유니코드 문자이며, 별 잡기의 별과 운세 화면의 밤하늘은 CSS 코드로 그린 것입니다. <b>외부 이미지 · 아이콘 소스는 사용하지 않았습니다.</b></li>
<li>운세에 나오는 별 이름(시리우스, 베가 등)은 실제 천체의 이름입니다.</li>
<li>상점 · 명단 · 안내글에 올라오는 이미지는 운영진과 참여자가 직접 올린 것입니다.</li>
</ul>
</article>

<article class="card article prose" id="ai">
<h2>AI 사용 안내</h2>
<p>이 사이트의 프로그램은 운영진이 기획한 기능과 규칙을 바탕으로 <b>AI(Anthropic의 Claude)</b>가 작성했습니다.</p>
<table>
<thead><tr><th>AI가 만든 것</th><th>AI가 만들지 않은 것</th></tr></thead>
<tbody>
<tr>
<td>
· 화면 코드(HTML · CSS · JavaScript)<br>
· 서버 코드(데이터베이스 구조, 전투 판정 등 SQL 함수)<br>
· 운세 문구, 버튼 · 안내 문구<br>
· 화면 디자인(운영진이 정한 색상 #e5e7e4 · #3c3f42 기반)
</td>
<td>
· 세계관 · 설정 · 전투 규칙 · 팀 패시브 등 게임 기획<br>
· 공지 · 세계관 · 가이드 등 안내글 본문<br>
· 캐릭터 설정과 이미지, 과제 제출물<br>
· 사이트에 쓰인 이미지(AI 생성 이미지 없음)
</td>
</tr>
</tbody>
</table>
<ul>
<li>AI가 코드를 작성할 때 외부 프로젝트의 코드를 가져다 붙이지 않았으며, 사용한 외부 소스는 위 <a href="#credits">저작권 · 출처</a>에 적힌 글꼴과 라이브러리뿐입니다.</li>
<li>참여자가 사이트에 올린 글 · 그림 · 채팅은 AI 학습이나 AI 서비스에 사용되지 않습니다. 사이트는 이 내용을 어떤 AI에도 보내지 않습니다.</li>
</ul>
</article>

    </div>
  </div>`;

// 목차 강조
const links = [...page.querySelectorAll('.toc-link')];
const mark = () => {
  let cur = links[0];
  for (const a of links) if (document.querySelector(a.getAttribute('href')).getBoundingClientRect().top < 140) cur = a;
  links.forEach(a => a.classList.toggle('active', a === cur));
};
addEventListener('scroll', mark, { passive: true });
mark();
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
