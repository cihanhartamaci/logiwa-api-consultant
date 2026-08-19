import swaggerDoc from './swagger.json';
import helpCenterDoc from './helpCenter.json';
import knowledgeDoc from './knowledgeDocs.json';

const stopWords = new Set([
  "how", "do", "i", "what", "is", "the", "a", "to", "in", "for", "of", "and", "or", "with",
  "can", "you", "tell", "me", "about", "my", "an", "on", "nasıl", "yaparım", "nedir", "bana",
  "hakkında", "için", "ile", "ve", "veya", "bir", "this", "that", "from", "are", "was",
  "were", "be", "been", "being", "it", "its", "as", "at", "by", "we", "our", "your"
]);

const synonymGroups = [
  ["shipment", "shipping", "ship", "outbound", "sevkiyat"],
  ["purchase", "receiving", "receive", "inbound", "kabul"],
  ["inventory", "stock", "envanter", "stok"],
  ["product", "sku", "item", "urun"],
  ["location", "bin", "lokasyon", "adres"],
  ["license", "plate", "pallet", "palet"],
  ["cycle", "count", "counting", "sayim"],
  ["replenishment", "replenish", "ikmal"],
  ["allocation", "allocate", "tahsis"],
  ["warehouse", "depo"],
  ["carrier", "shippingprovider", "kargo"],
  ["return", "rma", "iade"],
  ["list", "search", "get", "report", "liste"],
  ["create", "add", "post", "olustur"],
  ["update", "edit", "put", "patch", "guncelle"],
  ["delete", "remove", "cancel", "sil", "iptal"],
  ["lql", "query", "filter", "filtre"],
  ["webhook", "subscription", "callback"],
];

const synonymMap = new Map();
synonymGroups.forEach(group => {
  group.forEach(term => synonymMap.set(term, group));
});

function normalizeText(value = "") {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("en-US")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, " ");
}

function tokenize(prompt) {
  return normalizeText(prompt)
    .replace(/[^a-z0-9\s/_-]/g, " ")
    .replace(/[/_-]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

export function extractKeywords(prompt, expandSynonyms = true) {
  const tokens = tokenize(prompt);

  if (!expandSynonyms) return [...new Set(tokens)];

  const expanded = new Set(tokens);
  tokens.forEach(token => {
    const synonyms = synonymMap.get(token) || [...synonymMap.entries()]
      .find(([term]) => term.length >= 4 && token.startsWith(term))?.[1];
    if (synonyms) synonyms.forEach(synonym => expanded.add(synonym));
  });
  return [...expanded];
}

function chunkText(text, chunkSize = 260, overlap = 40) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length <= chunkSize) return [words.join(" ")];

  const chunks = [];
  const step = chunkSize - overlap;
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + chunkSize).join(" "));
    if (start + chunkSize >= words.length) break;
  }
  return chunks;
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slimSchema(schema, depth = 0) {
  if (!schema || typeof schema !== "object") {
    return { type: "object" };
  }
  if (schema.$ref) return { $ref: schema.$ref };
  if (depth > 4) {
    return { type: schema.type || "object", format: schema.format };
  }

  const slim = {};
  if (schema.type) slim.type = schema.type;
  if (schema.format) slim.format = schema.format;
  if (schema.required) slim.required = schema.required;
  if (schema.enum) slim.enum = schema.enum;
  if (schema.nullable) slim.nullable = schema.nullable;
  if (schema.minLength != null) slim.minLength = schema.minLength;
  if (schema.maxLength != null) slim.maxLength = schema.maxLength;
  if (schema.minimum != null) slim.minimum = schema.minimum;
  if (schema.maximum != null) slim.maximum = schema.maximum;
  if (schema.description) slim.description = String(schema.description).slice(0, 220);
  if (schema.properties) {
    slim.properties = {};
    Object.entries(schema.properties).forEach(([name, prop]) => {
      slim.properties[name] = slimSchema(prop, depth + 1);
    });
  }
  if (schema.items) slim.items = slimSchema(schema.items, depth + 1);
  if (schema.allOf) slim.allOf = schema.allOf.map((part) => slimSchema(part, depth + 1));
  if (schema.oneOf) slim.oneOf = schema.oneOf.map((part) => slimSchema(part, depth + 1));
  if (schema.anyOf) slim.anyOf = schema.anyOf.map((part) => slimSchema(part, depth + 1));
  return slim;
}

function collectSchemaNamesFromValue(value, names = []) {
  if (!value || typeof value !== "object") return names;
  if (typeof value.$ref === "string") {
    const match = value.$ref.match(/^#\/components\/schemas\/(.+)$/);
    if (match) names.push(match[1]);
  }
  Object.values(value).forEach((child) => collectSchemaNamesFromValue(child, names));
  return names;
}

function slimRequestBody(requestBody) {
  if (!requestBody) return undefined;
  const content = requestBody.content || {};
  const jsonContent =
    content["application/json"] ||
    content["application/json-patch+json"] ||
    Object.values(content)[0];
  const schema = jsonContent?.schema;
  return {
    required: requestBody.required,
    schema: schema ? slimSchema(schema) : undefined,
  };
}

function pickResponseJsonSchema(response) {
  const content = response?.content || {};
  return (
    content["application/json"]?.schema ||
    content["application/json-patch+json"]?.schema ||
    Object.values(content)[0]?.schema
  );
}

function slimResponses(responses) {
  if (!responses) return undefined;
  const slimmed = {};
  Object.entries(responses).forEach(([code, response]) => {
    const keep = /^2/.test(code) || code === "400";
    if (!keep) return;
    const jsonSchema = pickResponseJsonSchema(response);
    slimmed[code] = {
      description: stripHtml(response.description || "").slice(0, 160),
      schema: jsonSchema ? slimSchema(jsonSchema) : undefined,
    };
  });
  return Object.keys(slimmed).length ? slimmed : undefined;
}

function slimOperation(operation) {
  const description = stripHtml(operation.description || "").slice(0, 800);
  const parameters = (operation.parameters || []).slice(0, 16).map((param) => ({
    name: param.name,
    in: param.in,
    required: param.required,
    description: param.description ? stripHtml(param.description).slice(0, 180) : undefined,
    schema: param.schema
      ? { type: param.schema.type, format: param.schema.format, enum: param.schema.enum }
      : undefined,
  }));

  return {
    tags: operation.tags,
    summary: operation.summary,
    description: description || undefined,
    parameters: parameters.length ? parameters : undefined,
    requestBody: slimRequestBody(operation.requestBody),
    responses: slimResponses(operation.responses),
  };
}

function collectFieldNamesFromValue(value, depth = 0, names = [], seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 5) return names;
  if (Array.isArray(value)) {
    value.forEach((item) => collectFieldNamesFromValue(item, depth + 1, names, seen));
    return names;
  }
  if (typeof value.$ref === "string") {
    const key = value.$ref.match(/^#\/components\/schemas\/(.+)$/)?.[1];
    if (key && !seen.has(key)) {
      seen.add(key);
      names.push(key);
      const resolved = swaggerDoc.components?.schemas?.[key];
      if (resolved) collectFieldNamesFromValue(resolved, depth + 1, names, seen);
    }
  }
  if (value.properties && typeof value.properties === "object") {
    Object.keys(value.properties).forEach((name) => names.push(name));
  }
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") collectFieldNamesFromValue(child, depth + 1, names, seen);
  });
  return names;
}

function buildOperationSearchText(path, method, operation) {
  const paramNames = (operation.parameters || []).map((param) => param.name).join(" ");
  const schemaNames = collectSchemaNamesFromValue(operation.requestBody || {});
  collectSchemaNamesFromValue(operation.responses || {}, schemaNames);
  const fieldNames = collectFieldNamesFromValue(operation.requestBody);
  collectFieldNamesFromValue(operation.responses, 0, fieldNames);
  return [
    method.toUpperCase(),
    path,
    operation.summary || "",
    (operation.tags || []).join(" "),
    stripHtml(operation.description || "").slice(0, 800),
    paramNames,
    [...new Set(schemaNames)].join(" "),
    [...new Set(fieldNames)].join(" "),
  ].join(" ");
}

function createIndex(documents) {
  const documentFrequency = new Map();
  let totalTokenCount = 0;

  const indexedDocuments = documents.map(document => {
    const tokens = tokenize(document.searchText);
    const frequencies = new Map();
    tokens.forEach(token => frequencies.set(token, (frequencies.get(token) || 0) + 1));
    frequencies.forEach((_, token) => {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    });
    totalTokenCount += tokens.length;
    return { ...document, tokens, frequencies, normalizedText: normalizeText(document.searchText) };
  });

  return {
    documents: indexedDocuments,
    documentFrequency,
    averageLength: totalTokenCount / Math.max(indexedDocuments.length, 1),
  };
}

function rankIndex(index, prompt, limit, diversifyBy = null) {
  const keywords = extractKeywords(prompt);
  const originalKeywords = extractKeywords(prompt, false);
  if (keywords.length === 0) return [];

  const normalizedPrompt = normalizeText(prompt).trim();
  const documentCount = index.documents.length;
  const k1 = 1.5;
  const b = 0.72;

  const ranked = index.documents.map(document => {
    let score = 0;
    keywords.forEach(keyword => {
      const frequency = document.frequencies.get(keyword) || 0;
      if (frequency === 0) return;
      const docsWithTerm = index.documentFrequency.get(keyword) || 0;
      const idf = Math.log(1 + (documentCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
      const lengthNormalization = frequency + k1 * (
        1 - b + b * document.tokens.length / Math.max(index.averageLength, 1)
      );
      score += idf * ((frequency * (k1 + 1)) / lengthNormalization);
    });

    const normalizedTitle = normalizeText(document.title || "");
    originalKeywords.forEach(keyword => {
      if (normalizedTitle.includes(keyword)) score += 3.5;
      if (document.normalizedText.includes(keyword)) score += 0.25;
    });
    if (normalizedPrompt.length > 4 && document.normalizedText.includes(normalizedPrompt)) {
      score += 8;
    }

    return { ...document, score };
  }).filter(document => document.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!diversifyBy) return ranked.slice(0, limit);

  const diversified = [];
  const groupCounts = new Map();
  for (const document of ranked) {
    const group = document[diversifyBy];
    const count = groupCounts.get(group) || 0;
    if (count >= 2) continue;
    diversified.push(document);
    groupCounts.set(group, count + 1);
    if (diversified.length >= limit) break;
  }
  return diversified;
}

const helpCenterDocuments = helpCenterDoc.flatMap((article, articleIndex) =>
  chunkText(article.content).map((content, chunkIndex) => ({
    id: `help-${articleIndex}-${chunkIndex}`,
    articleId: `help-${articleIndex}`,
    title: article.title,
    url: article.url,
    content,
    chunkIndex,
    searchText: `${article.title} ${content}`,
  }))
);

const swaggerDocuments = [];
Object.entries(swaggerDoc.paths || {}).forEach(([path, methods]) => {
  Object.entries(methods).forEach(([method, operation]) => {
    if (!operation || typeof operation !== "object") return;
    const title = `${method.toUpperCase()} ${path} ${operation.summary || ""}`;
    swaggerDocuments.push({
      id: `swagger-${swaggerDocuments.length}`,
      path,
      method: method.toLowerCase(),
      operation: slimOperation(operation),
      title,
      searchText: buildOperationSearchText(path, method, operation),
    });
  });
});

const knowledgeDocuments = knowledgeDoc.flatMap((article, articleIndex) =>
  chunkText(article.content).map((content, chunkIndex) => ({
    id: `kb-${articleIndex}-${chunkIndex}`,
    articleId: `kb-${articleIndex}`,
    title: article.title,
    url: article.url,
    origin: article.origin,
    content,
    chunkIndex,
    searchText: `${article.title} ${article.origin || ""} ${article.filename || ""} ${content}`,
  }))
);

const helpCenterIndex = createIndex(helpCenterDocuments);
const swaggerIndex = createIndex(swaggerDocuments);
const knowledgeIndex = createIndex(knowledgeDocuments);

export function getRelevantArticles(prompt, limit = 6) {
  return rankIndex(helpCenterIndex, prompt, limit, "articleId").map(article => ({
    sourceId: `HC-${article.articleId.replace("help-", "")}-${article.chunkIndex + 1}`,
    title: article.title,
    url: article.url,
    content: article.content,
    chunk: article.chunkIndex + 1,
    score: Number(article.score.toFixed(3)),
  }));
}

function collectReferencedSchemas(value, schemaNames = new Set()) {
  if (!value || typeof value !== "object") return schemaNames;
  if (typeof value.$ref === "string") {
    const match = value.$ref.match(/^#\/components\/schemas\/(.+)$/);
    if (match) schemaNames.add(match[1]);
  }
  Object.values(value).forEach(child => collectReferencedSchemas(child, schemaNames));
  return schemaNames;
}

export function getRelevantKnowledge(prompt, limit = 4) {
  return rankIndex(knowledgeIndex, prompt, limit, "articleId").map((article) => ({
    sourceId: `KB-${article.articleId.replace("kb-", "")}-${article.chunkIndex + 1}`,
    title: article.title,
    url: article.url,
    origin: article.origin,
    content: article.content,
    chunk: article.chunkIndex + 1,
    score: Number(article.score.toFixed(3)),
  }));
}

export function getRelevantSwagger(prompt, limit = 6) {
  const topOperations = rankIndex(swaggerIndex, prompt, limit);
  const miniSwagger = {
    openapi: swaggerDoc.openapi,
    info: {
      title: swaggerDoc.info?.title,
      version: swaggerDoc.info?.version,
    },
    paths: {},
    components: { schemas: {} },
  };

  const sources = topOperations.map(document => {
    if (!miniSwagger.paths[document.path]) miniSwagger.paths[document.path] = {};
    miniSwagger.paths[document.path][document.method] = document.operation;
    return {
      sourceId: `API-${document.id.replace("swagger-", "")}`,
      method: document.method.toUpperCase(),
      path: document.path,
      summary: document.operation.summary || "",
      score: Number(document.score.toFixed(3)),
    };
  });

  const pendingSchemas = [...collectReferencedSchemas(miniSwagger.paths)].map((name) => ({
    name,
    hop: 0,
  }));
  const processedSchemas = new Set();
  const maxSchemas = 36;
  const maxHops = 3;

  while (pendingSchemas.length > 0 && Object.keys(miniSwagger.components.schemas).length < maxSchemas) {
    const { name: schemaName, hop } = pendingSchemas.shift();
    if (processedSchemas.has(schemaName)) continue;
    processedSchemas.add(schemaName);
    const schema = swaggerDoc.components?.schemas?.[schemaName];
    if (!schema) continue;
    miniSwagger.components.schemas[schemaName] = slimSchema(schema);
    if (hop + 1 >= maxHops) continue;
    collectReferencedSchemas(schema).forEach((nestedName) => {
      if (!processedSchemas.has(nestedName)) {
        pendingSchemas.push({ name: nestedName, hop: hop + 1 });
      }
    });
  }

  return { document: miniSwagger, sources };
}

function mergeBySourceId(primary, extra, limit) {
  const seen = new Set();
  const merged = [];
  for (const item of [...primary, ...extra]) {
    const key = item.sourceId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function searchDocumentation(prompt, { helpLimit = 6, swaggerLimit = 6, knowledgeLimit = 4 } = {}) {
  const seedHelp = getRelevantArticles(prompt, helpLimit);
  const seedApi = getRelevantSwagger(prompt, swaggerLimit);
  const seedKnowledge = getRelevantKnowledge(prompt, knowledgeLimit);
  const helpQuery = [
    prompt,
    ...seedApi.sources.map((source) => `${source.method} ${source.path} ${source.summary}`),
    ...seedKnowledge.map((article) => article.title),
  ].join("\n");
  const apiQuery = [
    prompt,
    ...seedHelp.map((article) => article.title),
    ...seedKnowledge.map((article) => article.title),
  ].join("\n");
  const knowledgeQuery = [
    prompt,
    ...seedHelp.map((article) => article.title),
    ...seedApi.sources.map((source) => `${source.method} ${source.path} ${source.summary}`),
  ].join("\n");

  return {
    query: prompt,
    coverage: {
      indexedHelpCenterArticles: helpCenterDoc.length,
      indexedHelpCenterChunks: helpCenterDocuments.length,
      indexedSwaggerOperations: swaggerDocuments.length,
      indexedSwaggerSchemas: Object.keys(swaggerDoc.components?.schemas || {}).length,
      indexedKnowledgeDocuments: knowledgeDoc.length,
      indexedKnowledgeChunks: knowledgeDocuments.length,
    },
    helpCenter: mergeBySourceId(seedHelp, getRelevantArticles(helpQuery, helpLimit), helpLimit),
    swagger: (() => {
      const blended = getRelevantSwagger(apiQuery, swaggerLimit);
      const sources = mergeBySourceId(seedApi.sources, blended.sources, swaggerLimit);
      const paths = {};
      const schemas = {};
      for (const pack of [seedApi, blended]) {
        Object.assign(paths, pack.document?.paths || {});
        Object.assign(schemas, pack.document?.components?.schemas || {});
      }
      return {
        sources,
        document: {
          openapi: seedApi.document.openapi,
          info: seedApi.document.info,
          paths,
          components: { schemas },
        },
      };
    })(),
    knowledge: mergeBySourceId(seedKnowledge, getRelevantKnowledge(knowledgeQuery, knowledgeLimit), knowledgeLimit),
  };
}

export function getDocumentationIndexStats() {
  return {
    helpCenterArticles: helpCenterDoc.length,
    helpCenterChunks: helpCenterDocuments.length,
    swaggerOperations: swaggerDocuments.length,
    swaggerSchemas: Object.keys(swaggerDoc.components?.schemas || {}).length,
    knowledgeDocuments: knowledgeDoc.length,
    knowledgeChunks: knowledgeDocuments.length,
  };
}
