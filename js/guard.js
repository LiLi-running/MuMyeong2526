// 파일 버전이 섞여서 페이지가 멈췄을 때 빈 화면 대신 안내를 보여 줍니다. (모듈이 아닌 일반 스크립트)
window.addEventListener('error', function (e) {
  var msg = String(e && e.message || '');
  if (!/module|export|import|Unexpected token/i.test(msg)) return;
  var box = document.createElement('div');
  box.className = 'card';
  box.style.cssText = 'margin:24px;border-color:#8a4e47;line-height:1.7';
  box.innerHTML = '<b>페이지를 불러오지 못했습니다.</b><br>' +
    '사이트 파일이 서로 다른 버전으로 섞여 있습니다. GitHub의 배포(Actions)가 끝났는지 확인한 뒤 ' +
    '<b>Ctrl + Shift + R</b> 로 새로고침해 주세요.<br><small style="color:#6c7175"></small>';
  box.querySelector('small').textContent = msg;
  (document.getElementById('page') || document.body).prepend(box);
});
