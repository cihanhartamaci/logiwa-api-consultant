const KB_STORAGE_KEY = 'logiwa_learned_knowledge';

// Get all confirmed knowledge
export function getAllKnowledge() {
  try {
    const data = localStorage.getItem(KB_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to parse knowledge base", e);
    return [];
  }
}

// Save a new piece of knowledge
export function saveKnowledge(topic, content) {
  const current = getAllKnowledge();
  const newEntry = {
    id: Date.now().toString(),
    topic,
    content,
    createdAt: new Date().toISOString()
  };
  current.push(newEntry);
  localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(current));
  return newEntry;
}

// Delete knowledge by ID
export function deleteKnowledge(id) {
  const current = getAllKnowledge();
  const filtered = current.filter(k => k.id !== id);
  localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(filtered));
}
