let salChartInstance = null;

const elSalary = document.getElementById('annualSalary');
const elSeverance = document.getElementById('severanceType');
const elNonTax = document.getElementById('nonTax');
const elDependents = document.getElementById('dependents');
const elChildren = document.getElementById('children');
const elTaxRatio = document.getElementById('taxRatio');
const salStatus = document.getElementById('salStatus');

function fmtWon(v) {
  return `${Math.round(v).toLocaleString('ko-KR')}원`;
}

function fmtMan(v) {
  const man = Math.round(v / 1e4);
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rem = man % 10000;
    return rem > 0 ? `${eok}억 ${rem.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }
  return `${man.toLocaleString('ko-KR')}만원`;
}

// 근로소득세 연간 추정 (국세청 근로소득공제 + 기본공제 + 누진세율 + 근로소득세액공제 반영)
function estimateMonthlyIncomeTax(monthlyTaxable, dependents, children, taxRatio) {
  const annualTaxable = monthlyTaxable * 12;
  if (annualTaxable <= 0) return 0;

  // 1. 근로소득공제
  let earnedDeduction = 0;
  if (annualTaxable <= 500e4) earnedDeduction = annualTaxable * 0.7;
  else if (annualTaxable <= 1500e4) earnedDeduction = 350e4 + (annualTaxable - 500e4) * 0.4;
  else if (annualTaxable <= 4500e4) earnedDeduction = 750e4 + (annualTaxable - 1500e4) * 0.15;
  else if (annualTaxable <= 1e8) earnedDeduction = 1200e4 + (annualTaxable - 4500e4) * 0.05;
  else earnedDeduction = 1475e4 + (annualTaxable - 1e8) * 0.02;
  earnedDeduction = Math.min(earnedDeduction, 2000e4);

  const earnedIncome = annualTaxable - earnedDeduction;

  // 2. 인적공제 + 국민연금 공제 + 표준 특별소득공제 추정
  const personalDeduction = dependents * 150e4;
  const pensionBase = Math.min(Math.max(monthlyTaxable, 39e4), 617e4);
  const annualPension = pensionBase * 0.045 * 12;
  const specialDeduction = dependents === 1 ? 310e4 : dependents === 2 ? 360e4 : 500e4;

  const taxBase = Math.max(0, earnedIncome - personalDeduction - annualPension - specialDeduction);

  // 3. 종합소득세 과세표준 누진세율
  let calcTax = 0;
  if (taxBase <= 1400e4) calcTax = taxBase * 0.06;
  else if (taxBase <= 5000e4) calcTax = 84e4 + (taxBase - 1400e4) * 0.15;
  else if (taxBase <= 8800e4) calcTax = 624e4 + (taxBase - 5000e4) * 0.24;
  else if (taxBase <= 1.5e8) calcTax = 1536e4 + (taxBase - 8800e4) * 0.35;
  else if (taxBase <= 3e8) calcTax = 3706e4 + (taxBase - 1.5e8) * 0.38;
  else if (taxBase <= 5e8) calcTax = 9406e4 + (taxBase - 3e8) * 0.40;
  else calcTax = 17406e4 + (taxBase - 5e8) * 0.42;

  // 4. 근로소득세액공제
  let taxCredit = calcTax <= 130e4 ? calcTax * 0.55 : 71.5e4 + (calcTax - 130e4) * 0.3;
  let creditLimit = 74e4;
  if (annualTaxable > 7000e4) creditLimit = 50e4;
  else if (annualTaxable > 3300e4) creditLimit = 66e4;
  taxCredit = Math.min(taxCredit, creditLimit);

  // 5. 자녀세액공제 (8~20세)
  let childCredit = 0;
  if (children === 1) childCredit = 15e4;
  else if (children === 2) childCredit = 35e4;
  else if (children >= 3) childCredit = 35e4 + (children - 2) * 30e4;

  const annualTax = Math.max(0, calcTax - taxCredit - childCredit);
  return Math.floor(((annualTax / 12) * taxRatio) / 10) * 10;
}

function calcSalaryData(annualMan, severanceType, nonTaxMan, dependents, children, taxRatio) {
  const divisor = severanceType === 'included' ? 13 : 12;
  const grossMonthly = (annualMan * 1e4) / divisor;
  const nonTaxMonthly = Math.min(grossMonthly, nonTaxMan * 1e4);
  const taxableMonthly = Math.max(0, grossMonthly - nonTaxMonthly);

  // 4대보험 (2026년 기준 근로자 부담분)
  const pensionBase = Math.min(Math.max(taxableMonthly, 39e4), 617e4);
  const pension = Math.floor((pensionBase * 0.045) / 10) * 10;
  const health = Math.floor((taxableMonthly * 0.03545) / 10) * 10;
  const care = Math.floor((health * 0.1295) / 10) * 10;
  const employment = Math.floor((taxableMonthly * 0.009) / 10) * 10;
  const insuranceTotal = pension + health + care + employment;

  // 소득세 + 지방소득세(10%)
  const incomeTax = estimateMonthlyIncomeTax(taxableMonthly, dependents, children, taxRatio);
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;
  const taxTotal = incomeTax + localTax;

  const totalDeduct = insuranceTotal + taxTotal;
  const netMonthly = Math.max(0, grossMonthly - totalDeduct);

  return {
    grossMonthly,
    taxableMonthly,
    pension,
    health,
    care,
    employment,
    insuranceTotal,
    incomeTax,
    localTax,
    taxTotal,
    totalDeduct,
    netMonthly,
    netAnnual: netMonthly * 12,
  };
}

function renderChart(res) {
  const ctx = document.getElementById('salChart').getContext('2d');
  if (salChartInstance) salChartInstance.destroy();

  salChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['월 실수령액', '4대보험 합계', '소득세·지방소득세'],
      datasets: [
        {
          data: [Math.round(res.netMonthly), res.insuranceTotal, res.taxTotal],
          backgroundColor: ['#38bdf8', '#fbbf24', '#fb7185'],
          borderColor: '#111827',
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#e2e8f0', padding: 14, font: { size: 13, weight: '600' } },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (c) => ` ${c.label}: ${fmtWon(c.raw)}`,
          },
        },
      },
    },
  });
}

function runCalc(msg) {
  const annualMan = Math.max(1000, Number(elSalary.value) || 6000);
  const severanceType = elSeverance.value;
  const nonTaxMan = Math.max(0, Number(elNonTax.value) || 0);
  const dependents = Number(elDependents.value) || 1;
  const children = Number(elChildren.value) || 0;
  const taxRatio = Number(elTaxRatio.value) || 1.0;

  const res = calcSalaryData(annualMan, severanceType, nonTaxMan, dependents, children, taxRatio);
  const netRatio = res.grossMonthly > 0 ? (res.netMonthly / res.grossMonthly) * 100 : 0;
  const deductRatio = 100 - netRatio;

  document.getElementById('resultTitle').textContent = `연봉 ${fmtMan(annualMan * 1e4)} 예상 실수령액 리포트`;
  document.getElementById('mNetMonthly').textContent = fmtWon(res.netMonthly);
  document.getElementById('mNetRatio').textContent = `세전 대비 ${netRatio.toFixed(1)}%`;

  document.getElementById('mTotalDeduct').textContent = fmtWon(res.totalDeduct);
  document.getElementById('mDeductRatio').textContent = `공제율 ${deductRatio.toFixed(1)}%`;

  document.getElementById('mNetAnnual').textContent = fmtMan(res.netAnnual);
  document.getElementById('mGrossMonthly').textContent = `세전 월급 ${fmtWon(res.grossMonthly)}`;

  const deductBody = document.getElementById('deductTableBody');
  deductBody.innerHTML = `
    <tr><td>국민연금</td><td>4.5% (상한 적용)</td><td>${fmtWon(res.pension)}</td></tr>
    <tr><td>건강보험</td><td>3.545%</td><td>${fmtWon(res.health)}</td></tr>
    <tr><td>장기요양보험</td><td>건강보험의 12.95%</td><td>${fmtWon(res.care)}</td></tr>
    <tr><td>고용보험</td><td>0.9%</td><td>${fmtWon(res.employment)}</td></tr>
    <tr><td>근로소득세</td><td>간이세액 (${Math.round(taxRatio * 100)}%)</td><td class="red">${fmtWon(res.incomeTax)}</td></tr>
    <tr><td>지방소득세</td><td>소득세의 10%</td><td class="red">${fmtWon(res.localTax)}</td></tr>
    <tr><td>공제액 합계</td><td>총 ${deductRatio.toFixed(1)}%</td><td class="amber">${fmtWon(res.totalDeduct)}</td></tr>
  `;

  const invest30 = Math.round((res.netMonthly * 0.3) / 1e4);
  document.getElementById('investCtaText').innerHTML =
    `월 실수령액의 30%인 <strong>매월 ${invest30.toLocaleString('ko-KR')}만원</strong>을 배당·복리 투자하면 장기 자산이 얼마나 불어날까요?`;

  renderChart(res);
  salStatus.textContent = `✅ ${msg || `연봉 ${fmtMan(annualMan * 1e4)} 실수령액 계산 완료`}`;
}

function renderRefTable() {
  const brackets = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000];
  const tbody = document.getElementById('refTableBody');
  tbody.innerHTML = brackets
    .map((sal) => {
      const r = calcSalaryData(sal, 'separate', 20, 1, 0, 1.0);
      return `
        <tr>
          <td>${fmtMan(sal * 1e4)}</td>
          <td>${fmtWon(r.grossMonthly)}</td>
          <td>${fmtWon(r.insuranceTotal)}</td>
          <td class="red">${fmtWon(r.taxTotal)}</td>
          <td class="amber">${fmtWon(r.netMonthly)}</td>
        </tr>
      `;
    })
    .join('');
}

document.getElementById('calcBtn').addEventListener('click', () => runCalc());
document.querySelectorAll('[data-sal]').forEach((btn) => {
  btn.addEventListener('click', () => {
    elSalary.value = btn.dataset.sal;
    runCalc(`연봉 ${fmtMan(Number(btn.dataset.sal) * 1e4)} 프리셋 적용`);
  });
});

renderRefTable();
runCalc('기본값(연봉 6,000만원) 자동 계산됨');