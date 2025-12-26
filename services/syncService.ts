
/**
 * ntfy.sh는 별도의 가입이나 키 없이 사용할 수 있는 공용 메시지 릴레이 서비스입니다.
 * 이를 활용해 매치 코드별로 실시간 동기화를 구현합니다.
 */

const NTFY_BASE_URL = 'https://ntfy.sh';

export const publishMark = async (matchId: string, value: number) => {
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  try {
    await fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'mark', value }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to publish mark:', error);
  }
};

export const subscribeToMatch = (matchId: string, onMessage: (data: any) => void) => {
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  // EventSource를 사용하여 실시간 스트림 구독
  const eventSource = new EventSource(`${NTFY_BASE_URL}/${topic}/sse`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      // ntfy.sh의 메시지 본문은 'message' 필드에 담겨 오거나 JSON으로 올 수 있음
      if (data.message) {
        const payload = JSON.parse(data.message);
        onMessage(payload);
      }
    } catch (e) {
      // 일반 텍스트 메시지 무시
    }
  };

  return () => {
    eventSource.close();
  };
};
