let chartInstance = null;

const stockInput = document.getElementById('stockInput');
const horizonSelect = document.getElementById('horizonSelect');
const runBtn = document.getElementById('runBtn');
const statusMsg = document.getElementById('statusMsg');
const resultSection = document.getElementById('resultSection');

// 표준정규분포 난수 생성 (Box-Muller 변환)
function randNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 통화 포맷팅
function formatPrice(val, currency) {
  if (currency === 'KRW') return `${Math.round(val).toLocaleString('ko-KR')}원`;
  return `$${val.toFixed(2)}`;
}

function formatPct(target, base) {
  const pct = ((target - base) / base) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// 몬테카를로 시뮬레이션 (기하 브라운 운동, 1,000회)
function runMonteCarlo(closes, days, numSim = 1000) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const rawMean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - rawMean, 2), 0) / (returns.length - 1);
  const sigma = Math.sqrt(variance);

  // 최근 단기 급등/급락으로 인한 비현실적 외삽 방지를 위해 일간 추세를 완만하게 제한
  const clampedMean = Math.max(-0.0012, Math.min(0.0012, rawMean));
  const drift = clampedMean - 0.5 * variance;
  const lastPrice = closes[closes.length - 1];

  // paths[day][simIndex]
  const dayBuckets = Array.from({ length: days }, () => new Float64Array(numSim));

  for (let s = 0; s < numSim; s++) {
    let price = lastPrice;
    for (let d = 0; d < days; d++) {
      price = price * Math.exp(drift + sigma * randNormal());
      dayBuckets[d][s] = price;
    }
  }

  const p10 = [], p50 = [], p90 = [];
  for (let d = 0; d < days; d++) {
    const sorted = dayBuckets[d].sort();
    p10.push(sorted[Math.floor(numSim * 0.1)]);
    p50.push(sorted[Math.floor(numSim * 0.5)]);
    p90.push(sorted[Math.floor(numSim * 0.9)]);
  }

  const annualVol = sigma * Math.sqrt(252) * 100;
  return { p10, p50, p90, annualVol };
}

function renderChart(data, sim, days) {
  const histLen = Math.min(60, data.closes.length);
  const histDates = data.dates.slice(-histLen).map((d) => d.slice(5));
  const histCloses = data.closes.slice(-histLen);
  const lastClose = histCloses[histCloses.length - 1];

  const futureLabels = Array.from({ length: days }, (_, i) => `+${i + 1}일`);
  const labels = [...histDates, ...futureLabels];

  const padBefore = Array(histLen - 1).fill(null);
  const histSeries = [...histCloses, ...Array(days).fill(null)];
  const highSeries = [...padBefore, lastClose, ...sim.p90];
  const midSeries = [...padBefore, lastClose, ...sim.p50];
  const lowSeries = [...padBefore, lastClose, ...sim.p10];

  const ctx = document.getElementById('simChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '과거 주가 (최근 60거래일)',
          data: histSeries,
          borderColor: '#0f172a',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
        },
        {
          label: '낙관 시나리오 (상위 10%)',
          data: highSeries,
          borderColor: '#dc2626',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: '중앙값 시나리오 (50%)',
          data: midSeries,
          borderColor: '#2563eb',
          borderWidth: 2.2,
          pointRadius: 0,
          fill: false,
        },
        {
          label: '보수 시나리오 (하위 10%)',
          data: lowSeries,
          borderColor: '#64748b',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          backgroundColor: 'rgba(37, 99, 235, 0.10)',
          fill: 1, // Dataset 1(상위 10%) ~ Dataset 3(하위 10%) 사이 밴드 음영 채우기
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.raw == null) return '';
              return `${ctx.dataset.label}: ${formatPrice(ctx.raw, data.currency)}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 11 } }, grid: { display: false } },
        y: {
          position: 'right',
          ticks: {
            font: { size: 11 },
            callback: (v) => (data.currency === 'KRW' ? v.toLocaleString('ko-KR') : `$${v}`),
          },
        },
      },
    },
  });
}

async function executeSimulation(queryOverride) {
  const q = (queryOverride || stockInput.value).trim();
  const days = Number(horizonSelect.value);
  if (!q) {
    statusMsg.textContent = '종목명이나 티커를 입력해 주세요.';
    statusMsg.className = 'status error';
    return;
  }

  stockInput.value = q;
  statusMsg.textContent = `⏳ '${q}' 최근 1년 주가 수집 및 1,000회 시뮬레이션 계산 중...`;
  statusMsg.className = 'status';
  runBtn.disabled = true;

  try {
    const res = await fetch(`/api/stock?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || '종목 데이터를 불러오지 못했습니다.');
    }

    const sim = runMonteCarlo(data.closes, days, 1000);
    const lastPrice = data.closes[data.closes.length - 1];
    const endHigh = sim.p90[days - 1];
    const endMid = sim.p50[days - 1];
    const endLow = sim.p10[days - 1];

    document.getElementById('stockTitle').textContent = `${data.name} (${data.symbol}) · 향후 ${days}거래일 시나리오`;
    document.getElementById('mCurrent').textContent = formatPrice(lastPrice, data.currency);
    document.getElementById('mVol').textContent = `연 변동성 ${sim.annualVol.toFixed(1)}%`;

    document.getElementById('mHigh').textContent = formatPrice(endHigh, data.currency);
    document.getElementById('mHighPct').textContent = formatPct(endHigh, lastPrice);

    document.getElementById('mMid').textContent = formatPrice(endMid, data.currency);
    const midPctEl = document.getElementById('mMidPct');
    midPctEl.textContent = formatPct(endMid, lastPrice);
    midPctEl.className = `sub ${endMid >= lastPrice ? 'up' : 'down'}`;

    document.getElementById('mLow').textContent = formatPrice(endLow, data.currency);
    document.getElementById('mLowPct').textContent = formatPct(endLow, lastPrice);

    resultSection.style.display = 'block';
    renderChart(data, sim, days);
    statusMsg.textContent = `✅ '${data.name}' 시뮬레이션 완료 (1,000회 경로 기준)`;
  } catch (err) {
    statusMsg.textContent = `❌ ${err.message}`;
    statusMsg.className = 'status error';
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener('click', () => executeSimulation());
stockInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') executeSimulation();
});
document.querySelectorAll('.quick-tags button').forEach((btn) => {
  btn.addEventListener('click', () => executeSimulation(btn.dataset.q));
});

// URL에 ?q=삼성전자 파라미터가 넘어오면 자동 실행 (티스토리 글에서 바로 연결용)
const urlQ = new URLSearchParams(window.location.search).get('q');
if (urlQ) executeSimulation(urlQ);