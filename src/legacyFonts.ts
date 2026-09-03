/**
 * Pre-Unicode Greek and Hebrew fonts, and how to read them.
 *
 * Scholarly PDFs typeset before about 2005 set their ancient languages in fonts
 * that draw a Greek or Hebrew glyph at a Latin byte position: byte `a` is named
 * `a` in the font's encoding and draws α. They carry no `/ToUnicode` map,
 * because there was no Unicode to map to, so every reader — pdf.js, Acrobat,
 * anything — extracts the bytes and gets Latin. Copying ἁλληλουϊά out of such a
 * file gives `a(llhloui+a&`.
 *
 * Nothing in the file says what those bytes mean. The font's name is the whole
 * of the evidence, so decoding is a table per font name, and a font this module
 * does not know is left exactly as it was rather than run through a table that
 * does not fit it — a wrong table reads as real words and is worse than
 * gibberish, because nothing about it looks wrong.
 */

/** A byte of one of these fonts is one character of what pdf.js reports. */
type Byte = string;

/**
 * One font's encoding.
 *
 * `marks` are the bytes drawn *over* the character before them — Greek
 * breathings and accents, Hebrew points and accents. They take no width on the
 * page, which is why the extraction has to be told about them: shared out as
 * characters of their own they would move every glyph border after the first
 * accent, and the text under a highlight would come out shifted along the line.
 */
export interface LegacyEncoding {
	/** The font's name, as `/BaseFont` gives it once the subset tag is off. */
	readonly name: string;
	/** What each byte stands for; a byte not listed is left as it is. */
	readonly table: ReadonlyMap<Byte, string>;
	/** The bytes drawn over the character before them. */
	readonly marks: ReadonlySet<Byte>;
	/**
	 * Whether the font lays its bytes out the way the line looks rather than
	 * the way it is read. The Hebrew fonts do: the first byte is the leftmost
	 * glyph, which is the *last* letter of the word.
	 */
	readonly visualOrder: boolean;
}

/** Builds an encoding from a list of `byte -> characters` pairs. */
function encoding(
	name: string,
	visualOrder: boolean,
	letters: Record<Byte, string>,
	marks: Record<Byte, string>
): LegacyEncoding {
	const table = new Map<Byte, string>();
	for (const [byte, value] of Object.entries(letters)) table.set(byte, value);
	for (const [byte, value] of Object.entries(marks)) table.set(byte, value);
	return {
		name,
		table,
		marks: new Set(Object.keys(marks)),
		visualOrder,
	};
}

// ─── Greek combining marks ───
// The accents are combining characters, not precomposed letters: `decode` puts
// them after the letter they belong to and lets NFC compose the pair into the
// polytonic letter Unicode has for it. α + psili + oxia composes to ἄ, and the
// handful of combinations the font draws as one glyph are simply two of these.
const PSILI = "̓"; // smooth breathing
const DASIA = "̔"; // rough breathing
const OXIA = "́"; // acute
const VARIA = "̀"; // grave
const PERISPOMENI = "͂"; // circumflex
const DIALYTIKA = "̈"; // diaeresis
const YPOGEGRAMMENI = "ͅ"; // iota subscript

/**
 * SPIonic — the Scholars Press Greek font, and the most common one in
 * English-language biblical scholarship. Its letters follow Beta Code except
 * that it keeps the case rather than marking capitals with an asterisk.
 *
 * Each accent has two or more byte positions, which are the same mark drawn at
 * different offsets so it sits correctly over a narrow or a wide letter. They
 * are the same character once decoded, so they are listed together.
 *
 * Every mapping here is confirmed against a real book set in it: `ma/rtuv` is
 * μάρτυς, `xoi=nic` is χοῖνιξ where the English beside it reads "choinix",
 * `xcv` and `xiv` are the numerals χξς and χις of Revelation 13:18, and
 * `a(llhloui+a&` is ἁλληλουϊά.
 */
const SP_IONIC = encoding(
	"SPIonic",
	false,
	{
		a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", q: "θ",
		i: "ι", k: "κ", l: "λ", m: "μ", n: "ν", c: "ξ", o: "ο", p: "π",
		r: "ρ", s: "σ", t: "τ", u: "υ", f: "φ", x: "χ", y: "ψ", w: "ω",
		// Both of the font's final sigmas. `j` ends ἐρχόμενος and μολυσμός,
		// `v` ends μάρτυς and εἷς and numbers 6 in χξς.
		j: "ς", v: "ς",
		A: "Α", B: "Β", G: "Γ", D: "Δ", E: "Ε", Z: "Ζ", H: "Η", Q: "Θ",
		I: "Ι", K: "Κ", L: "Λ", M: "Μ", N: "Ν", C: "Ξ", O: "Ο", P: "Π",
		R: "Ρ", S: "Σ", T: "Τ", U: "Υ", F: "Φ", X: "Χ", Y: "Ψ", W: "Ω",
	},
	{
		")": PSILI, "0": PSILI,
		"(": DASIA, "9": DASIA,
		"/": OXIA, "&": OXIA,
		"\\": VARIA, _: VARIA,
		"=": PERISPOMENI, "~": PERISPOMENI,
		"+": DIALYTIKA,
		"|": YPOGEGRAMMENI,
		// The combinations the font draws as a single glyph.
		"[": DASIA + PERISPOMENI,
		"}": PSILI + PERISPOMENI,
		"@": PSILI + OXIA,
	}
);

// ─── Hebrew points ───
const SHEVA = "ְ";
const HATAF_SEGOL = "ֱ";
const HATAF_PATAH = "ֲ";
const HATAF_QAMATS = "ֳ";
const HIRIQ = "ִ";
const TSERE = "ֵ";
const SEGOL = "ֶ";
const PATAH = "ַ";
const QAMATS = "ָ";
const HOLAM = "ֹ";
const QUBUTS = "ֻ";
const DAGESH = "ּ"; // also mappiq and the shureq dot
const METEG = "ֽ";
const RAFE = "ֿ";
const SHIN_DOT = "ׁ";
const SIN_DOT = "ׂ";
const ETNAHTA = "֑";

/**
 * SPTiberian — the Scholars Press Hebrew font, which follows the
 * Michigan-Claremont transliteration its letters are named after. As with the
 * Greek accents, a point has several byte positions so it can be drawn under a
 * wide letter, a narrow one or a final kaf; they decode to one character.
 *
 * The bytes run the way the line looks, so `decode` turns the word round —
 * `l)` is אל, `rsq Nwrn` is נרון קסר, the "Neron Qesar" whose letters add up to
 * 666, and `ryciqf` and `rycibf` are קָצִיר and בָצִיר, harvest and vintage.
 */
const SP_TIBERIAN = encoding(
	"SPTiberian",
	true,
	{
		")": "א", b: "ב", g: "ג", d: "ד", h: "ה", w: "ו", z: "ז", x: "ח",
		"+": "ט", y: "י", k: "כ", K: "ך", l: "ל", m: "מ", M: "ם",
		n: "נ", N: "ן", s: "ס", "(": "ע", p: "פ", P: "ף", c: "צ", C: "ץ",
		q: "ק", r: "ר", "#": "ש", t: "ת",
		"-": "־", // maqaf
		".": "׃", // sof pasuq
	},
	{
		a: PATAH, A: PATAH,
		f: QAMATS, F: QAMATS, "1": QAMATS,
		i: HIRIQ, I: HIRIQ,
		e: SEGOL, E: SEGOL,
		"'": TSERE, '"': TSERE,
		o: HOLAM, O: HOLAM,
		u: QUBUTS, U: QUBUTS,
		";": SHEVA, ":": SHEVA, "7": SHEVA,
		j: HATAF_PATAH, J: HATAF_PATAH,
		v: HATAF_SEGOL, V: HATAF_SEGOL,
		"/": HATAF_QAMATS, "?": HATAF_QAMATS,
		// Every dot the font draws inside a letter is one Unicode character;
		// the font keeps them apart only to place them.
		"@": DAGESH, "%": DAGESH, ",": DAGESH, "^": DAGESH, "=": DAGESH,
		"&": SIN_DOT, $: SHIN_DOT,
		"{": RAFE, "}": RAFE,
		"\\": METEG, "|": METEG,
		"3": ETNAHTA, "4": ETNAHTA,
	}
);

/** The encodings this module can read, by the name the PDF embeds them under. */
const ENCODINGS: LegacyEncoding[] = [SP_IONIC, SP_TIBERIAN];

/**
 * The other pre-Unicode families this module recognises but has no table for.
 *
 * The Linguist's Software fonts are the gap that matters: Graeca, Hebraica,
 * SuperGreek and SuperHebrew shipped with different byte arrangements on
 * Macintosh and Windows, and no published table for either is reachable. The
 * BibleWorks fonts have one, but the only copy that could be found here
 * contradicts itself over the vowels, and a wrong Hebrew vowel is a different
 * word rather than a visible error.
 *
 * Text in one of these is handed back untouched, which is what every other
 * reader does with it too. Nothing is guessed: a table added here is the whole
 * of the work of supporting one, so this list is where to start from.
 */
const RECOGNISED_WITHOUT_A_TABLE =
	/^(Graeca|Hebraica|SuperGreek|SuperHebrew|SymbolGreek|LaserGreek|BWGRK|BWHEB|BSTGreek|BSTHebrew|Bwgrkl|Bwhebb)/i;

/** Whether the font is one of the pre-Unicode families, table or no table. */
export function isLegacyFont(fontName: string | undefined): boolean {
	if (!fontName) return false;
	const name = baseFontName(fontName);
	return (
		RECOGNISED_WITHOUT_A_TABLE.test(name) ||
		ENCODINGS.some((one) => one.name.toLowerCase() === name.toLowerCase())
	);
}

/**
 * The name without the subset tag a PDF prefixes an embedded font with —
 * `LBACTL+SPIonic` is SPIonic.
 */
export function baseFontName(fontName: string): string {
	return fontName.replace(/^[A-Z]{6}\+/, "");
}

/** The encoding of a font, or nothing for one there is no table for. */
export function legacyEncodingOf(
	fontName: string | undefined
): LegacyEncoding | undefined {
	if (!fontName) return undefined;
	const name = baseFontName(fontName).toLowerCase();
	return ENCODINGS.find((one) => one.name.toLowerCase() === name);
}

/**
 * What a run of bytes of a legacy font says.
 *
 * A Greek run decodes character by character and is then composed: the accents
 * are combining marks, and NFC turns α followed by a smooth breathing and an
 * acute into the single ἄ that a note should carry.
 *
 * A Hebrew run has to be turned round, because the font wrote it the way the
 * line looks. It is turned round a letter at a time rather than a byte at a
 * time — the points of a letter follow it in the bytes and must follow it in
 * Unicode too, so each letter is gathered with its own points first and the
 * letters are reversed after. Reversing the bytes instead would leave every
 * vowel under the wrong consonant.
 */
export function decodeLegacyText(
	raw: string,
	encoding: LegacyEncoding
): string {
	if (raw === "") return "";

	if (!encoding.visualOrder) {
		let out = "";
		for (const byte of raw) out += encoding.table.get(byte) ?? byte;
		return out.normalize("NFC");
	}

	const letters: string[] = [];
	let current = "";
	for (const byte of raw) {
		const decoded = encoding.table.get(byte) ?? byte;
		if (encoding.marks.has(byte) && current !== "") {
			current += decoded;
		} else {
			if (current !== "") letters.push(current);
			current = decoded;
		}
	}
	if (current !== "") letters.push(current);

	return letters.reverse().join("");
}

// ─── Cyrillic mis-declared as Western European ────────────────────────────────

/**
 * A second kind of pre-Unicode font, and a different problem from the one
 * above.
 *
 * Russian books typeset in the 1990s embed a Cyrillic TrueType face and then
 * declare it `/Encoding /WinAnsiEncoding` — Western European — with no
 * `/ToUnicode` map anywhere in the file. The bytes are Windows-1251, which is
 * what the font’s own cmap is arranged in, so byte 0xE4 draws `д`; but the
 * declaration says WinAnsi, where 0xE4 is `ä`. Every reader obeys the
 * declaration, so `ВЕСТНИК` copies out of such a file as `ÂÅÑÒÍÈÊ` — in
 * Acrobat as much as here. Nothing is damaged: the mapping is wrong but exact,
 * and undoing it recovers the text in full.
 *
 * Unlike the Greek and Hebrew fonts, the name is no evidence at all. One
 * magazine issue carries forty-five of them — Mysl, Baltica, Academy,
 * JurnalnayaNew, RussianClassic, Futuris, Gimnazia — and the next one carries
 * forty-five others. So this is recognised by what the text looks like instead,
 * which is safe here in a way that guessing a Greek table is not: the repair is
 * one byte for one character, so it cannot shift the text along the line, and
 * the test below is nowhere near being passed by real Western European text.
 */

/** Windows-1251 from byte 0x80 up. 0x98 is the one byte 1251 leaves unused. */
const CP1251_HIGH =
	"ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏ" +
	"ђ‘’“”•–—™љ›њќћџ" +
	" ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї" +
	"°±Ііґµ¶·ё№є»јЅѕї" +
	"АБВГДЕЖЗИЙКЛМНОП" +
	"РСТУФХЦЧШЩЪЫЬЭЮЯ" +
	"абвгдежзийклмноп" +
	"рстуфхцчшщъыьэюя";

/**
 * The bytes Windows-1252 spells with characters outside Latin-1, which is the
 * whole of where it and Latin-1 disagree. From 0xA0 up the two are the same, so
 * a character there is already the number of its own byte.
 */
const CP1252_ODDITIES = new Map<string, number>([
	["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85],
	["†", 0x86], ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a],
	["‹", 0x8b], ["Œ", 0x8c], ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92],
	["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97],
	["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b], ["œ", 0x9c],
	["ž", 0x9e], ["Ÿ", 0x9f],
]);

/** The byte a character was read from, or nothing if it was read from none. */
function byteBehind(character: string): number | undefined {
	const code = character.codePointAt(0);
	if (code === undefined) return undefined;
	if (code >= 0x80 && code <= 0xff) return code;
	return CP1252_ODDITIES.get(character);
}

/**
 * The band the letters land in. Windows-1251 fills 0xC0–0xFF with А–я, which
 * WinAnsi spells À–ÿ, so those are the characters that carry the evidence and
 * the ones the share below is measured over. The punctuation lower down —
 * quotes, dashes — is spelled the same either way and says nothing.
 */
function inLetterBand(character: string): boolean {
	const code = character.codePointAt(0);
	return code !== undefined && code >= 0xc0 && code <= 0xff;
}

/**
 * Below this many letters there is not enough to judge on, and the text is left
 * alone. A page of a book clears it many times over; a running head of four
 * words does not, which is the intent — a font is judged on everything it sets
 * on the page, not on the fragment under one highlight.
 */
const ENOUGH_LETTERS = 20;

/**
 * The share of letters that must fall in the band, and the length of the
 * longest unbroken run of them.
 *
 * Both are needed, and both are set far from where real text sits. Measured
 * over four correctly encoded books — two English, one carrying Greek and
 * Hebrew, and one Russian — no font reached 0.1% or a run above 1: an accented
 * letter in French or German stands between ASCII ones, and never in fours.
 * Measured over the mis-declared Russian magazine, every one of its fifty-three
 * fonts scored 100% with runs of 9 to 16. There is nothing in between to get
 * wrong.
 */
const MOSTLY = 0.5;
const IN_A_ROW = 4;

/** What the band test counts, over everything one font sets on a page. */
interface BandCount {
	/** Letters of either kind: ASCII, or in the band. */
	letters: number;
	/** Of those, the ones in the band. */
	banded: number;
	/** The longest unbroken run of banded ones. */
	longestRun: number;
}

function countBand(samples: Iterable<string>): BandCount {
	let letters = 0;
	let banded = 0;
	let run = 0;
	let longestRun = 0;

	for (const sample of samples) {
		for (const character of sample) {
			if (inLetterBand(character)) {
				banded++;
				letters++;
				run++;
				if (run > longestRun) longestRun = run;
				continue;
			}
			run = 0;
			if (/[A-Za-z]/.test(character)) letters++;
		}
	}

	return { letters, banded, longestRun };
}

/**
 * Whether a font’s text on a page is Cyrillic that has been read as Western
 * European. `samples` is everything that font sets on the page, pooled.
 *
 * This is the test that decides a page, and it is deliberately hard to pass.
 */
export function readsAsCyrillicMojibake(samples: Iterable<string>): boolean {
	const { letters, banded, longestRun } = countBand(samples);
	if (letters < ENOUGH_LETTERS) return false;
	return banded / letters >= MOSTLY && longestRun >= IN_A_ROW;
}

/**
 * The same question asked of a font on a page where another font has already
 * answered it — and asked far more easily, because most of it has been settled.
 *
 * A page of one of these documents sets its body in one mis-declared font and
 * its headings, its running head and its scripture references in others, and
 * those set a line or two each: `Óòðî Âîñêðåñåíèÿ` is thirteen letters and
 * `Äàí. 8, 26` is four, so neither can clear the bar above on its own. In one
 * magazine issue fifty-two font-pages fall in that gap, and a highlight over a
 * heading would come out of a repaired page still unreadable — which is worse
 * than leaving the whole page alone, because half-mended text does not look
 * like a fault to be reported.
 *
 * So once a page is known, the rest of its fonts are asked only whether their
 * letters are in the band at all. The page numbers stay as they are: they are
 * ASCII, and nothing about them is in the band.
 */
export function sharesTheCyrillicBand(samples: Iterable<string>): boolean {
	const { letters, banded } = countBand(samples);
	return letters > 0 && banded / letters >= MOSTLY;
}

/**
 * The text as the font draws it: each character back to the byte it was read
 * from, and that byte through Windows-1251.
 *
 * One character in, one character out. The extraction works out where each
 * glyph sits along the line by counting characters, so a repair that changed
 * their number would move every glyph border after it and cut the highlighted
 * text in the wrong place. A character read from no byte of the upper half is
 * left exactly as it stands.
 */
export function repairCyrillicText(raw: string): string {
	let out = "";
	for (const character of raw) {
		const byte = byteBehind(character);
		out += byte === undefined ? character : CP1251_HIGH[byte - 0x80];
	}
	return out;
}
