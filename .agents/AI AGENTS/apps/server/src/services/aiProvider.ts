export type AIMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
};

export type AIImageInput = {
  mimeType: string;
  data: string;
  source?: string;
  filename?: string;
};

export interface AIProvider {
  generateResponse(messages: AIMessage[], systemInstruction?: string): Promise<string>;
  generateStructuredResponse<T>(payload: {
    messages: AIMessage[];
    systemInstruction?: string;
    fallbackValue: T;
  }): Promise<T>;
  generateToolCalls(messages: AIMessage[], tools: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>>;
  analyzeImage(screenshot: AIImageInput): Promise<Record<string, unknown>>;
  isConfigured(): boolean;
  getProvider(): string;
  getModel(): string;
}
