import {describe, expect, test} from '@jest/globals';
import {
  glyphUnicode,
  objectOffsets,
  parseDifferences,
  parseToUnicode,
  repairOf,
  repairText,
  staleToUnicodeFonts,
} from '../src/staleToUnicode';

// AAAAAG+Newton-Regular of Ingram & Alikin, "Istoricheskii metod germenevtiki",
// as Preview on macOS 26.6.2 saved it after a highlight was added: the
// `/Differences` the subset was written with, and the `/ToUnicode` beside it,
// which is the table of the codes the font had before Quartz renumbered it.
const DIFFERENCES = `33 /afii10037 /afii10021 /afii10028 /uni00A0 /afii10026 /afii10083
/afii10084 /afii10080 /afii10082 /afii10074 /afii10089 /afii10070 /afii10076 /afii10075
/afii10077 /afii10078 /afii10069 /afii10068 /afii10079 /afii10067 /afii10066 /afii10093
/afii10065 /afii10097 /afii10081 /afii10087 /afii10073 /afii10085 /afii10096 /afii10018
/afii10072 /afii10088 /afii10036 /afii10090 /afii10019 /afii10034 /afii10094 /afii10031
/afii10033 /afii10030 /afii10095 /afii10091 /afii10047 /afii10032 /afii10017 /afii10020
/afii10035 /afii10029 /afii10022 /afii10092 /afii10071 /afii10086 /afii10025 /afii10039
/afii10049 /afii10027 /afii10040 /afii10038 /afii10042 /afii10041 /afii61352`;

const RANGES = `02020423 03030414 0404041a 050500a0 06060422 07070440 08080443
09090434 0a0c043d 0d0d0438 0e0e0442 0f0f044c 10100441 11110435 1212043c 13130431
1414044f 1515043b 16160432 17170447 1818044b 19190439 1a1a044d 1b1b0430 1c1c043a
1d1e0436 1f1f0446 20200020 21210433 22220445 2323044e 24240449 25250421 26260448
27270444 28280415 292a0028 2c3a002c 3b3b0418 3c3c041f 3d3d0412 3e3e041d 3f3f003f
40400413 41410424 4242044a 4343041c 44440044 45450451 46470410 4848003b 49490049
4a4a0425 4b4b002a 4c4c0427 4d4d0417 4e4e041b 4f4f004f 5050041e 51520051 53530050
5454004c 56560420 5757042d 58580058 5a5a0048 5b5b005b 5c5c0041 5d5d005d`;

function cmapOf(ranges: string): string {
  const lines = ranges.trim().split(/\s+/).map(
    (r) => `<${r.slice(0, 2)}><${r.slice(2, 4)}><${r.slice(4)}>`);
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 begincodespacerange
<00><FF>
endcodespacerange
${lines.length} beginbfrange
${lines.join('\n')}
endbfrange
endcmap`;
}

const STALE_CMAP = cmapOf(RANGES);

describe('glyphUnicode', () => {
  test('reads the Cyrillic afii names, Ё and ё included', () => {
    expect(glyphUnicode('afii10017')).toBe('А');
    expect(glyphUnicode('afii10023')).toBe('Ё');
    expect(glyphUnicode('afii10049')).toBe('Я');
    expect(glyphUnicode('afii10065')).toBe('а');
    expect(glyphUnicode('afii10071')).toBe('ё');
    expect(glyphUnicode('afii10097')).toBe('я');
    expect(glyphUnicode('afii61352')).toBe('№');
  });

  test('reads uni names, Latin names and single letters', () => {
    expect(glyphUnicode('uni0438')).toBe('и');
    expect(glyphUnicode('parenleft')).toBe('(');
    expect(glyphUnicode('seven')).toBe('7');
    expect(glyphUnicode('g')).toBe('g');
  });

  test('turns a no-break space into a space', () => {
    expect(glyphUnicode('uni00A0')).toBe(' ');
  });

  test('says nothing for a name it does not know', () => {
    expect(glyphUnicode('g123')).toBeUndefined();
    expect(glyphUnicode('uniD800')).toBeUndefined();
  });
});

describe('parseDifferences', () => {
  test('numbers each name from the code before it', () => {
    const names = parseDifferences('33 /a /b 40 /c#2Ed');
    expect([...names]).toEqual([[33, 'a'], [34, 'b'], [40, 'c.d']]);
  });
});

describe('parseToUnicode', () => {
  test('reads single codes, counting ranges and ranges of arrays', () => {
    const table = parseToUnicode(`1 begincodespacerange <00><FF> endcodespacerange
2 beginbfchar
<01> <0041>
<02> <00660069>
endbfchar
2 beginbfrange
<0a><0c><043d>
<10><11>[<0061> <0062>]
endbfrange`);
    expect(table.get(1)).toBe('A');
    expect(table.get(2)).toBe('fi');
    expect([table.get(10), table.get(11), table.get(12)]).toEqual(['н', 'о', 'п']);
    expect([table.get(16), table.get(17)]).toEqual(['a', 'b']);
  });

  test('reads nothing of a CMap of two-byte codes', () => {
    const table = parseToUnicode(`1 begincodespacerange <0000><FFFF> endcodespacerange
1 beginbfchar <0001> <0041> endbfchar`);
    expect(table.size).toBe(0);
  });
});

describe('repairOf', () => {
  const repair = repairOf(parseDifferences(DIFFERENCES), parseToUnicode(STALE_CMAP));

  test('repairs the text the stale table reported', () => {
    expect(repair).not.toBeNull();
    // What pdf.js reported for the words of the page, and what they read. The
    // digits of the page are set in another font: in this one, the codes of
    // digits draw letters.
    expect(repairText('гхю', repair)).toBe('УДК');
    expect(repairText(')шфЕ()ч,ш-)0', repair)).toBe('историческим');
    expect(repairText('0,фЕ1', repair)).toBe('метод');
  });

  test('keeps the length of every string it repairs', () => {
    const reported = 'МщИ7-/Вч)ф,/ё3Е. ч7шф) ш4Е,.';
    expect(repairText(reported, repair)).toHaveLength(reported.length);
  });

  test('takes the commoner letter where two codes report one', () => {
    // А's code is told З, and З's own code has no entry and reports the З it
    // draws. `З/,-ш731(7` is Александра.
    expect(repairText('З/,-ш731(7', repair)).toBe('Александра');
  });

  test('leaves alone a font whose table agrees with its names', () => {
    const healthy = cmapOf(`21210423 22220414 2323041a 24240020 25250418 26260441
      27270442 28280436 2929043e 2a2a0440 2b2b0438`);
    const names = parseDifferences(`33 /afii10037 /afii10021 /afii10028 /space
      /afii10026 /afii10083 /afii10084 /afii10072 /afii10080 /afii10082 /afii10074`);
    expect(repairOf(names, parseToUnicode(healthy))).toBeNull();
  });

  test('leaves alone a font with too few codes to judge by', () => {
    const names = parseDifferences('33 /afii10037 /afii10021');
    const cmap = parseToUnicode(cmapOf('21210433 22220445'));
    expect(repairOf(names, cmap)).toBeNull();
  });
});

/** Text as the bytes a PDF's syntax is written in, one per character. */
function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

function joined(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const all = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

async function deflated(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Response(data).body.pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A PDF with the objects given, laid out and cross-referenced the way Quartz
 * writes one: each object on its own, and a classic xref table.
 */
function pdfOf(objects: (string | Uint8Array)[]): ArrayBuffer {
  const parts: Uint8Array[] = [bytesOf('%PDF-1.3\n')];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const part = joined([
      bytesOf(`${index + 1} 0 obj\n`),
      typeof body === 'string' ? bytesOf(body) : body,
      bytesOf('\nendobj\n'),
    ]);
    parts.push(part);
    length += part.length;
  });
  const rows = offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`);
  parts.push(bytesOf(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows.join('')}` +
    `trailer\n<< /Size ${objects.length + 1} >>\nstartxref\n${length}\n%%EOF\n`));
  return joined(parts).buffer;
}

function streamObject(data: Uint8Array, isDeflated: boolean): Uint8Array {
  const filter = isDeflated ? ' /Filter /FlateDecode' : '';
  return joined([
    bytesOf(`<< /Length ${data.length}${filter} >>\nstream\n`),
    data,
    bytesOf('\nendstream'),
  ]);
}

describe('staleToUnicodeFonts', () => {
  test('finds a stale font by its subset name, through a deflated table', async () => {
    const file = pdfOf([
      `<< /Type /Font /Subtype /Type1 /BaseFont /AAAAAG+Newton-Regular
        /Encoding << /Type /Encoding /Differences [ ${DIFFERENCES} ] >>
        /ToUnicode 2 0 R >>`,
      streamObject(await deflated(bytesOf(STALE_CMAP)), true),
    ]);
    const fonts = await staleToUnicodeFonts(file);
    expect([...fonts.keys()]).toEqual(['AAAAAG+Newton-Regular']);
    expect(repairText('гхю', fonts.get('AAAAAG+Newton-Regular'))).toBe('УДК');
  });

  test('follows an encoding kept as an object of its own', async () => {
    const file = pdfOf([
      '<< /Type /Font /Subtype /Type1 /BaseFont /AAAAAB+Face /Encoding 3 0 R /ToUnicode 2 0 R >>',
      streamObject(bytesOf(STALE_CMAP), false),
      `<< /Type /Encoding /Differences [ ${DIFFERENCES} ] >>`,
    ]);
    const fonts = await staleToUnicodeFonts(file);
    expect(fonts.has('AAAAAB+Face')).toBe(true);
  });

  test('finds nothing in a file with no cross-reference table', async () => {
    expect((await staleToUnicodeFonts(new ArrayBuffer(0))).size).toBe(0);
    expect(objectOffsets(bytesOf('%PDF-1.3\n'))).toBeNull();
  });
});
