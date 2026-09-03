import {describe, expect, test} from '@jest/globals';
import {
  baseFontName,
  decodeLegacyText,
  isLegacyFont,
  legacyEncodingOf,
  readsAsCyrillicMojibake,
  repairCyrillicText,
  sharesTheCyrillicBand,
} from '../src/legacyFonts';

/** Decodes through whichever table the font name picks out. */
const read = (fontName: string, raw: string): string => {
  const encoding = legacyEncodingOf(fontName);
  if (!encoding) throw new Error(`no table for ${fontName}`);
  return decodeLegacyText(raw, encoding);
};

describe('baseFontName', () => {
  test('drops the subset tag a PDF prefixes an embedded font with', () => {
    expect(baseFontName('LBACTL+SPIonic')).toBe('SPIonic');
    expect(baseFontName('ZBXLGT+SPTiberian')).toBe('SPTiberian');
    expect(baseFontName('SPIonic')).toBe('SPIonic');
    // Six capitals and a plus is the tag; anything else is the name.
    expect(baseFontName('Times+Roman')).toBe('Times+Roman');
  });
});

describe('isLegacyFont', () => {
  test('knows the families whether or not there is a table for them', () => {
    expect(isLegacyFont('LBACTL+SPIonic')).toBe(true);
    expect(isLegacyFont('SLOTPB+GraecaII')).toBe(true);
    expect(isLegacyFont('SuperHebrew')).toBe(true);
  });

  test('an ordinary font is not one of them', () => {
    expect(isLegacyFont('VWSDEW+Times-Roman')).toBe(false);
    expect(isLegacyFont('Arial')).toBe(false);
    expect(isLegacyFont(undefined)).toBe(false);
  });

  test('a family with no table has no encoding, so its text is left alone', () => {
    expect(legacyEncodingOf('SLOTPB+GraecaII')).toBeUndefined();
    expect(legacyEncodingOf('Hebraica')).toBeUndefined();
    expect(legacyEncodingOf('Times-Roman')).toBeUndefined();
  });
});

// Every string here was read out of a book typeset in these fonts, and every
// expected value is what the book's own English says it is.
describe('SPIonic', () => {
  test('reads the letters', () => {
    expect(read('SPIonic', 'xcv')).toBe('χξς'); // 666, Rev 13:18
    expect(read('SPIonic', 'xiv')).toBe('χις'); // the 616 variant
    expect(read('SPIonic', 'me&tron')).toBe('μέτρον');
    expect(read('SPIonic', 'dra&kwn')).toBe('δράκων');
  });

  test('composes a breathing onto its letter', () => {
    expect(read('SPIonic', 'e0kxei=n')).toBe('ἐκχεῖν');
    expect(read('SPIonic', 'e9toima&zw')).toBe('ἑτοιμάζω');
    expect(read('SPIonic', 'e)rxo&menoj')).toBe('ἐρχόμενος');
  });

  test('composes an accent onto its letter', () => {
    expect(read('SPIonic', 'ma/rtuv')).toBe('μάρτυς');
    expect(read('SPIonic', 'plh&rhv')).toBe('πλήρης');
    expect(read('SPIonic', 'xoi=nic')).toBe('χοῖνιξ');
    expect(read('SPIonic', 'pneu~ma')).toBe('πνεῦμα');
    expect(read('SPIonic', 'dou=loi')).toBe('δοῦλοι');
  });

  test('the same mark has several bytes, one per place it is drawn', () => {
    // Acute: `/` and `&`. Grave: `\` and `_`. Circumflex: `=` and `~`.
    expect(read('SPIonic', 'a/')).toBe(read('SPIonic', 'a&'));
    expect(read('SPIonic', 'a\\')).toBe(read('SPIonic', 'a_'));
    expect(read('SPIonic', 'a=')).toBe(read('SPIonic', 'a~'));
    expect(read('SPIonic', 'a)')).toBe(read('SPIonic', 'a0'));
    expect(read('SPIonic', 'a(')).toBe(read('SPIonic', 'a9'));
  });

  test('reads the bytes that draw a breathing and an accent as one glyph', () => {
    expect(read('SPIonic', 'w@n')).toBe('ὤν');
    expect(read('SPIonic', 'h}n')).toBe('ἦν');
    expect(read('SPIonic', 'ei[v')).toBe('εἷς');
  });

  test('reads an iota subscript and a diaeresis', () => {
    expect(read('SPIonic', 'tw~| Qew~|')).toBe('τῷ Θεῷ');
    expect(read('SPIonic', 'a(llhloui+a&')).toBe('ἁλληλουϊά');
  });

  test('reads a whole phrase, capitals and all', () => {
    expect(read('SPIonic', 'o( Qeo_j o( pantokra&twr')).toBe(
      'ὁ Θεὸς ὁ παντοκράτωρ'
    );
    expect(read('SPIonic', 'to\\ musth&rion tou= qeou=')).toBe(
      'τὸ μυστήριον τοῦ θεοῦ'
    );
    expect(read('SPIonic', 'Ai)nei=te to_n Qeo&n')).toBe('Αἰνεῖτε τὸν Θεόν');
  });

  test('a byte the table does not name is left as it is', () => {
    // Punctuation and digits are the font's own, and are already readable.
    expect(read('SPIonic', 'me&tron, 5')).toBe('μέτρον, 5');
  });
});

describe('SPTiberian', () => {
  // Spelled out rather than typed, so an editor normalising the file cannot
  // quietly turn the expected value into a different sequence.
  const ALEF = 'א', BET = 'ב', HE = 'ה', VAV = 'ו';
  const YOD = 'י', LAMED = 'ל', NUN = 'נ', FINAL_NUN = 'ן';
  const SAMEKH = 'ס', TSADI = 'צ', QOF = 'ק', RESH = 'ר';
  const SHEVA = 'ְ', PATAH = 'ַ', QAMATS = 'ָ';
  const HIRIQ = 'ִ', DAGESH = 'ּ', MAQAF = '־';

  test('turns the word round, because the font wrote it as the line looks', () => {
    expect(read('SPTiberian', 'l)')).toBe(ALEF + LAMED);
    // נרון קסר — "Neron Qesar", whose letters add up to 666.
    expect(read('SPTiberian', 'rsq')).toBe(QOF + SAMEKH + RESH);
    expect(read('SPTiberian', 'Nwrn')).toBe(NUN + RESH + VAV + FINAL_NUN);
    expect(read('SPTiberian', 'rsq Nwrn')).toBe(
      NUN + RESH + VAV + FINAL_NUN + ' ' + QOF + SAMEKH + RESH
    );
  });

  test('a point stays under the letter it was written under', () => {
    // קָצִיר and בָצִיר — harvest and vintage.
    expect(read('SPTiberian', 'ryciqf')).toBe(
      QOF + QAMATS + TSADI + HIRIQ + YOD + RESH
    );
    expect(read('SPTiberian', 'rycibf')).toBe(
      BET + QAMATS + TSADI + HIRIQ + YOD + RESH
    );
  });

  test('reads a pointed phrase with a maqaf and a mappiq', () => {
    // הַלְלוּ־יָהּ
    expect(read('SPTiberian', 'h@yF-w@ll;ha')).toBe(
      HE + PATAH +
        LAMED + SHEVA +
        LAMED +
        VAV + DAGESH +
        MAQAF +
        YOD + QAMATS +
        HE + DAGESH
    );
  });

  test('the same point has several bytes, one per letter it sits under', () => {
    expect(read('SPTiberian', 'bf')).toBe(read('SPTiberian', 'bF'));
    expect(read('SPTiberian', 'b;')).toBe(read('SPTiberian', 'b:'));
    expect(read('SPTiberian', 'ba')).toBe(read('SPTiberian', 'bA'));
  });

  test('a point with no letter before it is not dropped', () => {
    expect(read('SPTiberian', 'f')).toBe(QAMATS);
  });

  test('nothing decodes to nothing', () => {
    expect(read('SPTiberian', '')).toBe('');
    expect(read('SPIonic', '')).toBe('');
  });
});

// The magazine these are taken from is Vestnik Istiny 1999/2: forty-five
// Cyrillic fonts, every one declared /Encoding /WinAnsiEncoding, and not one
// /ToUnicode in the file.
const BODY =
  'ÂÅÑÒÍÈÊ ÈÑÒÈÍÛ 2/1999 àê êàê òåëà æèâîòíûõ, êîòîðûõ êðîâü';
const BODY_MENDED =
  'ВЕСТНИК ИСТИНЫ 2/1999 ак как тела животных, которых кровь';

describe('repairCyrillicText', () => {
  test('reads the bytes back through Windows-1251', () => {
    expect(repairCyrillicText(BODY)).toBe(BODY_MENDED);
  });

  test("mends the letters 1251 does not spell where 1252 does", () => {
    // 0xB8 is ё in 1251 and the spacing cedilla in 1252; 0xA8 is Ё.
    expect(repairCyrillicText('¸')).toBe('ё');
    expect(repairCyrillicText('¨')).toBe('Ё');
    // 0x92, which pdf.js reports as the character, not the byte.
    expect(repairCyrillicText('’')).toBe('’');
  });

  test('changes no character count, so no glyph border moves', () => {
    expect([...repairCyrillicText(BODY)].length).toBe([...BODY].length);
  });

  test('leaves ASCII exactly as it stands', () => {
    expect(repairCyrillicText('Page 25, 1999')).toBe('Page 25, 1999');
    expect(repairCyrillicText('')).toBe('');
  });
});

describe('readsAsCyrillicMojibake', () => {
  test('knows a page of the magazine', () => {
    expect(readsAsCyrillicMojibake([BODY])).toBe(true);
  });

  test('leaves real Western European text alone', () => {
    // Accented letters stand between ASCII ones and never run in fours, which
    // is the whole difference. Measured over four correctly encoded books, no
    // font reached 0.1% of its letters in the band.
    expect(readsAsCyrillicMojibake([
      'Le théâtre où il a présenté sa pièce était déjà plein de spectateurs',
    ])).toBe(false);
    expect(readsAsCyrillicMojibake([
      'Größere Städte hätten für die Bürger völlig andere Möglichkeiten eröffnet',
    ])).toBe(false);
  });

  test('leaves text that is already Cyrillic alone', () => {
    expect(readsAsCyrillicMojibake([BODY_MENDED])).toBe(false);
  });

  test('will not judge a font on too few letters', () => {
    // Дан. 8, 26 — a scripture reference is no evidence by itself.
    expect(readsAsCyrillicMojibake(['Äàí. 8, 26'])).toBe(false);
  });

  test('pools everything one font sets on the page', () => {
    const scattered = [...BODY].map((character) => character);
    expect(readsAsCyrillicMojibake(scattered)).toBe(true);
  });
});

describe('sharesTheCyrillicBand', () => {
  test('sweeps up the short headings of a page already known', () => {
    // Утро Воскресения, thirteen letters, and the reference above.
    expect(sharesTheCyrillicBand(['Óòðî Âîñêðåñåíèÿ'])).toBe(true);
    expect(sharesTheCyrillicBand(['Äàí. 8, 26'])).toBe(true);
  });

  test('leaves the page numbers, which are ASCII', () => {
    expect(sharesTheCyrillicBand(['25'])).toBe(false);
    expect(sharesTheCyrillicBand(['2 4 8 16 20 24 41 46 48'])).toBe(false);
    expect(sharesTheCyrillicBand([''])).toBe(false);
  });

  test('still refuses text that is mostly Latin', () => {
    expect(sharesTheCyrillicBand(['Introduction'])).toBe(false);
    expect(sharesTheCyrillicBand(['café society'])).toBe(false);
  });
});
