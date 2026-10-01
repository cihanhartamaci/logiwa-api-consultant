export class DocumentExtractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocumentExtractError';
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function startsWith(bytes, signature) {
  return signature.every((byte, i) => bytes[i] === byte);
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new DocumentExtractError('This browser cannot read Word files. Paste the text instead.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view) {
  // The EOCD record is 22 bytes plus a comment of up to 65,535 bytes at the end of the file.
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

export async function readZipEntry(input, entryName) {
  const bytes = toBytes(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new DocumentExtractError('This file is not a valid .docx document.');

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== entryName) continue;

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new DocumentExtractError('This .docx file looks damaged.');
    }
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return data;
    if (method === 8) return inflateRaw(data);
    throw new DocumentExtractError('This .docx file uses an unsupported compression method.');
  }
  return null;
}

const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return XML_ENTITIES[code] ?? match;
  });
}

function tidyText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \u00a0]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const XML_TOKEN =
  /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<!(?:[^>"']|"[^"]*"|'[^']*')*>|<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;

/** Converts WordprocessingML (word/document.xml) into plain text. */
export function wordXmlToText(xml) {
  const lines = [];
  const paragraphs = [];
  const tables = [];
  let textDepth = 0;
  let skipDepth = 0;
  let tabStopsDepth = 0;

  const emit = (line) => {
    const table = tables[tables.length - 1];
    if (table?.cell) table.cell.push(line);
    else lines.push(line);
  };
  const append = (text) => {
    if (paragraphs.length) paragraphs[paragraphs.length - 1] += text;
  };

  for (const match of String(xml || '').matchAll(XML_TOKEN)) {
    const [, cdata, closing, tag, , selfClosing, text] = match;

    if (text !== undefined || cdata !== undefined) {
      if (textDepth > 0 && skipDepth === 0) append(cdata ?? decodeXmlEntities(text));
      continue;
    }
    if (!tag) continue;

    if (tag === 'mc:Fallback') {
      if (selfClosing) continue;
      skipDepth += closing ? -1 : 1;
      continue;
    }
    if (skipDepth > 0) continue;

    if (closing) {
      switch (tag) {
        case 'w:t':
          textDepth = Math.max(0, textDepth - 1);
          break;
        case 'w:tabs':
          tabStopsDepth = Math.max(0, tabStopsDepth - 1);
          break;
        case 'w:p':
          if (paragraphs.length) emit(paragraphs.pop());
          break;
        case 'w:tc': {
          const table = tables[tables.length - 1];
          if (table?.cell) {
            table.row.push(table.cell.join(' ').replace(/\s+/g, ' ').trim());
            table.cell = null;
          }
          break;
        }
        case 'w:tr': {
          const table = tables[tables.length - 1];
          if (table?.row) {
            table.rows.push(table.row.join(' | '));
            table.row = null;
          }
          break;
        }
        case 'w:tbl': {
          const table = tables.pop();
          table?.rows.forEach(emit);
          break;
        }
        default:
          break;
      }
      continue;
    }

    switch (tag) {
      case 'w:p':
        if (!selfClosing) paragraphs.push('');
        else emit('');
        break;
      case 'w:t':
        if (!selfClosing) textDepth += 1;
        break;
      case 'w:tabs':
        if (!selfClosing) tabStopsDepth += 1;
        break;
      case 'w:tab':
        if (tabStopsDepth === 0) append('\t');
        break;
      case 'w:br':
      case 'w:cr':
        append('\n');
        break;
      case 'w:noBreakHyphen':
        append('-');
        break;
      case 'w:tbl':
        if (!selfClosing) tables.push({ rows: [], row: null, cell: null });
        break;
      case 'w:tr': {
        const table = tables[tables.length - 1];
        if (table && !selfClosing) table.row = [];
        break;
      }
      case 'w:tc': {
        const table = tables[tables.length - 1];
        if (table?.row && !selfClosing) table.cell = [];
        break;
      }
      default:
        break;
    }
  }

  while (paragraphs.length) emit(paragraphs.shift());
  return tidyText(lines.join('\n'));
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const LEGACY_DOC_MESSAGE =
  'Old Word .doc files are not supported. Save it as .docx in Word, or paste the text instead.';

export async function extractDocxText(input) {
  const bytes = toBytes(input);
  if (startsWith(bytes, OLE_SIGNATURE)) throw new DocumentExtractError(LEGACY_DOC_MESSAGE);
  if (!startsWith(bytes, ZIP_SIGNATURE)) {
    throw new DocumentExtractError('This file is not a valid .docx document.');
  }
  const xml = await readZipEntry(bytes, 'word/document.xml');
  if (!xml) throw new DocumentExtractError('This file is not a Word document (word/document.xml is missing).');
  return wordXmlToText(new TextDecoder().decode(xml));
}

/** Joins pdf.js text items into lines, breaking on hasEOL or a vertical position change. */
export function pdfTextItemsToText(items) {
  let out = '';
  let lastY = null;
  for (const item of items || []) {
    if (typeof item?.str !== 'string') continue;
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && out && !out.endsWith('\n')) {
      out += '\n';
    }
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== null) lastY = y;
  }
  return tidyText(out);
}

export function ensurePdfHasText(text) {
  if (!String(text || '').trim()) {
    throw new DocumentExtractError(
      'No selectable text found in this PDF. It may be a scanned document; paste the text instead.',
    );
  }
  return text;
}

export async function extractPdfText(input) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: toBytes(input).slice() }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new DocumentExtractError('This PDF is password-protected. Remove the password or paste the text instead.');
    }
    throw new DocumentExtractError('Could not open this PDF. It may be damaged; paste the text instead.');
  }

  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pdfTextItemsToText(content.items));
      page.cleanup();
    }
    return ensurePdfHasText(tidyText(pages.filter(Boolean).join('\n\n')));
  } finally {
    pdf.destroy();
  }
}

const TEXT_DECODERS = {
  pdf: extractPdfText,
  docx: extractDocxText,
  doc: () => {
    throw new DocumentExtractError(LEGACY_DOC_MESSAGE);
  },
};

export function fileExtension(name) {
  const match = /\.([^.]+)$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isBinaryDocument(name) {
  return fileExtension(name) in TEXT_DECODERS;
}

/** Extracts plain text from a PDF or Word upload. */
export async function extractBinaryDocumentText(file) {
  const decode = TEXT_DECODERS[fileExtension(file?.name)];
  if (!decode) throw new DocumentExtractError('Unsupported file type.');
  return decode(await file.arrayBuffer());
}
