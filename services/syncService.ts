
const NTFY_BASE_URL = 'https://ntfy.sh';

export const publishMessage = async (matchId: string, payload: any) => {
  if (!matchId) return;
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  try {
    const response = await fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Publish failed');
  } catch (error) {
    console.error('Failed to publish message:', error);
  }
};

export const subscribeToMatch = (matchId: string, onMessage: (data: any) => void) => {
  if (!matchId) return () => {};
  
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  let eventSource: EventSource | null = null;
  
  const connect = () => {
    eventSource = new EventSource(`${NTFY_BASE_URL}/${topic}/sse`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          let payload = data.message;
          // ntfy는 메시지를 문자열로 한 번 더 감싸는 경우가 많음
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              // 일반 문자열일 경우 그대로 사용하거나 무시
              return;
            }
          }
          if (payload && typeof payload === 'object') {
            onMessage(payload);
          }
        }
      } catch (e) {
        console.warn("Parsing message failed", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("SSE Connection Error, retrying...", e);
      eventSource?.close();
      setTimeout(connect, 2000); // 2초 후 재연결 시도
    };
  };

  connect();

  return () => {
    eventSource?.close();
  };
};
