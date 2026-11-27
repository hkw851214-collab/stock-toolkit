let avgChartInstance = null;
let activeTab = 'calc'; // 'calc' | 'target'
let currency = 'KRW';   // 'KRW' | 'USD'

const tabCalc = document.getElementById('tabCalc');
const tabTarget = document.getElementById('tabTarget');
const panelCalc = document.getElementById('panelCalc');
const panelTarget = document.getElementById('panelTarget');
const curKRWBtn = document.getElementById('curKRW');
const curUSDBtn = document.getElementById('curUSD');

const holdPriceEl = document.getElementById('holdPrice');
const holdQtyEl = document.getElementById('holdQty');
const marketPriceEl = document.getElementById('marketPrice');
const buyRowsContainer = document.getElementById('buyRowsContainer');
const addRowBtn = document.getElementById('addRowBtn');
const calcStatus = document.getElementById('calcStatus');

const tHoldPriceEl = document.getElementById('tHoldPrice');
const tHoldQtyEl = document.getElementById('tHoldQty');
const tBuyPriceEl = document.getElementById('tBuyPrice');
const tTargetAvgEl = document.getElementById('tTargetAvg');
const targetStatus = document.getElementById('targetStatus');

const resultTitle = document.getElementById('resultTitle');
const tipBox = document.getElementById('tipBox');
const metricsGrid = document.getElementById('metricsGrid');
const tableWrap = document.getElementById('tableWrap');
const stepTableBody = document.getElementById('stepTableBody');

function fmtPrice(val) {
  if (currency === 'USD') return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${Math.round(val).toLocaleString('ko-KR')}원`;
}

function fmtMoney(val) {
  if (currency === 'USD') {
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e8) {
    const eok = Math.floor(abs / 1e8);
    const man = Math.round((abs % 1e8) / 1e4);
    return man > 0 ? `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만원` : `${sign}${eok}억원`;
  }
  if (abs >= 1e4) {
    return `${sign}${Math.round(abs / 1e4).toLocaleString('ko-KR')}만원`;
  }
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}원`;
}

function fmtQty(q) {
  return Number.isInteger(q) ? `${q.toLocaleString('ko-KR')}주` : `${Number(q.toFixed(2)).toLocaleString('ko-KR')}주`;
}

function calcBreakevenPct(avgPrice, currentPrice) {
  if (currentPrice <= 0 || avgPrice <= currentPrice) return 0;
  return ((avgPrice - currentPrice) / currentPrice) * 100;
}

function renderMetrics(cards) {
  metricsGrid.innerHTML = cards
    .map(
      (c) => `
      <div class="metric-box">
        <div class="label">${c.label}</div>
        <div class="val ${c.valClass || ''}">${c.val}</div>
        <div class="sub ${c.subClass || ''}" style="${c.subClass ? '' : 'color:#cbd5e1;'}">${c.sub}</div>
      </div>
    `
    )
    .join('');
}

function renderChart(labels, prices, currentPrice) {
  const ctx = document.getElementById('avgChart').getContext('2d');
  if (avgChartInstance) avgChartInstance.destroy();

  const colors = labels.map((l, idx) => {
    if (l.includes('현재가') || l.includes('매수가')) return '#fbbf24';
    if (idx === 0) return '#64748b';
    return '#38bdf8';
  });

  avgChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `단가 (${currency === 'USD' ? '$' : '원'})`,
          data: prices.map((v) => Number(v.toFixed(currency === 'USD' ? 2 : 0))),
          backgroundColor: colors,
          borderRadius: 8,
          maxBarThickness: 64,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (c) => `${c.label}: ${fmtPrice(c.raw)}`,
            afterLabel: (c) => {
              if (!currentPrice || c.label.includes('현재가')) return '';
              const pct = calcBreakevenPct(c.raw, currentPrice);
              return pct > 0 ? `본전까지 +${pct.toFixed(1)}% 필요` : '현재가 기준 수익 구간';
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#e2e8f0', font: { size: 13, weight: '700' } }, grid: { display: false } },
        y: {
          position: 'right',
          ticks: {
            color: '#cbd5e1',
            font: { size: 13 },
            callback: (v) => (currency === 'USD' ? `$${v}` : v.toLocaleString('ko-KR')),
          },
          grid: { color: 'rgba(51, 65, 85, 0.45)' },
        },
      },
    },
  });
}

// ====================================================
// 분할 매수 행 관리
// ====================================================
function updateRowBadges() {
  const rows = buyRowsContainer.querySelectorAll('.buy-row');
  rows.forEach((row, idx) => {
    row.querySelector('.buy-badge').textContent = `${idx + 1}차 매수`;
    row.querySelector('.btn-del').disabled = rows.length <= 1;
  });
  addRowBtn.disabled = rows.length >= 5;
}

function addBuyRow(priceVal = '', qtyVal = '') {
  const count = buyRowsContainer.querySelectorAll('.buy-row').length;
  if (count >= 5) return;

  const row = document.createElement('div');
  row.className = 'buy-row';
  row.innerHTML = `
    <span class="buy-badge">${count + 1}차 매수</span>
    <input class="add-price" type="number" min="0" step="any" placeholder="추가 매수가" value="${priceVal}" />
    <input class="add-qty" type="number" min="0" step="any" placeholder="추가 수량 (주)" value="${qtyVal}" />
    <button class="btn-del" type="button" title="행 삭제">✕</button>
  `;

  row.querySelector('.btn-del').addEventListener('click', () => {
    row.remove();
    updateRowBadges();
  });

  buyRowsContainer.appendChild(row);
  updateRowBadges();
}

function setBuyRows(list) {
  buyRowsContainer.innerHTML = '';
  list.forEach((item) => addBuyRow(item.p, item.q));
}

// ====================================================
// 모드 1: 분할 물타기 계산
// ====================================================
function runAveragingCalc(msg) {
  const hPrice = Number(holdPriceEl.value) || 0;
  const hQty = Number(holdQtyEl.value) || 0;
  const mPrice = Number(marketPriceEl.value) || 0;

  if (hPrice <= 0 || hQty <= 0) {
    calcStatus.textContent = '❌ 기존 보유 평단가와 수량을 0보다 크게 입력해 주세요.';
    calcStatus.className = 'status error';
    return;
  }

  let cumCost = hPrice * hQty;
  let cumQty = hQty;
  let addTotalCost = 0;
  let addTotalQty = 0;

  const refPrice = mPrice > 0 ? mPrice : hPrice;
  const steps = [
    {
      label: '기존 보유',
      price: hPrice,
      qty: hQty,
      avg: hPrice,
      cost: cumCost,
      bePct: calcBreakevenPct(hPrice, refPrice),
    },
  ];

  const rows = buyRowsContainer.querySelectorAll('.buy-row');
  rows.forEach((row, idx) => {
    const p = Number(row.querySelector('.add-price').value) || 0;
    const q = Number(row.querySelector('.add-qty').value) || 0;
    if (p > 0 && q > 0) {
      cumCost += p * q;
      cumQty += q;
      addTotalCost += p * q;
      addTotalQty += q;
      const newAvg = cumCost / cumQty;
      steps.push({
        label: `${idx + 1}차 매수`,
        price: p,
        qty: q,
        avg: newAvg,
        cost: cumCost,
        bePct: calcBreakevenPct(newAvg, refPrice),
      });
    }
  });

  const finalAvg = cumCost / cumQty;
  const avgDiffPct = ((finalAvg - hPrice) / hPrice) * 100;
  const beforeReturn = ((refPrice - hPrice) / hPrice) * 100;
  const afterReturn = ((refPrice - finalAvg) / finalAvg) * 100;
  const beforeBE = calcBreakevenPct(hPrice, refPrice);
  const afterBE = calcBreakevenPct(finalAvg, refPrice);

  resultTitle.textContent = '분할 물타기 평단가 분석 리포트';

  if (addTotalQty === 0) {
    tipBox.innerHTML = `<strong>💡 안내:</strong> 추가 매수 단가와 수량을 입력하면 물타기 전·후 평단가와 본전 도달 필요 상승률 변화를 바로 비교해 드립니다.`;
  } else {
    tipBox.innerHTML =
      `<strong>💡 물타기 효과 요약:</strong> 추가 투자금 <strong>${fmtMoney(addTotalCost)}</strong> 투입 시 평단가가 ` +
      `<strong>${fmtPrice(hPrice)} ➔ ${fmtPrice(finalAvg)}</strong> (${avgDiffPct.toFixed(1)}%)로 낮아지며, ` +
      `본전 도달 필요 상승률은 <strong>+${beforeBE.toFixed(1)}% ➔ +${afterBE.toFixed(1)}%</strong>로 줄어듭니다.`;
  }

  renderMetrics([
    { label: '최종 평균 단가', val: fmtPrice(finalAvg), valClass: 'down', sub: `기존 대비 ${avgDiffPct >= 0 ? '+' : ''}${avgDiffPct.toFixed(1)}%` },
    { label: '본전 필요 상승률', val: afterBE > 0 ? `+${afterBE.toFixed(1)}%` : '수익 구간', valClass: 'amber', sub: `기존 +${beforeBE.toFixed(1)}%에서 변화` },
    { label: '현재가 기준 수익률', val: `${afterReturn >= 0 ? '+' : ''}${afterReturn.toFixed(1)}%`, valClass: afterReturn >= 0 ? 'up' : 'down', sub: `기존 ${beforeReturn >= 0 ? '+' : ''}${beforeReturn.toFixed(1)}%` },
    { label: '최종 총 투자금액', val: fmtMoney(cumCost), sub: `기존 ${fmtMoney(hPrice * hQty)}` },
    { label: '추가 필요 투자금', val: fmtMoney(addTotalCost), valClass: 'up', sub: `추가 ${fmtQty(addTotalQty)}` },
    { label: '최종 총 보유 수량', val: fmtQty(cumQty), sub: `기존 ${fmtQty(hQty)}` },
  ]);

  tableWrap.style.display = 'block';
  stepTableBody.innerHTML = steps
    .map(
      (s) => `
      <tr>
        <td>${s.label}</td>
        <td>${fmtPrice(s.price)}</td>
        <td>${fmtQty(s.qty)}</td>
        <td>${fmtPrice(s.avg)}</td>
        <td>${fmtMoney(s.cost)}</td>
        <td class="amber">${s.bePct > 0 ? `+${s.bePct.toFixed(1)}%` : '수익 구간'}</td>
      </tr>
    `
    )
    .join('');

  const chartLabels = [...steps.map((s) => `${s.label} 평단가`), '현재가'];
  const chartValues = [...steps.map((s) => s.avg), refPrice];
  renderChart(chartLabels, chartValues, refPrice);

  calcStatus.className = 'status';
  calcStatus.textContent = `✅ ${msg || '물타기 평단가 계산 완료'}`;
}

// ====================================================
// 모드 2: 목표 평단가 역산
// ====================================================
function runTargetCalc() {
  const hPrice = Number(tHoldPriceEl.value) || 0;
  const hQty = Number(tHoldQtyEl.value) || 0;
  const bPrice = Number(tBuyPriceEl.value) || 0;
  const target = Number(tTargetAvgEl.value) || 0;

  if (hPrice <= 0 || hQty <= 0 || bPrice <= 0 || target <= 0) {
    targetStatus.textContent = '❌ 모든 입력값을 0보다 크게 입력해 주세요.';
    targetStatus.className = 'status error';
    return;
  }

  const isDownAvg = hPrice > bPrice;
  const isValid = isDownAvg ? (target > bPrice && target < hPrice) : (target > hPrice && target < bPrice);

  if (!isValid) {
    targetStatus.textContent = isDownAvg
      ? `❌ 목표 평단가는 추가 매수가(${fmtPrice(bPrice)})와 기존 평단가(${fmtPrice(hPrice)}) 사이여야 합니다.`
      : `❌ 목표 평단가는 기존 평단가(${fmtPrice(hPrice)})와 추가 매수가(${fmtPrice(bPrice)}) 사이여야 합니다.`;
    targetStatus.className = 'status error';
    return;
  }

  const exactQty = (hQty * (hPrice - target)) / (target - bPrice);
  const neededQty = currency === 'KRW' ? Math.ceil(exactQty) : Number(exactQty.toFixed(2));
  const neededMoney = neededQty * bPrice;
  const totalQty = hQty + neededQty;
  const totalCost = hPrice * hQty + neededMoney;
  const actualAvg = totalCost / totalQty;
  const bePct = calcBreakevenPct(actualAvg, bPrice);

  resultTitle.textContent = '목표 평단가 달성 필요 수량·금액 역산 리포트';
  tipBox.innerHTML =
    `<strong>💡 역산 결과:</strong> 평단가를 <strong>${fmtPrice(hPrice)} ➔ ${fmtPrice(target)}</strong>으로 맞추려면 ` +
    `현재가(${fmtPrice(bPrice)}) 기준 <strong>${fmtQty(neededQty)}</strong> (약 <strong>${fmtMoney(neededMoney)}</strong>)를 추가 매수해야 합니다.`;

  renderMetrics([
    { label: '추가 필요 수량', val: fmtQty(neededQty), valClass: 'amber', sub: `정확 계산치 ${exactQty.toFixed(2)}주` },
    { label: '추가 필요 금액', val: fmtMoney(neededMoney), valClass: 'up', sub: `매수가 ${fmtPrice(bPrice)} 기준` },
    { label: '달성 최종 평단가', val: fmtPrice(actualAvg), valClass: 'down', sub: `목표가 ${fmtPrice(target)}` },
    { label: '본전 필요 상승률', val: bePct > 0 ? `+${bePct.toFixed(1)}%` : '수익 구간', valClass: 'amber', sub: `매수가 기준` },
    { label: '최종 총 투자금', val: fmtMoney(totalCost), sub: `기존 ${fmtMoney(hPrice * hQty)}` },
    { label: '최종 총 보유 수량', val: fmtQty(totalQty), sub: `기존 ${fmtQty(hQty)}` },
  ]);

  tableWrap.style.display = 'none';
  renderChart(['기존 평단가', '목표 달성 평단가', '추가 매수가'], [hPrice, actualAvg, bPrice], bPrice);

  targetStatus.className = 'status';
  targetStatus.textContent = '✅ 목표 평단가 역산 완료';
}

// ====================================================
// 통화 및 탭 이벤트 바인딩
// ====================================================
function setCurrency(cur) {
  currency = cur;
  curKRWBtn.classList.toggle('active', cur === 'KRW');
  curUSDBtn.classList.toggle('active', cur === 'USD');
  document.querySelectorAll('.unit-label').forEach((el) => {
    el.textContent = cur === 'USD' ? '$' : '원';
  });
}

function switchTab(tab) {
  activeTab = tab;
  tabCalc.classList.toggle('active', tab === 'calc');
  tabTarget.classList.toggle('active', tab === 'target');
  panelCalc.style.display = tab === 'calc' ? 'block' : 'none';
  panelTarget.style.display = tab === 'target' ? 'block' : 'none';

  if (tab === 'calc') runAveragingCalc();
  else runTargetCalc();
}

tabCalc.addEventListener('click', () => switchTab('calc'));
tabTarget.addEventListener('click', () => switchTab('target'));
curKRWBtn.addEventListener('click', () => {
  setCurrency('KRW');
  if (activeTab === 'calc') runAveragingCalc();
  else runTargetCalc();
});
curUSDBtn.addEventListener('click', () => {
  setCurrency('USD');
  if (activeTab === 'calc') runAveragingCalc();
  else runTargetCalc();
});

addRowBtn.addEventListener('click', () => addBuyRow('', ''));
document.getElementById('calcBtn').addEventListener('click', () => runAveragingCalc());
document.getElementById('targetBtn').addEventListener('click', () => runTargetCalc());

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.preset;
    if (type === 'kr1') {
      setCurrency('KRW');
      holdPriceEl.value = 80000;
      holdQtyEl.value = 100;
      marketPriceEl.value = 64000;
      setBuyRows([{ p: 64000, q: 100 }]);
      runAveragingCalc('국내 주식 -20% 물타기 예시 적용');
    } else if (type === 'kr2') {
      setCurrency('KRW');
      holdPriceEl.value = 100000;
      holdQtyEl.value = 50;
      marketPriceEl.value = 72000;
      setBuyRows([{ p: 82000, q: 50 }, { p: 72000, q: 100 }]);
      runAveragingCalc('2차 분할 물타기 예시 적용');
    } else if (type === 'us1') {
      setCurrency('USD');
      holdPriceEl.value = 150;
      holdQtyEl.value = 20;
      marketPriceEl.value = 120;
      setBuyRows([{ p: 120, q: 20 }]);
      runAveragingCalc('미국 주식 ($ 기준) 물타기 예시 적용');
    }
  });
});

// 초기 기본 행 세팅 및 자동 계산
setBuyRows([{ p: 64000, q: 100 }]);
runAveragingCalc('기본 예시값(80,000원 ➔ 64,000원 물타기) 자동 계산됨');