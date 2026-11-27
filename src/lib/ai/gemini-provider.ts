import type { AiProvider, AiProviderRequest, AiProviderResult } from "@/lib/ai/types";

type GeminiTextContent = {
  type?: "text";
  text?: string;
};

type GeminiStep = {
  type?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  content?: GeminiTextContent[];
  [key: string]: unknown;
};

type GeminiInteraction = {
  status?: string;
  steps?: GeminiStep[];
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
  error?: {
    code?: number | string;
    message?: string;
    status?: string;
  };
};

const MAX_TOOL_ROUNDS = 4;
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

export class GeminiProvider implements AiProvider {
  async answer(request: AiProviderRequest): Promise<AiProviderResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const model = process.env.AI_MODEL || "gemini-3.5-flash-lite";
    const inputRate = readPositiveNumber(process.env.AI_INPUT_COST_PER_MILLION_USD, 0);
    const outputRate = readPositiveNumber(process.env.AI_OUTPUT_COST_PER_MILLION_USD, 0);
    const history: GeminiStep[] = [{
      type: "user_input",
      content: [{ type: "text", text: formatConversation(request.messages) }],
    }];
    const tools = request.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
    let inputTokens = 0;
    let outputTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
          "api-revision": "2026-05-20",
        },
        body: JSON.stringify({
          model,
          store: false,
          system_instruction: request.instructions,
          input: history,
          tools,
          generation_config: {
            thinking_level: "low",
            max_output_tokens: 1200,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json().catch(() => ({})) as GeminiInteraction;
      if (!response.ok) {
        const detail = body.error?.message || body.error?.status || `request failed with status ${response.status}`;
        throw new Error(`Gemini request failed with status ${response.status}: ${detail}`);
      }
      if (body.status === "failed") {
        throw new Error(`Gemini request failed: ${body.error?.message || "unknown provider error"}.`);
      }

      inputTokens += body.usage?.total_input_tokens ?? 0;
      outputTokens += body.usage?.total_output_tokens ?? 0;
      const steps = body.steps ?? [];
      const toolCalls = steps.filter(isFunctionCall);
      if (!toolCalls.length) {
        const text = extractOutputText(steps);
        if (!text) throw new Error("Gemini returned an empty response.");
        return {
          text,
          provider: "gemini",
          model,
          inputTokens,
          outputTokens,
          estimatedCostMicros: Math.ceil(inputTokens * inputRate + outputTokens * outputRate),
        };
      }

      history.push(...steps);
      for (const call of toolCalls) {
        const result = await request.executeTool(call.name, call.arguments ?? {});
        history.push({
          type: "function_result",
          name: call.name,
          call_id: call.id,
          result: [{ type: "text", text: JSON.stringify(result) }],
        });
      }
    }

    throw new Error("The AI assistant used too many analytics steps for one question.");
  }
}

function isFunctionCall(step: GeminiStep): step is GeminiStep & { id: string; name: string } {
  return step.type === "function_call" && typeof step.id === "string" && typeof step.name === "string";
}

function extractOutputText(steps: GeminiStep[]) {
  return steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function formatConversation(messages: AiProviderRequest["messages"]) {
  return messages
    .map((message) => `${message.role === "user" ? "USER" : "ASSISTANT"}:\n${message.content}`)
    .join("\n\n");
}

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
