import swaggerDoc from './swagger.json';
import helpCenterDoc from './helpCenter.json';

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

function flattenSearchableValues(value, output = []) {
  if (value == null) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(item => flattenSearchableValues(item, output));
    return output;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      output.push(key);
      flattenSearchableValues(child, output);
    });
  }
  return output;
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
      operation,
      title,
      searchText: `${title} ${flattenSearchableValues(operation).join(" ")}`,
    });
  });
});

const helpCenterIndex = createIndex(helpCenterDocuments);
const swaggerIndex = createIndex(swaggerDocuments);

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

export function getRelevantSwagger(prompt, limit = 8) {
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

  const pendingSchemas = [...collectReferencedSchemas(miniSwagger.paths)];
  const processedSchemas = new Set();
  while (pendingSchemas.length > 0) {
    const schemaName = pendingSchemas.shift();
    if (processedSchemas.has(schemaName)) continue;
    processedSchemas.add(schemaName);
    const schema = swaggerDoc.components?.schemas?.[schemaName];
    if (schema) {
      miniSwagger.components.schemas[schemaName] = schema;
      collectReferencedSchemas(schema).forEach(nestedName => {
        if (!processedSchemas.has(nestedName)) pendingSchemas.push(nestedName);
      });
    }
  }

  return { document: miniSwagger, sources };
}

export function searchDocumentation(prompt, { helpLimit = 6, swaggerLimit = 8 } = {}) {
  return {
    query: prompt,
    coverage: {
      indexedHelpCenterArticles: helpCenterDoc.length,
      indexedHelpCenterChunks: helpCenterDocuments.length,
      indexedSwaggerOperations: swaggerDocuments.length,
    },
    helpCenter: getRelevantArticles(prompt, helpLimit),
    swagger: getRelevantSwagger(prompt, swaggerLimit),
  };
}

export function getDocumentationIndexStats() {
  return {
    helpCenterArticles: helpCenterDoc.length,
    helpCenterChunks: helpCenterDocuments.length,
    swaggerOperations: swaggerDocuments.length,
    swaggerSchemas: Object.keys(swaggerDoc.components?.schemas || {}).length,
  };
}
