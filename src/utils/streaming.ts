export async function* parseSSE(response: Response): AsyncGenerator<any, void, unknown> {
  if (!response.body) {
    throw new Error('Missing response body for SSE stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip noise: comments, event names, empty lines
      if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) {
        continue;
      }

      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          yield JSON.parse(data);
        } catch {
          console.error('Failed to parse SSE data:', data);
        }
      }
    }
  }
}
