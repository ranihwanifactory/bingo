
const NTFY_BASE_URL = 'https://ntfy.sh';

export const publishMessage = async (matchId: string, payload: any) => {
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
  const topic = `neon-bingo-${matchId.toLowerCase().trim()}`;
  const eventSource = new EventSource(`${NTFY_BASE_URL}/${topic}/sse`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.message) {
        const payload = JSON.parse(data.message);
        onMessage(payload);
      }
    } catch (e) {}
  };

  return () => {
    eventSource.close();
  };
};
