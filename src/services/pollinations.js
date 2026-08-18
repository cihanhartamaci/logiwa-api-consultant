const POLLINATIONS_CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const POLLINATIONS_TEXT_URL = 'https://gen.pollinations.ai/text';

/** Short prompt for fallback models — never send the full Gemini system instruction. */
export const POLLINATIONS_FALLBACK_SYSTEM_PROMPT = `You are AIntegration, a Logiwa WMS API expert.
Answer only from the retrieved Help Center and Swagger sources in the user message.
Cite [HC-...] and [API-...] source IDs. Do not invent endpoints, fields, or webhook names.
If sources are insufficient, say so. Be concise.`;

/** Cheap / free-tier friendly models, tried in order. */
export const POLLINATIONS_FALLBACK_MODELS = [
  'openai-fast',
  'mistral',
  'gemma',
  'nova-fast',
  'openai',
  'YoannDev90/gemma-4-31b:free',
];

function truncate(text, max = 1200) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * Compress retrieved Logiwa sources so free models stay within context limits.
 */
export function compactDocumentationSources(sources) {
  const helpCenter = (sources?.helpCenter || []).slice(0, 4).map((article) => ({
    sourceId: article.sourceId,
    title: article.title,
    url: article.url,
    content: truncate(article.content, 900),
  }));

  const swaggerSources = (sources?.swagger?.sources || []).slice(0, 5).map((item) => ({
    sourceId: item.sourceId,
    method: item.method,
    path: item.path,
    summary: truncate(item.summary, 240),
  }));

  const paths = {};
  Object.entries(sources?.swagger?.document?.paths || {})
    .slice(0, 5)
    .forEach(([path, methods]) => {
      paths[path] = {};
      Object.entries(methods || {}).forEach(([method, operation]) => {
        paths[path][method] = {
          summary: operation?.summary || '',
          description: truncate(operation?.description, 400),
          parameters: (operation?.parameters || []).slice(0, 8).map((param) => ({
            name: param.name,
            in: param.in,
            required: param.required,
            description: truncate(param.description, 160),
          })),
          requestBody: operation?.requestBody
            ? { description: truncate(operation.requestBody.description, 240) }
            : undefined,
        };
      });
    });

  return {
    query: sources?.query,
    coverage: sources?.coverage,
    helpCenter,
    swagger: {
      sources: swaggerSources,
      document: {
        openapi: sources?.swagger?.document?.openapi,
        info: {
          title: sources?.swagger?.document?.info?.title,
          version: sources?.swagger?.document?.info?.version,
        },
        paths,
      },
    },
  };
}

function buildMessages(systemInstruction, chatHistory, groundedUserPrompt) {
  const messages = [{ role: 'system', content: systemInstruction }];

  for (const msg of chatHistory.slice(0, -1).slice(-8)) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: truncate(msg.content, 1500) });
    } else if (msg.role === 'model') {
      messages.push({ role: 'assistant', content: truncate(msg.content || 'Understood.', 1500) });
    }
  }

  messages.push({ role: 'user', content: groundedUserPrompt });
  return messages;
}

function isPollinationsAuthError(error) {
  const message = String(error?.message || '');
  return /\(401\)|\(403\)/.test(message);
}

function authHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://cihanhartamaci.github.io/logiwa-api-consultant/',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function extractCompletionText(data, rawText) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
    if (joined) return joined;
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (typeof rawText === 'string' && rawText.trim() && !rawText.trim().startsWith('{')) {
    return rawText.trim();
  }
  return '';
}

async function requestChatCompletion({ apiKey, model, messages }) {
  const response = await fetch(POLLINATIONS_CHAT_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Pollinations ${model} failed (${response.status}): ${rawText.slice(0, 240)}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    if (rawText.trim()) return rawText.trim();
    throw new Error(`Pollinations ${model} returned non-JSON empty response.`);
  }

  const text = extractCompletionText(data, rawText);
  if (text) return text;
  throw new Error(`Pollinations ${model} returned an empty completion.`);
}

/** Prefer POST /text (plain response) — avoids giant GET URLs. */
async function requestTextPost({ apiKey, model, messages }) {
  const response = await fetch(POLLINATIONS_TEXT_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pollinations text ${model} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  if (!text.trim()) {
    throw new Error(`Pollinations text ${model} returned empty content.`);
  }

  // Some deployments wrap JSON even on /text
  try {
    const parsed = JSON.parse(text);
    const extracted = extractCompletionText(parsed, text);
    if (extracted) return extracted;
  } catch {
    // plain text
  }
  return text.trim();
}

/**
 * Free Pollinations fallback. Uses the same retrieved Logiwa sources as Gemini.
 * Optional apiKey improves reliability; without it, free/public access is attempted.
 */
export async function generatePollinationsFallback({
  apiKey = '',
  systemInstruction,
  chatHistory,
  groundedUserPrompt,
  onStatus = null,
}) {
  const messages = buildMessages(systemInstruction, chatHistory, groundedUserPrompt);
  const errors = [];

  for (const model of POLLINATIONS_FALLBACK_MODELS) {
    if (onStatus) onStatus('fallbackProvider', { provider: 'pollinations', model });

    try {
      return await requestTextPost({ apiKey, model, messages });
    } catch (textError) {
      errors.push(textError.message);
      if (isPollinationsAuthError(textError)) {
        throw new Error(
          'Pollinations rejected the API key (401/403). Create a free key at https://enter.pollinations.ai and paste it in the Pollinations field.',
          { cause: textError }
        );
      }
      try {
        return await requestChatCompletion({ apiKey, model, messages });
      } catch (chatError) {
        errors.push(chatError.message);
        if (isPollinationsAuthError(chatError)) {
          throw new Error(
            'Pollinations rejected the API key (401/403). Create a free key at https://enter.pollinations.ai and paste it in the Pollinations field.',
            { cause: chatError }
          );
        }
      }
    }
  }

  throw new Error(
    `Pollinations fallback exhausted. ${errors.slice(-3).join(' | ')}`
  );
}
