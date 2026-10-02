import { env } from '../config/env.js';
import type { AIImageInput, AIMessage, AIProvider } from './aiProvider.js';

export class OpenRouterService implements AIProvider {
  constructor(private readonly apiKey = env.openRouterApiKey, private readonly model = env.openRouterModel) {}

  getProvider() {
    return 'openrouter';
  }

  getModel() {
    return this.model;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim());
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error('OpenRouter API key is not configured.');
    }
  }

  async generateResponse(messages: AIMessage[], systemInstruction?: string): Promise<string> {
    this.assertConfigured();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:4000',
        'X-Title': 'Personal AI Agent'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          ...messages.map((message) => ({ role: message.role, content: message.content }))
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>; 
    };

    return data.choices?.[0]?.message?.content ?? 'No response generated.';
  }

  async generateStructuredResponse<T>(payload: {
    messages: AIMessage[];
    systemInstruction?: string;
    fallbackValue: T;
  }): Promise<T> {
    try {
      const text = await this.generateResponse(payload.messages, payload.systemInstruction);
      return JSON.parse(text) as T;
    } catch {
      return payload.fallbackValue;
    }
  }

  async generateToolCalls(messages: AIMessage[], tools: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
    this.assertConfigured();

    const response = await this.generateStructuredResponse({
      messages,
      systemInstruction: `Return only valid JSON representing tool calls for these tools: ${JSON.stringify(tools)}`,
      fallbackValue: []
    });

    if (!Array.isArray(response)) {
      return [];
    }

    return response.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }

  async analyzeImage(screenshot: AIImageInput): Promise<Record<string, unknown>> {
    this.assertConfigured();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:4000',
        'X-Title': 'Personal AI Agent'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this screenshot and return JSON matching a screen element schema.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${screenshot.mimeType};base64,${screenshot.data}`
                }
              }
            ]
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter vision request failed: ${response.status} ${body}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>; 
    };

    const text = data.choices?.[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { screenDescription: text, elements: [], status: 'unavailable', requiresConfirmation: true, source: screenshot.source ?? 'local-agent-screenshot' };
    }
  }
}
