import swaggerDoc from './swagger.json';
import helpCenterDoc from './helpCenter.json';

const stopWords = new Set([
  "how","do","i","what","is","the","a","to","in","for","of","and","or","with",
  "can","you","tell","me","about","my","an","on","get","create","update","delete"
]);

function extractKeywords(prompt) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

export function getRelevantArticles(prompt, limit = 3) {
  const keywords = extractKeywords(prompt);
  if (keywords.length === 0) return [];

  const scored = helpCenterDoc.map(article => {
    let score = 0;
    const content = (article.title + " " + article.content).toLowerCase();
    keywords.forEach(kw => {
      // Basic occurrence counting
      const regex = new RegExp(kw, 'g');
      const matches = content.match(regex);
      if (matches) {
        score += matches.length;
      }
      if (article.title.toLowerCase().includes(kw)) {
        score += 10; // High weight for title matches
      }
    });
    return { title: article.title, url: article.url, content: article.content, score };
  });

  return scored
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(a => ({ title: a.title, url: a.url, content: a.content })); // strip score
}

export function getRelevantSwagger(prompt, limit = 5) {
  const keywords = extractKeywords(prompt);
  const paths = swaggerDoc.paths || {};
  
  const scoredPaths = [];
  for (const [path, methods] of Object.entries(paths)) {
    let score = 0;
    const pathStr = JSON.stringify(methods).toLowerCase() + " " + path.toLowerCase();
    keywords.forEach(kw => {
      const regex = new RegExp(kw, 'g');
      const matches = pathStr.match(regex);
      if (matches) {
        score += matches.length;
      }
      if (path.toLowerCase().includes(kw)) {
        score += 10; // High weight for URL path matches
      }
    });
    if (score > 0) {
      scoredPaths.push({ path, methods, score });
    }
  }
  
  const topPaths = scoredPaths.sort((a, b) => b.score - a.score).slice(0, limit);
  
  const miniSwagger = {
    openapi: swaggerDoc.openapi,
    info: swaggerDoc.info,
    paths: {}
  };
  
  topPaths.forEach(p => {
    miniSwagger.paths[p.path] = p.methods;
  });

  // Extract only the schemas that are actually used in the filtered paths
  const pathString = JSON.stringify(miniSwagger.paths);
  miniSwagger.components = { schemas: {} };
  
  if (swaggerDoc.components && swaggerDoc.components.schemas) {
     for (const [schemaName, schemaObj] of Object.entries(swaggerDoc.components.schemas)) {
        if (pathString.includes(`"#/components/schemas/${schemaName}"`)) {
           miniSwagger.components.schemas[schemaName] = schemaObj;
        }
     }
  }

  return miniSwagger;
}
