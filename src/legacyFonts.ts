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
