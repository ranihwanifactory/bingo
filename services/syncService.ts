
const NTFY_BASE_URL = 'https://ntfy.sh';

export const publishMessage = async (matchId: string, payload: any) => {
  if (!matchId) return;
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  try {
    await fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to publish message:', error);
  }
};

export const subscribeToMatch = (matchId: string, onMessage: (data: any) => void) => {
  if (!matchId) return () => {};
  
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  const eventSource = new EventSource(`${NTFY_BASE_URL}/${topic}/sse`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.message) {
        // ntfy는 종종 메시지가 문자열로 중첩될 수 있음
        let payload = data.message;
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch (e) {
            // plain text if not JSON
          }
        }
        onMessage(payload);
      }
    } catch (e) {
      console.warn("Parsing message failed", e);
    }
  };

  eventSource.onerror = (e) => {
    console.error("SSE Connection Error", e);
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
};
