export function closeOpenFences(text = '') {
  const fences = (String(text).match(/```/g) || []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

export function nextTypewriterAdvance(full, index) {
  if (index >= full.length) return 0;

  const remaining = full.length - index;
  const nextSlice = full.slice(index, index + 32);
  if (nextSlice.includes('```') || nextSlice.startsWith('    ')) return Math.min(14, remaining);
  if (full[index] === '\n') return 1;

  const word = full.slice(index).match(/^\S{1,12}/);
  return Math.max(1, word ? word[0].length : Math.min(4, remaining));
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
