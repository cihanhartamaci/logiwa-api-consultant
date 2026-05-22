import swaggerDoc from './swagger.json';
import helpCenterDoc from './helpCenter.json';

const stopWords = new Set([
  "how","do","i","what","is","the","a","to","in","for","of","and","or","with",
  "can","you","tell","me","about","my","an","on","nasıl","yaparım","nedir","bana",
  "hakkında","için","ile","ve","veya","bir"
]);

function extractKeywords(prompt) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/g, ' ')
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

  // Extract all schemas recursively to ensure model has complete context
  miniSwagger.components = { schemas: {} };
  
  if (swaggerDoc.components && swaggerDoc.components.schemas) {
    let schemasToCheck = new Set();
    
    // Find initial schemas referenced in the filtered paths
    const pathString = JSON.stringify(miniSwagger.paths);
    const refRegex = /"#\/components\/schemas\/([^"]+)"/g;
    let match;
    while ((match = refRegex.exec(pathString)) !== null) {
      schemasToCheck.add(match[1]);
    }

    // Recursively find nested schemas
    const processedSchemas = new Set();
    while (schemasToCheck.size > 0) {
      const schemaName = [...schemasToCheck][0];
      schemasToCheck.delete(schemaName);
      processedSchemas.add(schemaName);

      if (swaggerDoc.components.schemas[schemaName]) {
        const schemaObj = swaggerDoc.components.schemas[schemaName];
        miniSwagger.components.schemas[schemaName] = schemaObj;
        
        // Find refs inside this schema
        const schemaStr = JSON.stringify(schemaObj);
        let subMatch;
        while ((subMatch = refRegex.exec(schemaStr)) !== null) {
          if (!processedSchemas.has(subMatch[1])) {
            schemasToCheck.add(subMatch[1]);
          }
        }
      }
    }
  }

  return miniSwagger;
}
