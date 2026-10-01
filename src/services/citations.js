/**
 * Removes retrieval source markers (HC-, KB-, LK-, API- IDs) and source lists from an
 * answer while leaving fenced code, inline code, and ordinary markdown links intact.
 */

const ID_PREFIX = '(?:HC|API|KB|LK)';
const ID_BODY =
  '(?:\\.{3}|…|article-chunk|id-chunk|operation|(?=[A-Za-z0-9-]*\\d)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)';
const ID = `${ID_PREFIX}-${ID_BODY}(?![A-Za-z0-9])`;
const LEAD = '(?:(?:[Ss]ources?|[Rr]efs?|[Ss]ee|[Kk]aynak(?:lar)?|[Bb]kz\\.?)[ \\t]*:?[ \\t]*)?';
const SEP = '(?:[ \\t]*[,;/|&][ \\t]*|[ \\t]+(?:and|ve)[ \\t]+)';
const ITEM = `(?:\\[[ \\t]*${ID}[ \\t]*\\]|${ID})`;
const BRACKETED = `\\[[ \\t]*${LEAD}${ID}(?:${SEP}${ID})*[ \\t]*\\](?:\\([^)\\s]*\\))?`;
const PARENTHESIZED = `\\([ \\t]*${LEAD}${ITEM}(?:${SEP}${ITEM})*[ \\t]*\\)`;
// Private-use placeholders: one for inline code spans holding only source IDs, one wrapping
// the index of every other masked code span.
const CODE_CITATION_MARK = '\uE001';
const CODE_SPAN_MARK = '\uE000';
const CODE_SPAN_RESTORE = new RegExp(`${CODE_SPAN_MARK}(\\d+)${CODE_SPAN_MARK}`, 'g');
const CITATION = `(?:${BRACKETED}|${PARENTHESIZED}|${CODE_CITATION_MARK})`;
const CITATION_RUN = new RegExp(
  `([ \\t]*)${CITATION}(?:[ \\t]*[,;]?[ \\t]*${CITATION})*([ \\t]*)`,
  'g'
);
const ID_ONLY = new RegExp(`^\\s*${ID}(?:${SEP}${ID})*\\s*$`);
const CONTAINS_ID = new RegExp(`(?:^|[^A-Za-z0-9-])${ID}`);
const CONTAINS_LINK = /\]\(|https?:\/\//;
const OPEN_ARTICLE_LINK = /[ \t]*—[ \t]*\[Open article\]\([^)]*\)/g;
const INLINE_CODE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;

const PLURAL_LABEL = '(?:sources|references|citations|kaynaklar|kaynakça|referanslar)';
const ANY_LABEL = `(?:${PLURAL_LABEL}|source|kaynak)`;
const labelHeading = (label) =>
  new RegExp(`^\\s*(?:#{1,6}\\s+)?[*_]{0,3}\\s*${label}\\s*:?\\s*[*_]{0,3}\\s*:?\\s*$`, 'i');
const labelInline = (label) =>
  new RegExp(
    `^\\s*(?:[-*+]\\s+)?[*_]{0,3}\\s*${label}\\s*(?::\\s*[*_]{0,3}|[*_]{1,3}\\s*:)\\s*\\S`,
    'i'
  );
const PLURAL_HEADING = labelHeading(PLURAL_LABEL);
const ANY_HEADING = labelHeading(ANY_LABEL);
const PLURAL_INLINE = labelInline(PLURAL_LABEL);
const ANY_INLINE = labelInline(ANY_LABEL);

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const EMPTY_LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])?\s*[,;.]?\s*$/;
const ITALIC_FOOTER = /^\s*_[^_].*_\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

function splitFencedBlocks(lines) {
  const blocks = [];
  let prose = [];
  let code = null;
  let fence = '';

  for (const line of lines) {
    const marker = line.match(FENCE);
    if (code) {
      code.push(line);
      const closes =
        marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim();
      if (closes) {
        blocks.push({ code: true, lines: code });
        code = null;
      }
    } else if (marker) {
      if (prose.length) blocks.push({ code: false, lines: prose });
      prose = [];
      fence = marker[1];
      code = [line];
    } else {
      prose.push(line);
    }
  }

  if (code) blocks.push({ code: true, lines: code });
  if (prose.length) blocks.push({ code: false, lines: prose });
  return blocks;
}

function maskInlineCode(line) {
  const spans = [];
  const masked = line.replace(INLINE_CODE, (span, _ticks, inner) => {
    if (ID_ONLY.test(inner)) return CODE_CITATION_MARK;
    spans.push(span);
    return `${CODE_SPAN_MARK}${spans.length - 1}${CODE_SPAN_MARK}`;
  });
  return { masked, unmask: (text) => text.replace(CODE_SPAN_RESTORE, (_, i) => spans[Number(i)]) };
}

function replaceCitationRun(match, before, after, offset, line) {
  if (offset === 0) return before;
  const next = line[offset + match.length] ?? '';
  if (!next || /[.,;:!?)\]]/.test(next)) return '';
  if (before || after) return ' ';
  return /\w/.test(next) && /\w/.test(line[offset - 1]) ? ' ' : '';
}

function stripLine(line) {
  const { masked, unmask } = maskInlineCode(line);
  return unmask(masked.replace(OPEN_ARTICLE_LINK, '').replace(CITATION_RUN, replaceCitationRun));
}

function citesSomething(line) {
  const { masked } = maskInlineCode(line);
  return CONTAINS_ID.test(masked) || masked.includes(CODE_CITATION_MARK) || CONTAINS_LINK.test(masked);
}

function isSourceListLine(line) {
  return LIST_ITEM.test(line) || /^\s{2,}\S/.test(line) || citesSomething(line);
}

function onlySourcesOrFooterFollow(lines, index) {
  return lines
    .slice(index + 1)
    .every((line) => !line.trim() || isSourceListLine(line) || ITALIC_FOOTER.test(line));
}

function removeSourceSections(lines) {
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (ANY_INLINE.test(line)) {
      if (citesSomething(line)) continue;
      if (PLURAL_INLINE.test(line) && onlySourcesOrFooterFollow(lines, i)) continue;
    }

    if (ANY_HEADING.test(line)) {
      let last = i;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (!lines[j].trim()) continue;
        if (!isSourceListLine(lines[j])) break;
        last = j;
      }
      const section = lines.slice(i + 1, last + 1);
      if (PLURAL_HEADING.test(line) || section.some(citesSomething)) {
        i = last;
        continue;
      }
    }

    kept.push(line);
  }
  return kept;
}

function stripProse(lines) {
  const out = [];
  for (const line of removeSourceSections(lines)) {
    const cleaned = stripLine(line);
    if (cleaned !== line && line.trim() && EMPTY_LIST_ITEM.test(cleaned)) continue;
    if (!cleaned.trim() && out.length && !out[out.length - 1].trim()) continue;
    out.push(cleaned);
  }
  return out;
}

export function stripSourceCitations(text) {
  const value = String(text ?? '');
  if (!value.trim()) return value;
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  return splitFencedBlocks(lines)
    .flatMap((block) => (block.code ? block.lines : stripProse(block.lines)))
    .join('\n')
    .trim();
}
