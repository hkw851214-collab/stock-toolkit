let divChartInstance = null;
let chartMode = 'asset'; // 'asset' | 'dividend'
let lastResult = null;

const PRESETS = {
  schd:    { init: 1000, monthly: 50,  years: 15, priceGrowth: 7.0, divYield: 3.5, divGrowth: 8.0, tax: '0.15',  reinvest: 'true', label: 'SCHD 배당성장 프리셋 적용' },
  sp500:   { init: 1000, monthly: 100, years: 20, priceGrowth: 9.0, divYield: 1.3, divGrowth: 5.0, tax: '0.154', reinvest: 'true', label: 'S&P 500 적립식 프리셋 적용' },
  highdiv: { init: 5000, monthly: 50,  years: 10, priceGrowth: 2.0, divYield: 7.5, divGrowth: 0.0, tax: '0.15',  reinvest: 'true', label: '고배당 월배당 프리셋 적용' },
  isa:     { init: 2000, monthly: 50,  years: 15, priceGrowth: 8.0, divYield: 3.0, divGrowth: 5.0, tax: '0',     reinvest: 'true', label: 'ISA·연금저축 과세이연 프리셋 적용' },
};

const elInit = document.getElementById('initAmount');
const elMonthly = document.getElementById('monthlyAmount');
const elYears = document.getElementById('years');
const elPriceGrowth = document.getElementById('priceGrowth');
const elDivYield = document.getElementById('divYield');
const elDivGrowth = document.getElementById('divGrowth');
const elTaxType = document.getElementById('taxType');
const elReinvest = document.getElementById('reinvest');
const calcBtn = document.getElementById('calcBtn');
const calcStatus = document.getElementById('calcStatus');
const btnAssetChart = document.getElementById('btnAssetChart');
const btnDivChart = document.getElementById('btnDivChart');

function formatKRW(won) {
  const abs = Math.abs(won);
  const sign = won < 0 ? '-' : '';
  if (abs >= 1e8) {
    const eok = Math.floor(abs / 1e8);
    const man = Math.round((abs % 1e8) / 1e4);
    return man > 0 ? `${sign}${eok.toLocaleString('ko-KR')}억 ${man.toLocaleString('ko-KR')}만원` : `${sign}${eok.toLocaleString('ko-KR')}억원`;
  }
  return `${sign}${Math.round(abs / 1e4).toLocaleString('ko-KR')}만원`;
}

function simulateCompound(params, reinvestFlag) {
  const { initWon, monthlyWon, years, priceGrowth, divYield, divGrowth, taxRate } = params;

  const monthlyPriceFactor = Math.pow(1 + priceGrowth / 100, 1 / 12);
  const monthlyDivFactor = Math.pow(1 + divGrowth / 100, 1 / 12);

  let sharePrice = 10000;
  let annualDPS = sharePrice * (divYield / 100);
  let shares = initWon / sharePrice;
  let totalPrincipal = initWon;
  let cashDivPool = 0;
  let cumDivNet = 0;

  const yearly = [];

  for (let yr = 1; yr <= years; yr++) {
    for (let m = 1; m < 12 + 1; m++) {
      if (monthlyWon > 0) {
        shares += monthlyWon / sharePrice;
        totalPrincipal += monthlyWon;
      }

      const monthlyGrossDiv = shares * (annualDPS / 12);
      const monthlyNetDiv = monthlyGrossDiv * (1 - taxRate);
      cumDivNet += monthlyNetDiv;

      if (reinvestFlag) {
        shares += monthlyNetDiv / sharePrice;
      } else {
        cashDivPool += monthlyNetDiv;
      }

      sharePrice *= monthlyPriceFactor;
      annualDPS *= monthlyDivFactor;
    }

    const stockValue = shares * sharePrice;
    const totalAsset = stockValue + cashDivPool;
    const forwardAnnualNetDiv = shares * annualDPS * (1 - taxRate);
    const forwardMonthlyNetDiv = forwardAnnualNetDiv / 12;
    const yoc = totalPrincipal > 0 ? (forwardAnnualNetDiv / totalPrincipal) * 100 : 0;

    yearly.push({
      year: yr,
      principal: totalPrincipal,
      totalAsset,
      profit: totalAsset - totalPrincipal,
      cumDivNet,
      annualNetDiv: forwardAnnualNetDiv,
      monthlyNetDiv: forwardMonthlyNetDiv,
      yoc,
    });
  }

  return yearly;
}

function renderChart(yearly) {
  const labels = yearly.map((r) => `${r.year}년차`);
  const ctx = document.getElementById('divChart').getContext('2d');
  if (divChartInstance) divChartInstance.destroy();

  if (chartMode === 'asset') {
    const principalData = yearly.map((r) => Math.round(r.principal / 1e4));
    const profitData = yearly.map((r) => Math.round(Math.max(0, r.profit) / 1e4));

    divChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '누적 투자 원금 (만원)',
            data: principalData,
            backgroundColor: '#334155',
            borderRadius: 4,
          },
          {
            label: '복리·배당 수익 (만원)',
            data: profitData,
            backgroundColor: '#38bdf8',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#e2e8f0', font: { size: 13, weight: '600' } },
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (c) => `${c.dataset.label}: ${formatKRW(c.raw * 1e4)}`,
              footer: (items) => {
                const idx = items[0].dataIndex;
                return `총 자산: ${formatKRW(yearly[idx].totalAsset)}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#cbd5e1', font: { size: 13 } },
            grid: { display: false },
          },
          y: {
            stacked: true,
            position: 'right',
            ticks: {
              color: '#cbd5e1',
              font: { size: 13 },
              callback: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}억` : `${v.toLocaleString('ko-KR')}만`),
            },
            grid: { color: 'rgba(51, 65, 85, 0.45)' },
          },
        },
      },
    });
  } else {
    const monthlyDivData = yearly.map((r) => Math.round(r.monthlyNetDiv / 1e4));

    divChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '세후 예상 월배당금 (만원)',
            data: monthlyDivData,
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.16)',
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: '#fbbf24',
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#e2e8f0', font: { size: 13, weight: '600' } },
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (c) => `세후 월배당: ${formatKRW(c.raw * 1e4)}`,
              afterLabel: (c) => `원금 대비 배당률(YoC): ${yearly[c.dataIndex].yoc.toFixed(1)}%`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#cbd5e1', font: { size: 13 } },
            grid: { display: false },
          },
          y: {
            position: 'right',
            ticks: {
              color: '#cbd5e1',
              font: { size: 13 },
              callback: (v) => `${v.toLocaleString('ko-KR')}만`,
            },
            grid: { color: 'rgba(51, 65, 85, 0.45)' },
          },
        },
      },
    });
  }
}

function renderTable(yearly) {
  const tbody = document.getElementById('yearlyTableBody');
  tbody.innerHTML = yearly
    .map(
      (r) => `
      <tr>
        <td>${r.year}년차</td>
        <td>${formatKRW(r.principal)}</td>
        <td>${formatKRW(r.totalAsset)}</td>
        <td>${formatKRW(r.annualNetDiv)}</td>
        <td class="highlight">${formatKRW(r.monthlyNetDiv)}</td>
        <td>${r.yoc.toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');
}

function calculate(statusText) {
  const years = Math.max(1, Math.min(40, parseInt(elYears.value, 10) || 15));
  elYears.value = years;

  const params = {
    initWon: Math.max(0, Number(elInit.value) || 0) * 1e4,
    monthlyWon: Math.max(0, Number(elMonthly.value) || 0) * 1e4,
    years,
    priceGrowth: Number(elPriceGrowth.value) || 0,
    divYield: Math.max(0, Number(elDivYield.value) || 0),
    divGrowth: Math.max(0, Number(elDivGrowth.value) || 0),
    taxRate: Number(elTaxType.value) || 0,
  };

  const reinvestFlag = elReinvest.value === 'true';
  const yearly = simulateCompound(params, reinvestFlag);
  const yearlyOn = reinvestFlag ? yearly : simulateCompound(params, true);
  const yearlyOff = reinvestFlag ? simulateCompound(params, false) : yearly;

  const finalRow = yearly[yearly.length - 1];
  const dripDiff = yearlyOn[yearlyOn.length - 1].totalAsset - yearlyOff[yearlyOff.length - 1].totalAsset;
  const totalReturnPct = finalRow.principal > 0 ? (finalRow.profit / finalRow.principal) * 100 : 0;

  document.getElementById('resultTitle').textContent = `${years}년 뒤 예상 자산 및 월배당 리포트`;
  document.getElementById('mFinalAsset').textContent = formatKRW(finalRow.totalAsset);
  document.getElementById('mTotalReturnPct').textContent = `원금 대비 ${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(1)}%`;

  document.getElementById('mPrincipal').textContent = formatKRW(finalRow.principal);
  document.getElementById('mPrincipalSub').textContent = `초기 ${formatKRW(params.initWon)} + 월 ${Math.round(params.monthlyWon / 1e4)}만`;

  document.getElementById('mProfit').textContent = formatKRW(finalRow.profit);
  document.getElementById('mCumDiv').textContent = `누적 세후배당 ${formatKRW(finalRow.cumDivNet)}`;

  document.getElementById('mMonthlyDiv').textContent = formatKRW(finalRow.monthlyNetDiv);
  document.getElementById('mAnnualDiv').textContent = `연 세후 ${formatKRW(finalRow.annualNetDiv)}`;

  document.getElementById('mYoc').textContent = `${finalRow.yoc.toFixed(1)}%`;

  document.getElementById('mDripDiff').textContent = `+${formatKRW(Math.max(0, dripDiff))}`;
  document.getElementById('mDripSub').textContent = reinvestFlag ? '미재투자 대비 추가 자산' : '재투자 ON 시 추가 가능';

  lastResult = yearly;
  renderChart(yearly);
  renderTable(yearly);

  if (statusText) {
    calcStatus.textContent = `✅ ${statusText}`;
  } else {
    calcStatus.textContent = `✅ ${years}년 복리 시뮬레이션 완료`;
  }
}

function setChartMode(mode) {
  chartMode = mode;
  btnAssetChart.classList.toggle('active', mode === 'asset');
  btnDivChart.classList.toggle('active', mode === 'dividend');
  if (lastResult) renderChart(lastResult);
}

calcBtn.addEventListener('click', () => calculate());
btnAssetChart.addEventListener('click', () => setChartMode('asset'));
btnDivChart.addEventListener('click', () => setChartMode('dividend'));

document.querySelectorAll('.quick-tags button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.preset];
    if (!p) return;
    elInit.value = p.init;
    elMonthly.value = p.monthly;
    elYears.value = p.years;
    elPriceGrowth.value = p.priceGrowth;
    elDivYield.value = p.divYield;
    elDivGrowth.value = p.divGrowth;
    elTaxType.value = p.tax;
    elReinvest.value = p.reinvest;
    calculate(p.label);
  });
});

// 페이지 접속 시 기본값으로 즉시 계산 표시
calculate('SCHD 배당성장 기본값으로 자동 계산됨');