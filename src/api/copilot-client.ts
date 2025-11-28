import type { HeadersInit } from 'bun';
import { parseSSE } from '../utils/streaming';

const COPILOT_HEADERS = {
  'Editor-Version': `Bun/${Bun.version}`,
  'Editor-Plugin-Version': 'copilot-scripts/0.1.0',
  'Copilot-Integration-Id': 'vscode-chat',
};

export class CopilotClient {
  constructor(private token: string) {}

  private get baseURL() {
    return 'https://api.githubcopilot.com';
  }

  private getHeaders(extra: Record<string, string> = {}): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      ...COPILOT_HEADERS,
      ...extra,
    };
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<T>;
  }

  async *stream(path: string, body: unknown): AsyncGenerator<any, void, unknown> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Stream error ${response.status}: ${await response.text()}`);
    }

    yield* parseSSE(response);
  }
}
