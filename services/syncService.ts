
// ntfy.sh를 이용한 간단한 실시간 메시징 서비스
const NTFY_BASE_URL = 'https://ntfy.sh';

export const publishMessage = async (matchId: string, payload: any) => {
  try {
    await fetch(`${NTFY_BASE_URL}/${matchId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('Publish error:', e);
  }
};

export const subscribeToMatch = (matchId: string, onMessage: (data: any) => void) => {
  const eventSource = new EventSource(`${NTFY_BASE_URL}/${matchId}/sse`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.message) {
        const payload = JSON.parse(data.message);
        onMessage(payload);
      }
    } catch (e) {
      // 메시지가 JSON 형식이 아닐 경우 무시
    }
  };

  eventSource.onerror = (e) => {
    console.error('SSE Error:', e);
  };

  return () => {
    eventSource.close();
  };
};
