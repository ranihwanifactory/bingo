
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
    // ntfy.sh의 캐시된 메시지를 받지 않기 위해 필터링하거나 SSE 연결
    eventSource = new EventSource(`${NTFY_BASE_URL}/${topic}/sse`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          let payload = data.message;
          // ntfy는 가끔 이중 JSON 인코딩을 함
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              // 그냥 일반 텍스트인 경우 무시
              return;
            }
          }
          if (payload && typeof payload === 'object') {
            onMessage(payload);
          }
        }
      } catch (e) {
        console.warn("Message parsing failed:", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("SSE Connection Error. Retrying in 2s...", e);
      eventSource?.close();
      setTimeout(connect, 2000);
    };
  };

  connect();

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
};
