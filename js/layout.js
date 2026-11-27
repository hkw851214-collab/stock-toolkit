window.APP_VERSION = '2.0';

const NAV_ITEMS = [
  { id: 'simulator', label: '주가 시뮬레이터', href: '/', soon: false },
  { id: 'dividend',  label: '배당·복리',       href: '/dividend.html', soon: true },
  { id: 'tax',       label: '절세·양도세',     href: '/tax.html', soon: true },
  { id: 'averaging', label: '물타기 계산기',   href: '/averaging.html', soon: true },
];

(function initLayout() {
  const pageId = document.body.dataset.page || '';

  // 1. 상단 네비게이션 바 삽입
  const navMount = document.getElementById('site-nav');
  if (navMount) {
    const linksHtml = NAV_ITEMS.map((item) => {
      if (item.soon) {
        return `<span class="nav-item soon" title="곧 오픈 예정">${item.label}<span class="soon-tag">예정</span></span>`;
      }
      const cls = item.id === pageId ? 'nav-item active' : 'nav-item';
      return `<a class="${cls}" href="${item.href}">${item.label}</a>`;
    }).join('');

    navMount.innerHTML = `
      <nav class="top-nav" aria-label="주 메뉴">
        <div class="nav-inner">
          <a class="brand" href="/">
            <span>📈 스마트 투자 툴킷</span>
            <span class="ver-badge">v${window.APP_VERSION}</span>
          </a>
          <div class="nav-links">${linksHtml}</div>
        </div>
      </nav>
    `;
  }

  // 2. 상·하단 광고 배너 예정 영역 삽입 (추후 AdSense 승인 시 이 한 곳만 수정)
  const topAd = document.getElementById('ad-top');
  if (topAd) {
    topAd.innerHTML = `<div class="banner-zone">상단 광고 배너 예정 영역 (AdSense 승인 후 코드 일괄 삽입)</div>`;
  }

  const bottomAd = document.getElementById('ad-bottom');
  if (bottomAd) {
    bottomAd.innerHTML = `<div class="banner-zone">하단 광고 배너 예정 영역 (AdSense 승인 후 코드 일괄 삽입)</div>`;
  }

  // 3. 공통 면책 조항 & 푸터 삽입
  const footerMount = document.getElementById('site-footer');
  if (footerMount) {
    const showDisclaimer = document.body.dataset.disclaimer !== 'false';
    const disclaimerHtml = showDisclaimer
      ? `
        <div class="disclaimer">
          <strong>※ 투자 유의사항 (면책 조항):</strong> 본 웹사이트에서 제공하는 시뮬레이션 및 금융 계산 결과는 공개된 과거 데이터와 수학적 공식을 바탕으로 산출한 <strong>통계적 참고용 자료</strong>입니다. 미래의 실제 주가나 수익을 보장하지 않으며, 특정 종목의 매수·매도 권유가 아닙니다. 모든 투자 판단과 책임은 투자자 본인에게 있습니다.
        </div>
      `
      : '';

    footerMount.innerHTML = `
      ${disclaimerHtml}
      <footer class="site-footer">
        <div class="footer-links">
          <a href="/">주가 시뮬레이터</a>
          <a href="/about.html">사이트 소개</a>
          <a href="/privacy.html">개인정보처리방침</a>
          <a href="https://velvettear.tistory.com" target="_blank" rel="noopener noreferrer">금융·시황 블로그</a>
        </div>
        <div>© 2026 스마트 투자 툴킷 · Build v${window.APP_VERSION}</div>
      </footer>
    `;
  }
})();