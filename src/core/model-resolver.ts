import { CopilotClient } from '../api/copilot-client';
import { CopilotModel, fetchModels } from '../api/models';

export class ModelResolver {
  private cache: { models: CopilotModel[]; expiresAt: number } | null = null;

  constructor(private client: CopilotClient) {}

  async resolve(spec: string): Promise<CopilotModel> {
    const models = await this.getModels();

    const shortcutPatterns: Record<string, RegExp> = {
      g: /^gpt/i,
      c: /^claude/i,
      i: /^gemini/i,
      o: /^o\\d/i,
    };

    const pattern = shortcutPatterns[spec.toLowerCase()];
    if (pattern) {
      const found = models.find(m => pattern.test(m.id));
      if (found) return found;
    }

    let found = models.find(m => m.id === spec);
    if (found) return found;

    found = models.find(
      m =>
        m.id.toLowerCase().includes(spec.toLowerCase()) ||
        m.name.toLowerCase().includes(spec.toLowerCase()),
    );
    if (found) return found;

    throw new Error(
      `Model not found: ${spec}. Available models:\n${models
        .map(m => `  ${m.id}`)
        .join('\n')}`,
    );
  }

  private async getModels(): Promise<CopilotModel[]> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt) {
      return this.cache.models;
    }

    const models = await fetchModels(this.client);
    this.cache = { models, expiresAt: now + 300000 };
    return models;
  }
}
