const POLLINATIONS_CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const POLLINATIONS_TEXT_URL = 'https://gen.pollinations.ai/text';

/** Cheap / free-tier friendly models, tried in order. */
export const POLLINATIONS_FALLBACK_MODELS = [
  'openai-fast',
  'mistral',
  'gemma',
  'nova-fast',
  'openai',
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

  const swaggerSources = (sources?.swagger?.sources || []).slice(0, 6).map((item) => ({
    sourceId: item.sourceId,
    method: item.method,
    path: item.path,
    summary: truncate(item.summary, 240),
  }));

  const paths = {};
  Object.entries(sources?.swagger?.document?.paths || {})
    .slice(0, 6)
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
        info: sources?.swagger?.document?.info,
        paths,
      },
    },
  };
}

function buildMessages(systemInstruction, chatHistory, groundedUserPrompt) {
  const messages = [{ role: 'system', content: systemInstruction }];

  for (const msg of chatHistory.slice(0, -1)) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'model') {
      messages.push({ role: 'assistant', content: msg.content || 'Understood.' });
    }
  }

  messages.push({ role: 'user', content: groundedUserPrompt });
  return messages;
}

async function requestChatCompletion({ apiKey, model, messages }) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(POLLINATIONS_CHAT_URL, {
    method: 'POST',
    headers,
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
    // Some gateways return plain text
    if (rawText.trim()) return rawText.trim();
    throw new Error(`Pollinations ${model} returned non-JSON empty response.`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
    if (joined) return joined;
  }

  throw new Error(`Pollinations ${model} returned an empty completion.`);
}

async function requestSimpleText({ apiKey, model, systemInstruction, groundedUserPrompt }) {
  const prompt = encodeURIComponent(
    `${systemInstruction}\n\nUSER QUESTION + SOURCES:\n${groundedUserPrompt}`
  );
  const url = `${POLLINATIONS_TEXT_URL}/${prompt}?model=${encodeURIComponent(model)}`;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pollinations text ${model} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  if (!text.trim()) {
    throw new Error(`Pollinations text ${model} returned empty content.`);
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
      return await requestChatCompletion({ apiKey, model, messages });
    } catch (chatError) {
      errors.push(chatError.message);
      try {
        return await requestSimpleText({
          apiKey,
          model,
          systemInstruction,
          groundedUserPrompt,
        });
      } catch (textError) {
        errors.push(textError.message);
      }
    }
  }

  throw new Error(
    `Pollinations fallback exhausted. ${errors.slice(-3).join(' | ')}`
  );
}
