import {describe, expect, test} from '@jest/globals';
import {loadPDFFile} from '../src/extractHighlight';
import {PDFAnnotation, PDFFile, PDFJsLib} from '../src/types';

// One text item, "Word," at x 71.5 spanning 31.787 units, as pdf.js reports it.
const textItems = [
  {str: 'Word,', transform: [12, 0, 0, 12, 71.50000108483317, 655.2499974579171], width: 31.78710370991189},
];

// Quad covering the whole word.
const wholeWord = [71.5, 663.974, 103.287, 663.974, 71.5, 653.558, 103.287, 653.558];

/**
 * The outline as pdf.js hands it over: `dest` is either an explicit
 * destination — a page reference, the kind of view, then its arguments — or the
 * name of one the document defines.
 */
interface StubOutlineItem {
  title: string;
  dest: unknown;
  items?: StubOutlineItem[];
}

interface StubDocument {
  /** Pages, in order, each with the annotations standing on it. */
  pages?: unknown[][];
  outline?: StubOutlineItem[] | null;
  /** Named destinations, for an outline that points at one. */
  destinations?: Record<string, unknown[]>;
}

/** Page 3 of the document, as a reference and as the index pdf.js resolves it to. */
const pageRef = (page: number) => ({num: 100 + page, gen: 0});

function pdfjsFor(document: StubDocument): PDFJsLib {
  const pages = document.pages ?? [[]];
  const pdf = {
    numPages: pages.length,
    getPageLabels: () => Promise.resolve(null),
    getPage: (pagenum: number) =>
      Promise.resolve({
        getAnnotations: () => Promise.resolve(pages[pagenum - 1] ?? []),
        getTextContent: () => Promise.resolve({items: textItems}),
      }),
    getOutline: () => Promise.resolve(document.outline ?? null),
    getDestination: (id: string) =>
      Promise.resolve(document.destinations?.[id] ?? null),
    getPageIndex: (ref: {num: number}) => Promise.resolve(ref.num - 101),
  };
  return {getDocument: () => ({promise: Promise.resolve(pdf)})} as unknown as PDFJsLib;
}

function pdfjsReturning(annotations: unknown[]): PDFJsLib {
  return pdfjsFor({pages: [annotations]});
}

function annotation(over: Record<string, unknown>) {
  return {
    subtype: 'Text',
    rect: [0, 0, 10, 10],
    titleObj: {str: 'Mark'},
    contentsObj: {str: 'a comment'},
    ...over,
  };
}

const file = new PDFFile('Paper.pdf', new ArrayBuffer(0), 'pdf', 'refs/Paper.pdf');

async function extract(annotations: unknown[], desired = ['Text', 'Highlight']) {
  const total: PDFAnnotation[] = [];
  await loadPDFFile(file, pdfjsReturning(annotations), 'refs', total, desired);
  return total;
}

describe('loadPDFFile', () => {
  test('fills in the fields the templates use', async () => {
    const [anno] = await extract([annotation({})]);
    expect(anno.body).toBe('a comment');
    expect(anno.author).toBe('Mark');
    expect(anno.folder).toBe('refs');
    expect(anno.filepath).toBe('refs/Paper.pdf');
    expect(anno.file.basename).toBe('Paper');
    expect(anno.pageNumber).toBe(1);
    // no page labels in the document, so the page number stands in
    expect(anno.pageLabel).toBe('1');
  });

  test('keeps only the desired subtypes', async () => {
    const total = await extract(
      [annotation({}), annotation({subtype: 'Highlight', quadPoints: wholeWord})],
      ['Highlight']
    );
    expect(total.map((a) => a.subtype)).toEqual(['Highlight']);
  });

  test('extracts the text under a markup annotation', async () => {
    const [anno] = await extract([
      annotation({subtype: 'Highlight', quadPoints: wholeWord, contentsObj: {str: ''}}),
    ]);
    expect(anno.highlightedText).toBe('Word,');
    // kept even though it has no comment of its own
    expect(anno.body).toBe('');
  });

  test('does not extract text for a non-markup annotation', async () => {
    const [anno] = await extract([annotation({quadPoints: wholeWord})]);
    expect(anno.highlightedText).toBeUndefined();
  });

  test('skips an annotation with neither a comment nor marked up text', async () => {
    expect(await extract([annotation({contentsObj: {str: ''}})])).toEqual([]);
    expect(await extract([annotation({contentsObj: {str: '   \n  '}})])).toEqual([]);
  });

  test('skips a markup annotation whose quadPoints are unusable', async () => {
    expect(
      await extract([
        annotation({subtype: 'Highlight', quadPoints: null, contentsObj: {str: ''}}),
      ])
    ).toEqual([]);
  });

  test('keeps a markup annotation with no text under it but a comment on it', async () => {
    const [anno] = await extract([
      annotation({subtype: 'Highlight', quadPoints: null, contentsObj: {str: 'why?'}}),
    ]);
    expect(anno.body).toBe('why?');
    expect(anno.highlightedText).toBe('');
  });

  test('reads the colour pdf.js normalized the annotation to', async () => {
    // As pdf.js reports one: three channels over 0-255, whatever colour space
    // the file wrote `/C` in.
    const [anno] = await extract([
      annotation({color: new Uint8ClampedArray([255, 212, 0])}),
    ]);
    expect(anno.colorHex).toBe('#ffd400');
  });

  test('an annotation with no usable colour is filed under none', async () => {
    const none = async (over: Record<string, unknown>) =>
      (await extract([annotation(over)]))[0].colorHex;
    expect(await none({})).toBeUndefined();
    // Explicitly transparent, which pdf.js reports as null.
    expect(await none({color: null})).toBeUndefined();
    expect(await none({color: new Uint8ClampedArray([0, 0])})).toBeUndefined();
  });

  // pdf.js fills a missing `/C` in with black rather than leaving it out, so
  // black on a subtype that carries no colour of its own is the file saying
  // nothing — and on one a reader colours by hand, it is a colour they picked.
  test('black on an annotation that marks up no text is no colour at all', async () => {
    const [note] = await extract([
      annotation({color: new Uint8ClampedArray([0, 0, 0])}),
    ]);
    expect(note.colorHex).toBeUndefined();
  });

  test('black on a markup annotation is the colour it was marked with', async () => {
    const [struck] = await extract(
      [
        annotation({
          subtype: 'StrikeOut',
          quadPoints: wholeWord,
          color: new Uint8ClampedArray([0, 0, 0]),
        }),
      ],
      ['StrikeOut']
    );
    expect(struck.colorHex).toBe('#000000');
  });

  test('says how far through the pages the reading has got', async () => {
    const seen: string[] = [];
    const total: PDFAnnotation[] = [];
    await loadPDFFile(
      file,
      pdfjsFor({pages: [[annotation({})], [], [annotation({})]]}),
      'refs',
      total,
      ['Text'],
      false,
      false,
      (page, pages) => seen.push(`${page}/${pages}`)
    );
    // Every page, whether or not it held anything to extract — a page with no
    // annotations is still a page the reading had to get through.
    expect(seen).toEqual(['1/3', '2/3', '3/3']);
  });

  test('reads no outline unless the sections are asked for', async () => {
    const [anno] = await extract([annotation({})]);
    expect(anno.section).toBeUndefined();
  });
});

describe('the section of the PDF an annotation falls in', () => {
  /** An annotation whose top edge is `top`, on page `page`. */
  const at = (page: number, top: number) => ({
    page,
    anno: annotation({rect: [0, top - 10, 100, top]}),
  });

  /** Jumps to the top of `page`; XYZ leaves the height unset, as writers do. */
  const topOfPage = (page: number) => [pageRef(page), {name: 'Fit'}];
  const partWayDown = (page: number, top: number) => [
    pageRef(page),
    {name: 'XYZ'},
    0,
    top,
    null,
  ];

  async function sectionsOf(document: StubDocument): Promise<(string[] | undefined)[]> {
    const total: PDFAnnotation[] = [];
    await loadPDFFile(file, pdfjsFor(document), 'refs', total, ['Text'], true);
    return total.map((anno) => anno.section);
  }

  test('is the last heading beginning at or above it', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno], [at(2, 700).anno], [at(3, 700).anno]],
      outline: [
        {title: 'Introduction', dest: topOfPage(1)},
        {title: 'Method', dest: topOfPage(3)},
      ],
    });
    expect(found).toEqual([['Introduction'], ['Introduction'], ['Method']]);
  });

  test('is nothing for an annotation standing before the first heading', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno], [at(2, 700).anno]],
      outline: [{title: 'Introduction', dest: topOfPage(2)}],
    });
    expect(found).toEqual([undefined, ['Introduction']]);
  });

  test('carries the headings a heading sits under', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno], [at(2, 700).anno]],
      outline: [
        {
          title: 'Results',
          dest: topOfPage(1),
          items: [{title: 'Second trial', dest: topOfPage(2)}],
        },
      ],
    });
    expect(found).toEqual([['Results'], ['Results', 'Second trial']]);
  });

  test('splits a page between two headings by where each one starts', async () => {
    // PDF y grows upwards, so 700 is above 400.
    const found = await sectionsOf({
      pages: [[at(1, 720).anno, at(1, 500).anno, at(1, 300).anno]],
      outline: [
        {title: 'Method', dest: partWayDown(1, 700)},
        {title: 'Results', dest: partWayDown(1, 400)},
      ],
    });
    expect(found).toEqual([undefined, ['Method'], ['Results']]);
  });

  test('follows a named destination the document defines', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno]],
      outline: [{title: 'Introduction', dest: 'intro'}],
      destinations: {intro: topOfPage(1)},
    });
    expect(found).toEqual([['Introduction']]);
  });

  test('a heading with nothing to jump to still names the ones beneath it', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno]],
      outline: [
        {title: 'Part one', dest: null, items: [{title: 'Chapter 1', dest: topOfPage(1)}]},
      ],
    });
    expect(found).toEqual([['Part one', 'Chapter 1']]);
  });

  test('a slash in a heading opens no folder of its own', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno]],
      outline: [{title: 'Input/output', dest: topOfPage(1)}],
    });
    expect(found).toEqual([['Input output']]);
  });

  test('an unresolvable destination leaves the rest of the outline standing', async () => {
    const found = await sectionsOf({
      pages: [[at(1, 700).anno], [at(2, 700).anno]],
      outline: [
        {title: 'Introduction', dest: topOfPage(1)},
        {title: 'Nowhere', dest: 'missing'},
        {title: 'Method', dest: topOfPage(2)},
      ],
    });
    expect(found).toEqual([['Introduction'], ['Method']]);
  });

  test('a document with no outline files nothing by section', async () => {
    const found = await sectionsOf({pages: [[at(1, 700).anno]], outline: null});
    expect(found).toEqual([undefined]);
  });
});
