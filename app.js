const APP_VERSION = '1.2';
let chartInstance = null;
let chartMode = 'candle'; // 'candle' | 'line'
let lastState = null;     // { data, sim, days }

const stockInput = document.getElementById('stockInput');
const horizonSelect = document.getElementById('horizonSelect');
const runBtn = document.getElementById('runBtn');
const statusMsg = document.getElementById('statusMsg');
const resultSection = document.getElementById('resultSection');
const btnCandle = document.getElementById('btnCandle');
const btnLine = document.getElementById('btnLine');

function randNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function formatPrice(val, currency) {
  if (currency === 'KRW') return `${Math.round(val).toLocaleString('ko-KR')}원`;
  return `$${val.toFixed(2)}`;
}

function formatPct(target, base) {
  const pct = ((target - base) / base) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function calcMA(closes, period) {
  const result = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) result[i] = Number((sum / period).toFixed(2));
  }
  return result;
}

// 커스텀 일봉(캔들) 렌더링 플러그인 (외부 라이브러리 의존성 없음)
const candlestickPlugin = {
  id: 'candlestickPlugin',
  beforeDatasetsDraw(chart, _args, pluginOptions) {
    if (!pluginOptions || !pluginOptions.enabled || !pluginOptions.ohlc) return;

    const { ctx, chartArea, scales: { x, y } } = chart;
    const ohlc = pluginOptions.ohlc;
    const totalPoints = chart.data.labels.length;
    const bodyWidth = Math.max(2, Math.min(8, (chartArea.width / totalPoints) * 0.62));

    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();

    for (let i = 0; i < ohlc.length; i++) {
      const bar = ohlc[i];
      if (!bar) continue;

      const xPos = x.getPixelForValue(i);
      const yOpen = y.getPixelForValue(bar.o);
      const yHigh = y.getPixelForValue(bar.h);
      const yLow = y.getPixelForValue(bar.l);
      const yClose = y.getPixelForValue(bar.c);

      const isUp = bar.c >= bar.o;
      const color = isUp ? '#f43f5e' : '#38bdf8'; // 한국 기준: 양봉 빨강 / 음봉 파랑

      // 고가~저가 심지(꼬리)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(xPos, yHigh);
      ctx.lineTo(xPos, yLow);
      ctx.stroke();

      // 시가~종가 몸통
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      ctx.fillRect(xPos - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    }

    ctx.restore();
  },
};

function runMonteCarlo(data, days, numSim = 1000) {
  const closes = data.closes;
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const fullMean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const recentSlice = returns.slice(-60);
  const recentMean = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;

  const variance = returns.reduce((a, b) => a + Math.pow(b - fullMean, 2), 0) / (returns.length - 1);
  const sigma = Math.sqrt(variance);

  // 1년 평균(65%) + 최근 60일 단기 추세(35%) 혼합 후 과도한 외삽 제한
  const blendedMean = fullMean * 0.65 + recentMean * 0.35;
  const clampedMean = Math.max(-0.0025, Math.min(0.0025, blendedMean));
  const drift = clampedMean - 0.5 * variance;

  const lastPrice = closes[closes.length - 1];
  const yearHigh = data.highs ? Math.max(...data.highs) : Math.max(...closes);

  const dayBuckets = Array.from({ length: days }, () => new Float64Array(numSim));
  const samplePaths = [];
  const sampleCount = 18;

  let upCount = 0;
  let breakHighCount = 0;

  for (let s = 0; s < numSim; s++) {
    let price = lastPrice;
    let maxInPath = lastPrice;
    const capture = s < sampleCount ? [] : null;

    for (let d = 0; d < days; d++) {
      price = price * Math.exp(drift + sigma * randNormal());
      dayBuckets[d][s] = price;
      if (price > maxInPath) maxInPath = price;
      if (capture) capture.push(price);
    }

    if (price > lastPrice) upCount++;
    if (maxInPath >= yearHigh) breakHighCount++;
    if (capture) samplePaths.push(capture);
  }

  const p10 = [], p50 = [], p90 = [];
  for (let d = 0; d < days; d++) {
    const sorted = dayBuckets[d].sort();
    p10.push(sorted[Math.floor(numSim * 0.1)]);
    p50.push(sorted[Math.floor(numSim * 0.5)]);
    p90.push(sorted[Math.floor(numSim * 0.9)]);
  }

  const annualVol = sigma * Math.sqrt(252) * 100;
  return {
    p10,
    p50,
    p90,
    samplePaths,
    annualVol,
    upProb: (upCount / numSim) * 100,
    breakHighProb: (breakHighCount / numSim) * 100,
    yearHigh,
  };
}

function renderChart(data, sim, days) {
  const histLen = Math.min(60, data.closes.length);
  const startIdx = data.closes.length - histLen;

  const histDates = data.dates.slice(startIdx).map((d) => d.slice(5));
  const histCloses = data.closes.slice(startIdx);
  const lastClose = histCloses[histCloses.length - 1];

  const ohlcSlice = [];
  for (let i = startIdx; i < data.closes.length; i++) {
    const c = data.closes[i];
    ohlcSlice.push({
      o: data.opens ? data.opens[i] : c,
      h: data.highs ? data.highs[i] : c,
      l: data.lows ? data.lows[i] : c,
      c,
    });
  }

  const ma20Full = calcMA(data.closes, 20);
  const ma60Full = calcMA(data.closes, 60);
  const ma20Series = [...ma20Full.slice(startIdx), ...Array(days).fill(null)];
  const ma60Series = [...ma60Full.slice(startIdx), ...Array(days).fill(null)];

  const futureLabels = Array.from({ length: days }, (_, i) => `+${i + 1}일`);
  const labels = [...histDates, ...futureLabels];

  const padBefore = Array(histLen - 1).fill(null);
  const histSeries = [...histCloses, ...Array(days).fill(null)];
  const highSeries = [...padBefore, lastClose, ...sim.p90];
  const midSeries = [...padBefore, lastClose, ...sim.p50];
  const lowSeries = [...padBefore, lastClose, ...sim.p10];

  const isCandle = chartMode === 'candle';

  // 반투명 가상 시뮬레이션 경로 18개
  const sampleDatasets = sim.samplePaths.map((path) => ({
    label: '',
    data: [...padBefore, lastClose, ...path],
    borderColor: 'rgba(148, 163, 184, 0.14)',
    borderWidth: 1,
    pointRadius: 0,
    tension: 0.05,
    order: 10,
  }));

  const datasets = [
    ...sampleDatasets,
    {
      label: isCandle ? '일봉 (OHLC)' : '과거 종가 (60일)',
      data: histSeries,
      borderColor: isCandle ? 'transparent' : '#f8fafc',
      borderWidth: isCandle ? 0 : 2,
      pointRadius: 0,
      tension: 0.1,
      order: 3,
    },
    {
      label: '20일 이평선',
      data: ma20Series,
      borderColor: '#f59e0b',
      borderWidth: 1.3,
      pointRadius: 0,
      tension: 0.15,
      order: 2,
    },
    {
      label: '60일 이평선',
      data: ma60Series,
      borderColor: '#a78bfa',
      borderWidth: 1.3,
      pointRadius: 0,
      tension: 0.15,
      order: 2,
    },
    {
      label: '낙관 (상위 10%)',
      data: highSeries,
      borderColor: '#fb7185',
      borderDash: [5, 4],
      borderWidth: 1.6,
      pointRadius: 0,
      fill: false,
      order: 1,
    },
    {
      label: '중앙값 (50%)',
      data: midSeries,
      borderColor: '#38bdf8',
      borderWidth: 2.3,
      pointRadius: 0,
      fill: false,
      order: 1,
    },
    {
      label: '보수 (하위 10%)',
      data: lowSeries,
      borderColor: '#60a5fa',
      borderDash: [5, 4],
      borderWidth: 1.6,
      pointRadius: 0,
      backgroundColor: 'rgba(56, 189, 248, 0.10)',
      fill: '-2', // 낙관(상위 10%)과 보수(하위 10%) 사이 영역 음영
      order: 1,
    },
  ];

  // 캔들 고가/저가가 차트 위아래에 잘리지 않도록 여유 범위 계산
  const allHighs = [...ohlcSlice.map((b) => b.h), ...sim.p90];
  const allLows = [...ohlcSlice.map((b) => b.l), ...sim.p10];
  const minVal = Math.min(...allLows);
  const maxVal = Math.max(...allHighs);
  const pad = (maxVal - minVal) * 0.06;

  const ctx = document.getElementById('simChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    plugins: [candlestickPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        candlestickPlugin: {
          enabled: isCandle,
          ohlc: ohlcSlice,
        },
        legend: {
          position: 'top',
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            font: { size: 11 },
            filter: (item) => Boolean(item.text),
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          filter: (item) => Boolean(item.dataset.label),
          callbacks: {
            label: (ctx) => {
              if (ctx.raw == null) return '';
              if (isCandle && ctx.dataset.label === '일봉 (OHLC)' && ctx.dataIndex < ohlcSlice.length) {
                const b = ohlcSlice[ctx.dataIndex];
                return [
                  `시가: ${formatPrice(b.o, data.currency)}`,
                  `고가: ${formatPrice(b.h, data.currency)}`,
                  `저가: ${formatPrice(b.l, data.currency)}`,
                  `종가: ${formatPrice(b.c, data.currency)}`,
                ];
              }
              return `${ctx.dataset.label}: ${formatPrice(ctx.raw, data.currency)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxTicksLimit: 9, font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          position: 'right',
          suggestedMin: Math.max(0, minVal - pad),
          suggestedMax: maxVal + pad,
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: (v) => (data.currency === 'KRW' ? Math.round(v).toLocaleString('ko-KR') : `$${v.toFixed(1)}`),
          },
          grid: { color: 'rgba(51, 65, 85, 0.45)' },
        },
      },
    },
  });
}

function setChartMode(mode) {
  chartMode = mode;
  btnCandle.classList.toggle('active', mode === 'candle');
  btnLine.classList.toggle('active', mode === 'line');
  if (lastState) {
    renderChart(lastState.data, lastState.sim, lastState.days);
  }
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
  statusMsg.textContent = `⏳ '${q}' 최근 1년 일봉 수집 및 1,000회 시뮬레이션 계산 중...`;
  statusMsg.className = 'status';
  runBtn.disabled = true;

  try {
    const res = await fetch(`/api/stock?q=${encodeURIComponent(q)}&v=${APP_VERSION}`, { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || '종목 데이터를 불러오지 못했습니다.');
    }

    const sim = runMonteCarlo(data, days, 1000);
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

    const upProbEl = document.getElementById('mUpProb');
    upProbEl.textContent = `${sim.upProb.toFixed(1)}%`;
    upProbEl.className = `val ${sim.upProb >= 50 ? 'up' : 'down'}`;

    document.getElementById('mBreakProb').textContent = `${sim.breakHighProb.toFixed(1)}%`;
    document.getElementById('mYearHigh').textContent = `1년 고점 ${formatPrice(sim.yearHigh, data.currency)}`;

    lastState = { data, sim, days };
    resultSection.style.display = 'block';
    renderChart(data, sim, days);
    statusMsg.textContent = `✅ '${data.name}' 시뮬레이션 완료 (1,000회 경로 기준 · API v${data.version || APP_VERSION})`;
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
btnCandle.addEventListener('click', () => setChartMode('candle'));
btnLine.addEventListener('click', () => setChartMode('line'));

const urlQ = new URLSearchParams(window.location.search).get('q');
if (urlQ) executeSimulation(urlQ);
