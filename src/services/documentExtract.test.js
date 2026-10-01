import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  DocumentExtractError,
  ensurePdfHasText,
  extractBinaryDocumentText,
  extractDocxText,
  isBinaryDocument,
  pdfTextItemsToText,
  readZipEntry,
  wordXmlToText,
} from './documentExtract';

function buildZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data, method } of entries) {
    const nameBytes = encoder.encode(name);
    const raw = typeof data === 'string' ? encoder.encode(data) : data;
    const stored = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;

    const local = new Uint8Array(30 + nameBytes.length + stored.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(stored, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, eocd];
  const zip = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let pos = 0;
  for (const part of parts) {
    zip.set(part, pos);
    pos += part.length;
  }
  return zip.buffer;
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${body}</w:body></w:document>`;
}

const SAMPLE_BODY = [
  '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>',
  '<w:r><w:t>Shopify order sync</w:t></w:r></w:p>',
  '<w:p><w:r><w:t xml:space="preserve">Step</w:t><w:tab/><w:t>Action</w:t></w:r></w:p>',
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Field</w:t></w:r></w:p></w:tc>',
  '<w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>',
  '<w:tr><w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc>',
  '<w:tc><w:p><w:r><w:t>Open &amp; ready</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  '<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>',
].join('');

describe('wordXmlToText', () => {
  it('turns paragraphs, tabs, breaks, and table rows into text', () => {
    expect(wordXmlToText(documentXml(SAMPLE_BODY))).toBe(
      ['Shopify order sync', 'Step\tAction', 'Field | Value', 'Status | Open & ready', 'Line one', 'Line two'].join(
        '\n',
      ),
    );
  });

  it('joins runs within a paragraph and collapses long blank gaps', () => {
    const xml = documentXml(
      '<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>world</w:t></w:r></w:p>' +
        '<w:p/><w:p></w:p><w:p/><w:p/>' +
        '<w:p><w:r><w:t>&lt;tag&gt; &#8211; &#x2713;</w:t></w:r></w:p>',
    );
    expect(wordXmlToText(xml)).toBe('Hello world\n\n<tag> \u2013 \u2713');
  });

  it('ignores field codes, deleted text, and alternate-content fallbacks', () => {
    const xml = documentXml(
      '<w:p><w:r><w:instrText> HYPERLINK "x" </w:instrText></w:r><w:r><w:t>Link</w:t></w:r>' +
        '<w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>' +
        '<w:p><mc:AlternateContent><mc:Choice><w:r><w:t>Choice</w:t></w:r></mc:Choice>' +
        '<mc:Fallback><w:r><w:t>Fallback</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>',
    );
    expect(wordXmlToText(xml)).toBe('Link\nChoice');
  });

  it('joins multi-paragraph table cells with spaces', () => {
    const xml = documentXml(
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    expect(wordXmlToText(xml)).toBe('A B |  | C');
  });
});

describe('extractDocxText', () => {
  it('reads a deflated word/document.xml from a .docx zip', async () => {
    const zip = buildZip([
      { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
      { name: 'word/document.xml', data: documentXml(SAMPLE_BODY), method: 8 },
    ]);
    const text = await extractDocxText(zip);
    expect(text.split('\n')).toEqual([
      'Shopify order sync',
      'Step\tAction',
      'Field | Value',
      'Status | Open & ready',
      'Line one',
      'Line two',
    ]);
  });

  it('reads a stored (uncompressed) word/document.xml entry', async () => {
    const zip = buildZip([
      { name: 'word/document.xml', data: documentXml('<w:p><w:r><w:t>Stored entry</w:t></w:r></w:p>'), method: 0 },
    ]);
    expect(await extractDocxText(zip)).toBe('Stored entry');
  });

  it('returns null for a missing zip entry', async () => {
    const zip = buildZip([{ name: 'a.txt', data: 'hi', method: 8 }]);
    expect(await readZipEntry(zip, 'word/document.xml')).toBeNull();
    expect(new TextDecoder().decode(await readZipEntry(zip, 'a.txt'))).toBe('hi');
  });

  it('rejects zips without word/document.xml', async () => {
    const zip = buildZip([{ name: 'xl/workbook.xml', data: '<workbook/>', method: 8 }]);
    await expect(extractDocxText(zip)).rejects.toThrow(/not a Word document/);
  });

  it('explains that legacy .doc files must be saved as .docx', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(extractDocxText(ole.buffer)).rejects.toThrow(/Save it as \.docx/);
    const file = { name: 'Runbook.DOC', arrayBuffer: async () => ole.buffer };
    await expect(extractBinaryDocumentText(file)).rejects.toBeInstanceOf(DocumentExtractError);
  });

  it('rejects files that are not zips', async () => {
    await expect(extractDocxText(new TextEncoder().encode('plain text').buffer)).rejects.toThrow(/not a valid \.docx/);
  });

  it('routes uploads by extension', async () => {
    expect(isBinaryDocument('guide.pdf')).toBe(true);
    expect(isBinaryDocument('guide.DOCX')).toBe(true);
    expect(isBinaryDocument('guide.md')).toBe(false);
    const zip = buildZip([
      { name: 'word/document.xml', data: documentXml('<w:p><w:r><w:t>From file</w:t></w:r></w:p>'), method: 8 },
    ]);
    expect(await extractBinaryDocumentText({ name: 'x.docx', arrayBuffer: async () => zip })).toBe('From file');
  });
});

describe('pdf text helpers', () => {
  it('breaks lines on hasEOL and vertical position changes', () => {
    const items = [
      { str: 'Order', transform: [1, 0, 0, 1, 50, 700], hasEOL: false },
      { str: ' sync', transform: [1, 0, 0, 1, 80, 700], hasEOL: true },
      { str: 'Webhooks', transform: [1, 0, 0, 1, 50, 680], hasEOL: false },
      { type: 'beginMarkedContent' },
      { str: 'Retries', transform: [1, 0, 0, 1, 50, 660], hasEOL: false },
    ];
    expect(pdfTextItemsToText(items)).toBe('Order sync\nWebhooks\nRetries');
  });

  it('flags PDFs without selectable text', () => {
    expect(() => ensurePdfHasText('  \n ')).toThrow(/scanned/);
    expect(() => ensurePdfHasText('')).toThrow(DocumentExtractError);
    expect(ensurePdfHasText('Hello')).toBe('Hello');
  });
});
