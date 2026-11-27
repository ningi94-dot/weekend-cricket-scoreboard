import { OpenAiProvider } from "@/lib/ai/openai-provider";
import type { AiProvider } from "@/lib/ai/types";

export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "openai") return new OpenAiProvider();
  throw new Error(`AI provider '${provider}' is not supported by this deployment.`);
}
