let taxChartInstance = null;
let activeMode = 'overseas'; // 'overseas' | 'account'

const tabOverseas = document.getElementById('tabOverseas');
const tabAccount = document.getElementById('tabAccount');
const panelOverseas = document.getElementById('panelOverseas');
const panelAccount = document.getElementById('panelAccount');

const ovGain = document.getElementById('ovGain');
const ovLoss = document.getElementById('ovLoss');
const ovFee = document.getElementById('ovFee');
const ovStatus = document.getElementById('ovStatus');

const acProfit = document.getElementById('acProfit');
const acLoss = document.getElementById('acLoss');
const pensionRate = document.getElementById('pensionRate');
const acStatus = document.getElementById('acStatus');

const resultTitle = document.getElementById('resultTitle');
const tipBox = document.getElementById('tipBox');
const metricsGrid = document.getElementById('metricsGrid');
const tableWrap = document.getElementById('tableWrap');
const compareTableBody = document.getElementById('compareTableBody');

function formatWon(won) {
  const rounded = Math.round(won);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : '';
  if (abs >= 1e8) {
    const eok = Math.floor(abs / 1e8);
    const man = Math.round((abs % 1e8) / 1e4);
    return man > 0 ? `${sign}${eok.toLocaleString('ko-KR')}억 ${man.toLocaleString('ko-KR')}만원` : `${sign}${eok.toLocaleString('ko-KR')}억원`;
  }
  if (abs >= 1e4 && abs % 1e4 === 0) {
    return `${sign}${(abs / 1e4).toLocaleString('ko-KR')}만원`;
  }
  return `${sign}${abs.toLocaleString('ko-KR')}원`;
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

// ====================================================
// 모드 1: 해외주식 양도소득세 (22%)
// ====================================================
function calculateOverseas(msg) {
  const gainWon = Math.max(0, Number(ovGain.value) || 0) * 1e4;
  const lossWon = Math.max(0, Number(ovLoss.value) || 0) * 1e4;
  const feeWon = Math.max(0, Number(ovFee.value) || 0) * 1e4;

  const netGain = gainWon - lossWon - feeWon;
  const deduction = 250 * 1e4; // 연 250만원 기본공제
  const taxable = Math.max(0, netGain - deduction);
  const totalTax = Math.round(taxable * 0.22);
  const nationalTax = Math.round(taxable * 0.20);
  const localTax = totalTax - nationalTax;
  const afterTaxProfit = netGain - totalTax;
  const effRate = netGain > 0 ? (totalTax / netGain) * 100 : 0;

  // 손실(손절) 미반영 시 대비 절세액 계산
  const taxWithoutLoss = Math.round(Math.max(0, gainWon - feeWon - deduction) * 0.22);
  const lossTaxSaved = Math.max(0, taxWithoutLoss - totalTax);

  resultTitle.textContent = '해외주식 양도소득세 정밀 리포트 (지방소득세 포함 22%)';

  if (netGain <= 0) {
    tipBox.innerHTML = `<strong>💡 비과세 구간:</strong> 연간 순 양도차익이 0원 이하이므로 납부할 양도소득세가 없습니다.`;
  } else if (netGain <= deduction) {
    const remain = deduction - netGain;
    tipBox.innerHTML = `<strong>💡 비과세 구간:</strong> 연간 순이익이 250만 원 공제 한도 이내라 세금이 <strong>0원</strong>입니다. 올해 <strong>${formatWon(remain)}</strong>까지 추가 익절해도 비과세 혜택을 받을 수 있습니다.`;
  } else {
    tipBox.innerHTML =
      lossTaxSaved > 0
        ? `<strong>💡 절세 포인트:</strong> 손실 ${formatWon(lossWon)}을 손익통산해 세금을 <strong>${formatWon(lossTaxSaved)}</strong> 절감했습니다. 최종 납부 세액은 내년 5월 확정신고 대상입니다.`
        : `<strong>💡 절세 포인트:</strong> 250만 원 초과분 <strong>${formatWon(taxable)}</strong>에 22%가 과세됩니다. 연말 기준 평가손실 중인 종목이 있다면 일부 손절(손익통산) 시 손절액의 최대 22%만큼 세금을 줄일 수 있습니다.`;
  }

  renderMetrics([
    { label: '예상 양도소득세 (22%)', val: formatWon(totalTax), valClass: 'up', sub: `국세 ${formatWon(nationalTax)} + 지방세 ${formatWon(localTax)}` },
    { label: '세후 최종 순수익', val: formatWon(afterTaxProfit), valClass: afterTaxProfit >= 0 ? 'down' : 'up', sub: `실효세율 ${effRate.toFixed(2)}%` },
    { label: '순 양도차익 (손익통산)', val: formatWon(netGain), sub: `수익 - 손실 - 제비용` },
    { label: '과세표준 (공제 후)', val: formatWon(taxable), sub: `기본공제 250만원 차감` },
    { label: '250만원 공제 절세액', val: formatWon(Math.round(Math.min(Math.max(0, netGain), deduction) * 0.22)), valClass: 'amber', sub: `연간 기본공제 혜택` },
    { label: '손익통산 추가 절세액', val: formatWon(lossTaxSaved), valClass: 'amber', sub: `손실 상계로 아낀 세금` },
  ]);

  tableWrap.style.display = 'none';

  const ctx = document.getElementById('taxChart').getContext('2d');
  if (taxChartInstance) taxChartInstance.destroy();

  const chartData = [
    Math.round(Math.max(0, netGain) / 1e4),
    Math.round(Math.max(0, afterTaxProfit) / 1e4),
    Math.round(totalTax / 1e4),
    Math.round(lossTaxSaved / 1e4),
  ];

  taxChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['순 양도차익', '세후 실수령 수익', '납부할 양도세 (22%)', '손익통산 절세액'],
      datasets: [
        {
          label: '금액 (만원)',
          data: chartData,
          backgroundColor: ['#475569', '#38bdf8', '#fb7185', '#fbbf24'],
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
            label: (c) => `${c.label}: ${formatWon(c.raw * 1e4)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: '#e2e8f0', font: { size: 13, weight: '700' } }, grid: { display: false } },
        y: {
          position: 'right',
          ticks: { color: '#cbd5e1', font: { size: 13 }, callback: (v) => `${v.toLocaleString('ko-KR')}만` },
          grid: { color: 'rgba(51, 65, 85, 0.45)' },
        },
      },
    },
  });

  ovStatus.textContent = `✅ ${msg || '해외주식 양도소득세 계산 완료'}`;
}

// ====================================================
// 모드 2: 일반계좌 vs ISA vs 연금저축 절세 비교
// ====================================================
function calculateAccounts(msg) {
  const grossProfit = Math.max(0, Number(acProfit.value) || 0) * 1e4;
  const lossWon = Math.max(0, Number(acLoss.value) || 0) * 1e4;
  const pRate = Number(pensionRate.value) || 0.055;

  // 일반 계좌: 국내상장 해외ETF는 손익통산 불가 → 이익 전체에 15.4% 과세
  const generalTax = Math.round(grossProfit * 0.154);
  const generalNet = grossProfit - lossWon - generalTax;

  // ISA & 연금저축: 계좌 내 손익통산 가능
  const netProfit = Math.max(0, grossProfit - lossWon);

  // ISA 일반형: 200만 비과세 + 초과분 9.9% 분리과세
  const isaGenTax = Math.round(Math.max(0, netProfit - 200 * 1e4) * 0.099);
  const isaGenNet = grossProfit - lossWon - isaGenTax;

  // ISA 서민형: 400만 비과세 + 초과분 9.9% 분리과세
  const isaLowTax = Math.round(Math.max(0, netProfit - 400 * 1e4) * 0.099);
  const isaLowNet = grossProfit - lossWon - isaLowTax;

  // 연금저축/IRP: 과세이연 후 만 55세 이후 연금 수령 시 저율과세
  const pensionTax = Math.round(netProfit * pRate);
  const pensionNet = grossProfit - lossWon - pensionTax;

  const rows = [
    { name: '일반 위탁계좌', rule: '손익통산 불가 · 15.4%', tax: generalTax, net: generalNet, save: 0 },
    { name: '중개형 ISA (일반형)', rule: '200만 비과세 + 9.9%', tax: isaGenTax, net: isaGenNet, save: generalTax - isaGenTax },
    { name: '중개형 ISA (서민형)', rule: '400만 비과세 + 9.9%', tax: isaLowTax, net: isaLowNet, save: generalTax - isaLowTax },
    { name: '연금저축 · IRP', rule: `과세이연 · 수령 시 ${(pRate * 100).toFixed(1)}%`, tax: pensionTax, net: pensionNet, save: generalTax - pensionTax },
  ];

  const minTax = Math.min(...rows.map((r) => r.tax));
  const bestRow = rows.find((r) => r.tax === minTax);

  resultTitle.textContent = '계좌별 세금 & 절세 효과 비교 (국내 상장 해외 ETF 기준)';

  const warningText =
    grossProfit > 2000 * 1e4
      ? ` 특히 일반 계좌 수익이 2,000만 원을 넘어 <strong>금융소득종합과세 대상</strong>이 될 수 있으므로 절세 계좌 활용이 필수적입니다.`
      : '';

  tipBox.innerHTML = `<strong>💡 최적 계좌 분석:</strong> 동일 수익 기준 <strong>${bestRow.name}</strong>가 일반 계좌보다 세금을 <strong>${formatWon(bestRow.save)}</strong> 아낄 수 있습니다.${warningText}`;

  renderMetrics([
    { label: '일반 계좌 예상 세금', val: formatWon(generalTax), valClass: 'up', sub: '15.4% 배당소득세' },
    { label: 'ISA 일반형 세금', val: formatWon(isaGenTax), valClass: 'down', sub: `절세 +${formatWon(generalTax - isaGenTax)}` },
    { label: 'ISA 서민형 세금', val: formatWon(isaLowTax), valClass: 'down', sub: `절세 +${formatWon(generalTax - isaLowTax)}` },
    { label: '연금저축·IRP 세금', val: formatWon(pensionTax), valClass: 'down', sub: `절세 +${formatWon(generalTax - pensionTax)}` },
    { label: '최대 절세 금액', val: `+${formatWon(bestRow.save)}`, valClass: 'amber', sub: `${bestRow.name} 기준` },
    { label: '계좌 내 순수익', val: formatWon(grossProfit - lossWon), sub: '수익 - 실현 손실' },
  ]);

  tableWrap.style.display = 'block';
  compareTableBody.innerHTML = rows
    .map(
      (r) => `
      <tr class="${r.tax === minTax ? 'best-row' : ''}">
        <td>${r.name}</td>
        <td>${r.rule}</td>
        <td class="tax-red">${formatWon(r.tax)}</td>
        <td>${formatWon(r.net)}</td>
        <td class="save-amber">${r.save > 0 ? `+${formatWon(r.save)}` : '-'}</td>
      </tr>
    `
    )
    .join('');

  const ctx = document.getElementById('taxChart').getContext('2d');
  if (taxChartInstance) taxChartInstance.destroy();

  taxChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [
        {
          label: '예상 납부 세금 (만원)',
          data: rows.map((r) => Number((r.tax / 1e4).toFixed(1))),
          backgroundColor: '#fb7185',
          borderRadius: 6,
          maxBarThickness: 48,
        },
        {
          label: '일반계좌 대비 절세액 (만원)',
          data: rows.map((r) => Number((Math.max(0, r.save) / 1e4).toFixed(1))),
          backgroundColor: '#fbbf24',
          borderRadius: 6,
          maxBarThickness: 48,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#e2e8f0', font: { size: 13, weight: '600' } } },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (c) => `${c.dataset.label}: ${formatWon(c.raw * 1e4)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: '#e2e8f0', font: { size: 12, weight: '700' } }, grid: { display: false } },
        y: {
          position: 'right',
          ticks: { color: '#cbd5e1', font: { size: 13 }, callback: (v) => `${v.toLocaleString('ko-KR')}만` },
          grid: { color: 'rgba(51, 65, 85, 0.45)' },
        },
      },
    },
  });

  acStatus.textContent = `✅ ${msg || '계좌별 절세 비교 계산 완료'}`;
}

function switchMode(mode) {
  activeMode = mode;
  tabOverseas.classList.toggle('active', mode === 'overseas');
  tabAccount.classList.toggle('active', mode === 'account');
  panelOverseas.style.display = mode === 'overseas' ? 'block' : 'none';
  panelAccount.style.display = mode === 'account' ? 'block' : 'none';

  if (mode === 'overseas') calculateOverseas();
  else calculateAccounts();
}

tabOverseas.addEventListener('click', () => switchMode('overseas'));
tabAccount.addEventListener('click', () => switchMode('account'));
document.getElementById('calcOvBtn').addEventListener('click', () => calculateOverseas());
document.getElementById('calcAcBtn').addEventListener('click', () => calculateAccounts());

document.querySelectorAll('[data-ov-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const map = {
      small: { g: 500, l: 0, f: 5, label: '수익 500만원 기준 적용' },
      loss:  { g: 1500, l: 300, f: 10, label: '수익 1,500만 + 손절 300만 적용' },
      large: { g: 5000, l: 0, f: 30, label: '수익 5,000만원 기준 적용' },
      under: { g: 220, l: 0, f: 2, label: '250만원 이하 비과세 구간 적용' },
    };
    const p = map[btn.dataset.ovPreset];
    if (!p) return;
    ovGain.value = p.g;
    ovLoss.value = p.l;
    ovFee.value = p.f;
    calculateOverseas(p.label);
  });
});

document.querySelectorAll('[data-ac-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const map = {
      small: { p: 500, l: 0, label: '수익 500만원 기준 적용' },
      mid:   { p: 1500, l: 0, label: '수익 1,500만원 기준 적용' },
      high:  { p: 3000, l: 0, label: '수익 3,000만원 (종합과세 구간) 적용' },
    };
    const preset = map[btn.dataset.acPreset];
    if (!preset) return;
    acProfit.value = preset.p;
    acLoss.value = preset.l;
    calculateAccounts(preset.label);
  });
});

// 초기 실행
calculateOverseas('기본 예시값(수익 1,500만 · 손절 300만) 자동 계산됨');