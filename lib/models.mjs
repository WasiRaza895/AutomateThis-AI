const providers = {
  gemini: {
    model: "gemini-3.5-flash-lite",
    request({ apiKey, model, instructions, input, schema }) {
      if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error("Invalid Gemini model");
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: { "x-goog-api-key": apiKey },
        body: {
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: input }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 4200 },
        },
      };
    },
    text: (data) => data.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought).map((part) => part.text ?? "").join(""),
  },
  claude: {
    model: "claude-haiku-5-5",
    request({ apiKey, model, instructions, input, schema }) {
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: {
          model, max_tokens: 4200, system: instructions,
          messages: [{ role: "user", content: input }],
          thinking: { type: "disabled" },
          output_config: { format: { type: "json_schema", schema } },
        },
      };
    },
    text: (data) => data.content?.filter((part) => part.type === "text").map((part) => part.text).join(""),
  },
  openai: {
    model: "gpt-5-mini",
    request({ apiKey, model, instructions, input, schema }) {
      return {
        url: "https://api.openai.com/v1/responses",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model, instructions, input, store: false, max_output_tokens: 4200, reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: "website_automation_audit", strict: true, schema } },
        },
      };
    },
    text: (data) => data.output?.filter((item) => item.type === "message").flatMap((item) => item.content)
      .filter((part) => part.type === "output_text").map((part) => part.text).join(""),
  },
};

export const supportsProvider = (provider) => typeof provider === "string" && Object.hasOwn(providers, provider);

export class ModelError extends Error {
  constructor(issue) {
    super("The AI analysis request could not be completed.");
    this.issue = issue;
  }
}

export async function requestAnalysis({ provider, apiKey, model, instructions, input, schema, fetch: send = fetch }) {
  if (!supportsProvider(provider)) throw new ModelError("unavailable");
  const adapter = providers[provider];
  const { url, headers, body } = adapter.request({ apiKey, model: model || adapter.model, instructions, input, schema });
  const signal = AbortSignal.timeout(26000);
  const response = await send(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) throw new ModelError("access");
    if (status === 402 || status === 429) throw new ModelError("limit");
    if (provider === "gemini" && status === 400) {
      const info = await response.json().catch(() => null);
      if (Array.isArray(info?.error?.details) && info.error.details.some((detail) => detail?.reason === "API_KEY_INVALID")) {
        throw new ModelError("access");
      }
    }
    throw new ModelError("unavailable");
  }
  return JSON.parse(adapter.text(await response.json()));
}
