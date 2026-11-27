const API_VERSION = '2.1';

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
  '한화오션': { code: '042660', suffix: '.KS' },
  '두산에너빌리티': { code: '034020', suffix: '.KS' },
  'POSCO홀딩스': { code: '005490', suffix: '.KS' },
  '삼성SDI': { code: '006400', suffix: '.KS' },
  'KB금융': { code: '105560', suffix: '.KS' },
  '신한지주': { code: '055550', suffix: '.KS' },
  'HD현대중공업': { code: '329180', suffix: '.KS' },
  '한미반도체': { code: '042700', suffix: '.KS' },
  '에코프로': { code: '086520', suffix: '.KQ' },
  '에코프로비엠': { code: '247540', suffix: '.KQ' },
  '알테오젠': { code: '196170', suffix: '.KQ' },
  'HLB': { code: '028300', suffix: '.KQ' },
  '레인보우로보틱스': { code: '277810', suffix: '.KQ' },
};

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
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

// 1순위 (국내 전용): 네이버 차트 전용 서버 (코스피/코스닥 구분 불필요, OHLC 일봉)
async function fetchNaverFchart(code) {
  try {
    const res = await fetch(
      `https://fchart.stock.naver.com/sise.nhn?symbol=${encodeURIComponent(code)}&timeframe=day&count=250&requestType=0`,
      { headers: { ...COMMON_HEADERS, Referer: 'https://finance.naver.com/' } }
    );
    if (!res.ok) return { ok: false, reason: `naver:${res.status}` };

    const text = await res.text();
    const regex = /<item\s+data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|[\d.]*"/g;
    const dates = [], opens = [], highs = [], lows = [], closes = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      const d = match[1];
      const o = Number(match[2]);
      const h = Number(match[3]);
      const l = Number(match[4]);
      const c = Number(match[5]);
      if (c > 0 && !Number.isNaN(c)) {
        dates.push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
        opens.push(o > 0 ? o : c);
        highs.push(Math.max(h > 0 ? h : c, o > 0 ? o : c, c));
        lows.push(Math.min(l > 0 ? l : c, o > 0 ? o : c, c));
        closes.push(c);
      }
    }

    if (closes.length < 30) return { ok: false, reason: `naver:short(${closes.length})` };
    return {
      ok: true,
      source: 'naver-fchart',
      data: { currency: 'KRW', dates, opens, highs, lows, closes },
    };
  } catch (e) {
    return { ok: false, reason: `naver:err` };
  }
}

// 2·3순위 (국내 백업 & 미국 메인): 야후 파이낸스 query1 / query2 이중화
async function fetchYahooChart(symbol) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  const reasons = [];

  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
        { headers: { ...COMMON_HEADERS, Accept: 'application/json' } }
      );
      if (!res.ok) {
        reasons.push(`${host.slice(0, 6)}:${res.status}`);
        continue;
      }

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      if (!result || !result.timestamp || !quote?.close) {
        reasons.push(`${host.slice(0, 6)}:empty`);
        continue;
      }

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

      if (closes.length < 30) {
        reasons.push(`${host.slice(0, 6)}:short(${closes.length})`);
        continue;
      }

      return {
        ok: true,
        source: host.slice(0, 6),
        data: {
          name: result.meta?.shortName || result.meta?.longName || symbol,
          currency: result.meta?.currency || 'USD',
          dates,
          opens,
          highs,
          lows,
          closes,
        },
      };
    } catch (_) {
      reasons.push(`${host.slice(0, 6)}:err`);
    }
  }

  return { ok: false, reason: reasons.join(',') };
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

  // 네이버 자동완성 API
  try {
    const acRes = await fetch(
      `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`,
      { headers: { ...COMMON_HEADERS, Referer: 'https://m.stock.naver.com/', Accept: 'application/json' } }
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

  // 야후 검색 API 백업
  try {
    const ySearch = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`,
      { headers: COMMON_HEADERS }
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
          { error: `'${query}' 국내 종목을 찾지 못했습니다. 6자리 종목코드(예: 005930)로 입력해 보세요.` },
          404
        );
      }

      const failLogs = [];

      // 1순위: 네이버 차트 전용 서버
      const naverRes = await fetchNaverFchart(info.code);
      if (naverRes.ok) {
        return jsonResponse({
          name: info.name,
          symbol: info.code,
          market: 'KR',
          source: naverRes.source,
          ...naverRes.data,
        });
      }
      failLogs.push(naverRes.reason);

      // 2·3순위: 야후 query1 / query2 (.KS / .KQ)
      const suffixes = info.suffix ? [info.suffix, info.suffix === '.KS' ? '.KQ' : '.KS'] : ['.KS', '.KQ'];
      for (const sfx of suffixes) {
        const yRes = await fetchYahooChart(`${info.code}${sfx}`);
        if (yRes.ok) {
          return jsonResponse({
            name: info.name,
            symbol: info.code,
            market: 'KR',
            source: yRes.source,
            ...yRes.data,
            currency: 'KRW',
          });
        }
        failLogs.push(`${sfx}:${yRes.reason}`);
      }

      return jsonResponse(
        { error: `'${info.name}'(${info.code}) 시세 조회 실패 [${failLogs.join(' | ')}]` },
        502
      );
    } else {
      const symbol = query.toUpperCase();
      const yRes = await fetchYahooChart(symbol);
      if (!yRes.ok) {
        return jsonResponse(
          { error: `'${symbol}' 티커를 찾을 수 없습니다. [${yRes.reason}]` },
          404
        );
      }

      return jsonResponse({
        symbol,
        market: 'US',
        source: yRes.source,
        ...yRes.data,
      });
    }
  } catch (err) {
    return jsonResponse({ error: `서버 내부 오류: ${err.message}` }, 500);
  }
}
