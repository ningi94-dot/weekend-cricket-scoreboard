export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AiToolExecutor = (name: string, argumentsValue: unknown) => Promise<unknown>;

export type AiProviderRequest = {
  instructions: string;
  messages: AiChatMessage[];
  tools: AiToolDefinition[];
  executeTool: AiToolExecutor;
};

export type AiProviderResult = {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
};

export interface AiProvider {
  answer(request: AiProviderRequest): Promise<AiProviderResult>;
}
