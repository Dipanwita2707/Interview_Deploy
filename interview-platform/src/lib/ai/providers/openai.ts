import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";

export class OpenAIProvider implements LLMProvider {
  id = "openai";
  name = "OpenAI";
  models = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];
  defaultModel = "gpt-4.1-mini";

  private client: OpenAI;
  private useResponsesApi: boolean;

  constructor() {
    const baseURL = process.env.OPENAI_BASE_URL;
    const apiKey = process.env.OPENAI_API_KEY ?? "";

    // Azure AI Foundry (services.ai.azure.com) uses standard Bearer auth.
    // Classic Azure OpenAI (*.openai.azure.com) uses the api-key header + api-version query param.
    const isClassicAzure = baseURL?.includes(".openai.azure.com");
    const isFoundryAzure = baseURL?.includes("services.ai.azure.com");
    const needsApiVersion = isClassicAzure && !baseURL?.includes("/openai/v1");
    this.useResponsesApi = Boolean(baseURL?.includes("/openai/v1"));

    this.client = new OpenAI({
      apiKey,
      baseURL,
      ...(isClassicAzure && {
        // Classic Azure requires api-key header and api-version query param
        defaultHeaders: { "api-key": apiKey },
        ...(needsApiVersion && {
          defaultQuery: { "api-version": process.env.AZURE_OPENAI_API_VERSION ?? "2024-11-20" },
        }),
      }),
      // Foundry uses standard Authorization: Bearer <key> — OpenAI SDK handles this by default
    });
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content as string & Array<unknown>,
    })) as ChatCompletionMessageParam[];
  }

  private toResponsesInput(messages: LLMMessage[]) {
    return messages.map((m) => ({
      type: "message",
      role: m.role,
      content:
        typeof m.content === "string"
          ? [{ type: "input_text", text: m.content }]
          : m.content.map((part) =>
              part.type === "text"
                ? { type: "input_text", text: part.text }
                : { type: "input_image", image_url: part.image_url.url }
            ),
    }));
  }

  private extractResponseText(response: any): string {
    if (typeof response.output_text === "string" && response.output_text.length > 0) {
      return response.output_text;
    }

    const outputs = Array.isArray(response.output) ? response.output : [];
    const texts: string[] = [];
    for (const item of outputs) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        if (typeof part?.text === "string") {
          texts.push(part.text);
        }
      }
    }
    return texts.join("");
  }

  async generateResponse(
    params: GenerationParams & { model?: string }
  ): Promise<LLMResponse> {
    const model = params.model ?? this.defaultModel;
    if (this.useResponsesApi) {
      const response: any = await this.client.responses.create({
        model,
        input: this.toResponsesInput(params.messages) as any,
        temperature: params.temperature ?? 0.7,
        max_output_tokens: params.maxTokens ?? 2048,
      });

      return {
        content: this.extractResponseText(response),
        finishReason: response.status ?? "completed",
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    }

    const response = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? "",
      finishReason: choice.finish_reason ?? "stop",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *streamResponse(
    params: GenerationParams & { model?: string }
  ): AsyncIterable<string> {
    const model = params.model ?? this.defaultModel;
    if (this.useResponsesApi) {
      const response = await this.generateResponse(params);
      if (response.content) {
        yield response.content;
      }
      return;
    }

    const stream = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
