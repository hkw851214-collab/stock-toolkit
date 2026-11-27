const API_VERSION = '1.2';

const POPULAR_KR_STOCKS = {
  '삼성전자': { code: '005930', suffix: '.KS' },
  'SK하이닉스': { code: '000660', suffix: '.KS' },
  '현대차': { code: '005380', suffix: '.KS' },
  '기아': { code: '000270', suffix: '.KS' },
  'LG에너지솔루션': { code: '373220', suffix: '.KS' },
  '삼성바이오로직스': { code: '207940', suffix: '.KS' },
  '셀트리온': { code: '068270', suffix: '.KS' },
  'NAVER': { code: '035420', suffix: '.KS' },
  '네이버': { code: '035420', suffix: '.KS' },
  '카카오': { code: '035720', suffix: '.KS' },
  '한화에어로스페이스': { code: '012450', suffix: '.KS' },
  '두산에너빌리티': { code: '034020', suffix: '.KS' },
  'POSCO홀딩스': { code: '005490', suffix: '.KS' },
  '삼성SDI': { code: '006400', suffix: '.KS' },
  '에코프로': { code: '086520', suffix: '.KQ' },
  '에코프로비엠': { code: '247540', suffix: '.KQ' },
  '알테오젠': { code: '196170', suffix: '.KQ' },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify({ ...body, version: API_VERSION }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=1800' : 'no-store',
    },
  });
}

async function fetchYahooChart(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !result.timestamp || !quote?.close) return null;

  const rawDates = result.timestamp;
  const rawOpens = quote.open || [];
  const rawHighs = quote.high || [];
  const rawLows = quote.low || [];
  const rawCloses = quote.close;

  const dates = [], opens = [], highs = [], lows = [], closes = [];

  for (let i = 0; i < rawDates.length; i++) {
    const cRaw = rawCloses[i];
    if (cRaw != null && !Number.isNaN(cRaw)) {
      const c = Number(cRaw.toFixed(2));
      const o = rawOpens[i] != null && !Number.isNaN(rawOpens[i]) ? Number(rawOpens[i].toFixed(2)) : c;
      const h = rawHighs[i] != null && !Number.isNaN(rawHighs[i]) ? Number(rawHighs[i].toFixed(2)) : Math.max(o, c);
      const l = rawLows[i] != null && !Number.isNaN(rawLows[i]) ? Number(rawLows[i].toFixed(2)) : Math.min(o, c);

      dates.push(new Date(rawDates[i] * 1000).toISOString().slice(0, 10));
      opens.push(o);
      highs.push(Math.max(h, o, c));
      lows.push(Math.min(l, o, c));
      closes.push(c);
    }
  }

  if (closes.length < 30) return null;
  return {
    name: result.meta?.shortName || result.meta?.longName || symbol,
    currency: result.meta?.currency || 'USD',
    dates,
    opens,
    highs,
    lows,
    closes,
  };
}

async function resolveKoreanStock(query) {
  if (/^\d{6}$/.test(query)) {
    return { code: query, name: query, suffix: null };
  }

  const normalized = query.replace(/\s+/g, '');
  for (const [k, v] of Object.entries(POPULAR_KR_STOCKS)) {
    if (k.toUpperCase() === normalized.toUpperCase()) {
      return { code: v.code, name: k, suffix: v.suffix };
    }
  }

  try {
    const acRes = await fetch(
      `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://m.stock.naver.com/',
          'Accept': 'application/json',
        },
      }
    );
    if (acRes.ok) {
      const acData = await acRes.json();
      const items = acData.items || [];
      const target = items.find((i) => i.nationCode === 'KOR') || items[0];
      if (target && target.code) {
        const suffix = (target.typeCode || '').toUpperCase().includes('KOSDAQ') ? '.KQ' : '.KS';
        return { code: target.code, name: target.name || query, suffix };
      }
    }
  } catch (_) {}

  try {
    const ySearch = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (ySearch.ok) {
      const yData = await ySearch.json();
      const quote = (yData.quotes || []).find(
        (q) => q.symbol && (q.symbol.endsWith('.KS') || q.symbol.endsWith('.KQ'))
      );
      if (quote) {
        const [code, ext] = quote.symbol.split('.');
        return { code, name: quote.shortname || query, suffix: `.${ext}` };
      }
    }
  } catch (_) {}

  return null;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') || '').trim();

  if (!query) {
    return jsonResponse({ error: '종목명 또는 티커를 입력해 주세요.' }, 400);
  }

  try {
    const isKrCode = /^\d{6}$/.test(query);
    const hasKorean = /[가-힣]/.test(query);

    if (isKrCode || hasKorean) {
      const info = await resolveKoreanStock(query);
      if (!info) {
        return jsonResponse(
          { error: `'${query}' 국내 종목을 찾지 못했습니다. 6자리 종목코드(예: 005930)로도 검색할 수 있습니다.` },
          404
        );
      }

      const suffixes = info.suffix ? [info.suffix, info.suffix === '.KS' ? '.KQ' : '.KS'] : ['.KS', '.KQ'];
      let chart = null;

      for (const sfx of suffixes) {
        chart = await fetchYahooChart(`${info.code}${sfx}`);
        if (chart) break;
      }

      if (!chart) {
        return jsonResponse({ error: `'${info.name}'(${info.code})의 최근 1년 주가 데이터를 불러오지 못했습니다.` }, 404);
      }

      return jsonResponse({
        name: info.name,
        symbol: info.code,
        market: 'KR',
        currency: 'KRW',
        dates: chart.dates,
        opens: chart.opens,
        highs: chart.highs,
        lows: chart.lows,
        closes: chart.closes,
      });
    } else {
      const symbol = query.toUpperCase();
      const chart = await fetchYahooChart(symbol);

      if (!chart) {
        return jsonResponse({ error: `'${symbol}' 티커를 찾을 수 없습니다.` }, 404);
      }

      return jsonResponse({
        name: chart.name,
        symbol,
        market: 'US',
        currency: chart.currency,
        dates: chart.dates,
        opens: chart.opens,
        highs: chart.highs,
        lows: chart.lows,
        closes: chart.closes,
      });
    }
  } catch (err) {
    return jsonResponse({ error: `데이터 조회 오류: ${err.message}` }, 500);
  }
}
