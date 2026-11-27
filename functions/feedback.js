function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { type = '기타 문의', page = '전체', message = '', email = '', website = '' } = body || {};

    // 1. 스팸 봇 차단 (사람에게는 안 보이는 숨김 필드에 값이 채워지면 조용히 무시)
    if (String(website).trim() !== '') {
      return jsonRes({ ok: true });
    }

    const cleanMsg = String(message).trim();
    if (cleanMsg.length < 5) {
      return jsonRes({ error: '내용을 5자 이상 입력해 주세요.' }, 400);
    }
    if (cleanMsg.length > 1500) {
      return jsonRes({ error: '내용은 1,500자 이내로 입력해 주세요.' }, 400);
    }

    const webhookUrl = context.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return jsonRes({ error: '서버 알림 설정(DISCORD_WEBHOOK_URL)이 아직 등록되지 않았습니다.' }, 500);
    }

    const kstTime = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16);
    const cleanEmail = String(email).trim() || '미입력';

    const discordContent = [
      `📩 **[스마트 투자 툴킷 새 제보]** (${kstTime} KST)`,
      `• **유형:** ${String(type).slice(0, 30)}`,
      `• **관련 메뉴:** ${String(page).slice(0, 30)}`,
      `• **회신 이메일:** ${cleanEmail.slice(0, 80)}`,
      `• **내용:**\n\`\`\`\n${cleanMsg.slice(0, 1400)}\n\`\`\``,
    ].join('\n');

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: discordContent }),
    });

    if (!res.ok) {
      return jsonRes({ error: '알림 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, 502);
    }

    return jsonRes({ ok: true });
  } catch (err) {
    return jsonRes({ error: '요청 처리 중 오류가 발생했습니다.' }, 500);
  }
}