export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') || '').trim();

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800',
  };

  if (!query) {
    return new Response(JSON.stringify({ error: '종목명 또는 티커를 입력해 주세요.' }), { status: 400, headers });
  }

  try {
    const isKrCode = /^\d{6}$/.test(query);
    const hasKorean = /[가-힣]/.test(query);

    if (isKrCode || hasKorean) {
      let code = query;
      let name = query;

      // 한글 종목명이면 네이버 자동완성 API로 6자리 종목코드 조회
      if (hasKorean) {
        const acRes = await fetch(
          `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const acData = await acRes.json();
        const items = acData.items || [];
        const target = items.find((i) => i.nationCode === 'KOR') || items[0];

        if (!target) {
          return new Response(JSON.stringify({ error: `'${query}' 종목을 찾을 수 없습니다.` }), { status: 404, headers });
        }
        code = target.code;
        name = target.name;
      }

      // 네이버 금융 최근 1년(약 250거래일) 일봉 수집
      const pRes = await fetch(
        `https://m.stock.naver.com/api/stock/${code}/price?pageSize=250&page=1`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const pData = await pRes.json();

      if (!Array.isArray(pData) || pData.length < 30) {
        return new Response(JSON.stringify({ error: '시뮬레이션에 필요한 과거 주가 데이터가 부족합니다.' }), { status: 404, headers });
      }

      const reversed = pData.reverse();
      const dates = reversed.map((d) => d.localTradedAt);
      const closes = reversed.map((d) => Number(String(d.closePrice).replace(/,/g, '')));

      return new Response(
        JSON.stringify({ name, symbol: code, market: 'KR', currency: 'KRW', dates, closes }),
        { status: 200, headers }
      );
    } else {
      // 미국 종목 (티커 기준, 예: NVDA, SCHD, AAPL)
      const symbol = query.toUpperCase();
      const yRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const yData = await yRes.json();
      const result = yData?.chart?.result?.[0];

      if (!result || !result.timestamp) {
        return new Response(JSON.stringify({ error: `'${symbol}' 티커를 찾을 수 없습니다.` }), { status: 404, headers });
      }

      const rawDates = result.timestamp;
      const rawCloses = result.indicators.quote[0].close;
      const dates = [];
      const closes = [];

      for (let i = 0; i < rawDates.length; i++) {
        if (rawCloses[i] != null) {
          const dt = new Date(rawDates[i] * 1000).toISOString().slice(0, 10);
          dates.push(dt);
          closes.push(Number(rawCloses[i].toFixed(2)));
        }
      }

      if (closes.length < 30) {
        return new Response(JSON.stringify({ error: '과거 주가 데이터가 부족합니다.' }), { status: 404, headers });
      }

      const name = result.meta?.shortName || symbol;
      return new Response(
        JSON.stringify({ name, symbol, market: 'US', currency: result.meta?.currency || 'USD', dates, closes }),
        { status: 200, headers }
      );
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: '데이터 조회 중 일시적 오류가 발생했습니다.' }), { status: 500, headers });
  }
}