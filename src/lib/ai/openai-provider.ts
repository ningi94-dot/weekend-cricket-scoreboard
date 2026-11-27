import type { AiProvider, AiProviderRequest, AiProviderResult } from "@/lib/ai/types";

type OpenAiOutputItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: { type?: string; text?: string }[];
};

type OpenAiResponse = {
  id?: string;
  output?: OpenAiOutputItem[];
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

const MAX_TOOL_ROUNDS = 4;

export class OpenAiProvider implements AiProvider {
  async answer(request: AiProviderRequest): Promise<AiProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

    const model = process.env.AI_MODEL || "gpt-6-luna";
    const inputRate = readPositiveNumber(process.env.AI_INPUT_COST_PER_MILLION_USD, 0.1);
    const outputRate = readPositiveNumber(process.env.AI_OUTPUT_COST_PER_MILLION_USD, 0.5);
    const input: unknown[] = request.messages.map((message) => ({ role: message.role, content: message.content }));
    let inputTokens = 0;
    let outputTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: request.instructions,
          input,
          tools: request.tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters, strict: true })),
          tool_choice: "auto",
          reasoning: { effort: "low" },
          max_output_tokens: 1200,
          store: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json().catch(() => ({})) as OpenAiResponse;
      if (!response.ok) throw new Error(body.error?.message || `OpenAI request failed with status ${response.status}.`);

      inputTokens += body.usage?.input_tokens ?? 0;
      outputTokens += body.usage?.output_tokens ?? 0;
      const outputItems = body.output ?? [];
      const toolCalls = outputItems.filter((item) => item.type === "function_call" && item.name && item.call_id);
      if (!toolCalls.length) {
        const text = body.output_text || extractOutputText(outputItems);
        if (!text) throw new Error("The AI provider returned an empty response.");
        return {
          text,
          provider: "openai",
          model,
          inputTokens,
          outputTokens,
          estimatedCostMicros: Math.ceil(inputTokens * inputRate + outputTokens * outputRate),
        };
      }

      input.push(...outputItems);
      for (const call of toolCalls) {
        let parsedArguments: unknown = {};
        try {
          parsedArguments = JSON.parse(call.arguments || "{}");
        } catch {
          parsedArguments = {};
        }
        const result = await request.executeTool(call.name!, parsedArguments);
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
      }
    }

    throw new Error("The AI assistant used too many analytics steps for one question.");
  }
}

function extractOutputText(items: OpenAiOutputItem[]) {
  return items
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
