const POLLINATIONS_CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const POLLINATIONS_TEXT_URL = 'https://gen.pollinations.ai/text';

/** Short prompt for fallback models — never send the full Gemini system instruction. */
export const POLLINATIONS_FALLBACK_SYSTEM_PROMPT = `You are AIntegration, a Logiwa WMS API expert.
This is an ongoing chat. Continue the same topic; resolve follow-ups from earlier turns.
Answer from the retrieved Help Center, Magna-Tiles knowledge docs, and Swagger sources plus the conversation so far.
Blend the operational workflow with implementation guides and the API contract: method, path, request fields, and response fields.
Cite [HC-...], [KB-...], and [API-...] source IDs. Do not invent endpoints, fields, or webhook names.
If sources and prior turns are insufficient, say so. Be concise.`;

/**
 * Official Pollinations aliases. These usually need pollen once the free wallet is empty.
 * `openai` is intentionally omitted — it is one of the more expensive defaults and returns 402 at 0 balance.
 */
export const POLLINATIONS_OFFICIAL_MODELS = [
  'nova-fast',
  'qwen-coder',
  'openai-fast',
  'gemma',
  'deepseek',
  'mistral',
];

/**
 * Static cascade used when the live /text/models list cannot be fetched.
 * Zero-pollen community models first, then cheap official aliases.
 */
export const POLLINATIONS_FALLBACK_MODELS = [
  'chigwell/llm7-fast',
  'MarcosFRG/nemotron-3.5-lightning-30b',
  'YoannDev90/muse-glimmer-30b:free',
  'morriszdweck/osaii-api-smart',
  'chirag-gamer/gpt-oss-120b',
  ...POLLINATIONS_OFFICIAL_MODELS,
];

const POLLINATIONS_MODELS_URL = 'https://gen.pollinations.ai/text/models';
let cachedFallbackModelsPromise = null;

export function resetPollinationsModelCache() {
  cachedFallbackModelsPromise = null;
}

export function pollinationsErrorKind(error) {
  const message = String(error?.message || '');
  if (/\(401\)|\(403\)/.test(message)) return 'auth';
  if (/\(402\)|PAYMENT_REQUIRED|Insufficient balance/i.test(message)) return 'payment';
  if (/Invalid model or alias/i.test(message) || /\(400\).*Invalid model/i.test(message)) {
    return 'invalid_model';
  }
  return 'other';
}

function isZeroPollenModel(model) {
  const pricing = model?.pricing || {};
  return (
    Number(pricing.promptTextTokens || 0) === 0 &&
    Number(pricing.completionTextTokens || 0) === 0
  );
}

export function pickPollinationsFallbackModels(catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  const zeroCost = list
    .filter((model) => model?.name && isZeroPollenModel(model))
    .map((model) => model.name)
    .slice(0, 5);
  const official = POLLINATIONS_OFFICIAL_MODELS.filter((name) =>
    list.some((model) => model?.name === name || (model?.aliases || []).includes(name))
  );
  const cascade = [...new Set([...zeroCost, ...official])];
  return cascade.length ? cascade : [...POLLINATIONS_FALLBACK_MODELS];
}

async function fetchLiveFallbackModels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(POLLINATIONS_MODELS_URL, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://cihanhartamaci.github.io/logiwa-api-consultant/',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Pollinations models list failed (${response.status})`);
    }
    const catalog = await response.json();
    return pickPollinationsFallbackModels(catalog);
  } finally {
    clearTimeout(timer);
  }
}

export async function resolvePollinationsFallbackModels() {
  if (!cachedFallbackModelsPromise) {
    cachedFallbackModelsPromise = fetchLiveFallbackModels().catch(() => [
      ...POLLINATIONS_FALLBACK_MODELS,
    ]);
  }
  return cachedFallbackModelsPromise;
}

export function formatPollinationsExhausted(errors) {
  const unique = [...new Set((errors || []).filter(Boolean))];
  const summary = unique.slice(0, 6).join(' | ');
  const needsPollen = unique.some((message) => pollinationsErrorKind({ message }) === 'payment');
  const pollenHint = needsPollen
    ? ' Official models need pollen (balance is 0). Add a little at https://enter.pollinations.ai — free community models were tried first.'
    : '';
  return `Pollinations fallback exhausted.${pollenHint} ${summary}`.trim();
}

function truncate(text, max = 1200) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function compactOperation(operation) {
  if (!operation || typeof operation !== 'object') return operation;
  return {
    ...operation,
    summary: truncate(operation.summary, 240),
    description: operation.description ? truncate(operation.description, 500) : undefined,
    parameters: (operation.parameters || []).slice(0, 16),
    requestBody: operation.requestBody,
    responses: operation.responses,
  };
}

function mapKnowledge(article) {
  return {
    sourceId: article.sourceId,
    title: article.title,
    url: article.url,
    origin: article.origin,
    content: truncate(article.content, 1200),
  };
}

/**
 * Compress Help Center prose for smaller models, but keep Swagger request/response contracts.
 */
export function compactDocumentationSources(sources) {
  const helpCenter = (sources?.helpCenter || []).slice(0, 4).map((article) => ({
    sourceId: article.sourceId,
    title: article.title,
    url: article.url,
    content: truncate(article.content, 900),
  }));

  const knowledge = (sources?.knowledge || []).slice(0, 4).map(mapKnowledge);

  const swaggerSources = (sources?.swagger?.sources || []).slice(0, 6).map((item) => ({
    sourceId: item.sourceId,
    method: item.method,
    path: item.path,
    summary: truncate(item.summary, 240),
  }));

  const document = sources?.swagger?.document || {};
  const paths = {};
  Object.entries(document.paths || {}).forEach(([path, methods]) => {
    paths[path] = {};
    Object.entries(methods || {}).forEach(([method, operation]) => {
      paths[path][method] = compactOperation(operation);
    });
  });

  const schemas = document.components?.schemas || {};
  const schemaEntries = Object.entries(schemas).slice(0, 24);

  return {
    query: sources?.query,
    coverage: sources?.coverage,
    helpCenter,
    knowledge,
    swagger: {
      sources: swaggerSources,
      document: {
        openapi: document.openapi,
        info: {
          title: document.info?.title,
          version: document.info?.version,
        },
        paths,
        components: schemaEntries.length
          ? { schemas: Object.fromEntries(schemaEntries) }
          : undefined,
      },
    },
  };
}

/** Full retrieved contracts for Gemini — do not drop request/response schemas. */
export function prepareGeminiSources(sources) {
  const helpCenter = (sources?.helpCenter || []).slice(0, 6).map((article) => ({
    sourceId: article.sourceId,
    title: article.title,
    url: article.url,
    content: String(article.content || '').slice(0, 2200),
    score: article.score,
  }));

  const knowledge = (sources?.knowledge || []).slice(0, 4).map((article) => ({
    sourceId: article.sourceId,
    title: article.title,
    url: article.url,
    origin: article.origin,
    content: String(article.content || '').slice(0, 2200),
    score: article.score,
  }));

  return {
    query: sources?.query,
    coverage: sources?.coverage,
    blend:
      'Use Help Center for Logiwa IO workflow, Magna-Tiles knowledge docs [KB-...] for implementation guides and example payloads, and Swagger paths/components.schemas for exact request and response fields. Cite [HC-...], [KB-...], and [API-...] IDs.',
    helpCenter,
    knowledge,
    swagger: {
      sources: (sources?.swagger?.sources || []).slice(0, 6),
      document: sources?.swagger?.document || {},
    },
  };
}

function buildMessages(systemInstruction, chatHistory, groundedUserPrompt) {
  const messages = [{ role: 'system', content: systemInstruction }];

  for (const msg of chatHistory.slice(0, -1).slice(-12)) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: truncate(msg.content, 1500) });
    } else if (msg.role === 'model' && !String(msg.content || '').startsWith('**Error:**')) {
      messages.push({ role: 'assistant', content: truncate(msg.content || 'Understood.', 1500) });
    }
  }

  messages.push({ role: 'user', content: groundedUserPrompt });
  return messages;
}

function isPollinationsAuthError(error) {
  return pollinationsErrorKind(error) === 'auth';
}

function shouldSkipChatRetry(error) {
  const kind = pollinationsErrorKind(error);
  return kind === 'auth' || kind === 'payment' || kind === 'invalid_model';
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
  models = null,
}) {
  const messages = buildMessages(systemInstruction, chatHistory, groundedUserPrompt);
  const cascade = models?.length ? models : await resolvePollinationsFallbackModels();
  const errors = [];

  for (const model of cascade) {
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
      if (shouldSkipChatRetry(textError)) {
        continue;
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

  throw new Error(formatPollinationsExhausted(errors));
}
