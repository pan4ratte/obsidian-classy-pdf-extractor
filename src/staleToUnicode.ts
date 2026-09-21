/**
 * Fonts whose `/ToUnicode` belongs to some other font.
 *
 * macOS's Quartz rewrites every font of a PDF it saves — Preview does it the
 * moment a highlight is added — and splits each into subsets, renumbering the
 * glyphs of each subset from 33 up. The `/Differences` it writes for the new
 * numbers are right, glyph name by glyph name: code 33 is `afii10037`, У. The
 * `/ToUnicode` it writes beside them is not — it is the table of the codes the
 * font had before, so the same code 33 says г. Every reader trusts
 * `/ToUnicode` over the glyph names, as the specification tells it to, and the
 * page copies out as `гхю 22.06` where it reads УДК 22.06. The page draws
 * correctly, since drawing goes by glyph and not by `/ToUnicode`, so nothing
 * about the file looks wrong until its text is read.
 *
 * The glyph names are the evidence, and a font is only repaired on it: where a
 * font's `/ToUnicode` and its own glyph names disagree over most of the codes
 * both of them name, the names are what the font draws and `/ToUnicode` is the
 * stale one. A healthy font agrees with itself on all of them, so this reads
 * nothing into a font's name or its producer.
 *
 * Nothing of this is reachable through pdf.js: it reads the table, applies it
 * and keeps neither the table nor the names where a caller can see them. So the
 * font dictionaries are read here, from the file's own bytes, and the repair is
 * a table from the character pdf.js reported to the one the glyph draws. It is
 * one character for one, so no glyph border moves — the same rule the
 * Cyrillic-as-WinAnsi repair keeps.
 *
 * Only what Quartz writes is read: a classic cross-reference table, and
 * objects standing on their own rather than packed into object streams. A file
 * written some other way is simply not looked into, and its text is read as it
 * stands.
 */

/** A font's repair: the character pdf.js reports, to the one the glyph draws. */
export type Repair = Map<string, string>;

/**
 * At least this many codes named both by `/ToUnicode` and by a glyph name, for
 * their disagreeing to mean anything. The Cyrillic subsets that prompted this
 * name sixty.
 */
const ENOUGH_CODES = 8;

/**
 * The share of those codes that must disagree. The subsets that prompted this
 * disagree on nearly all of theirs, and a healthy font on none.
 */
const MOSTLY = 0.5;

/** How far into an object its dictionary is looked for before giving it up. */
const HEAD = 1024;

/** The most of a font dictionary read; a `/Differences` array can run long. */
const WHOLE_OBJECT = 65536;

// ─── The Adobe Glyph List, as far as it is needed ───────────────────────────

/**
 * `afii100xx`, the names Cyrillic glyphs are given. Ё and ё break the run of
 * the alphabet, since the list numbered them where the old encodings put them.
 */
function cyrillicAfii(number: number): string | undefined {
	if (number >= 10017 && number <= 10022) return fromCode(0x410 + number - 10017);
	if (number === 10023) return "Ё";
	if (number >= 10024 && number <= 10049) return fromCode(0x416 + number - 10024);
	if (number >= 10065 && number <= 10070) return fromCode(0x430 + number - 10065);
	if (number === 10071) return "ё";
	if (number >= 10072 && number <= 10097) return fromCode(0x436 + number - 10072);
	return CYRILLIC_OUTSIDE_THE_ALPHABET[number];
}

const CYRILLIC_OUTSIDE_THE_ALPHABET: Record<number, string> = {
	10050: "Ґ", 10051: "Ђ", 10052: "Ѓ", 10053: "Є", 10054: "Ѕ", 10055: "І",
	10056: "Ї", 10057: "Ј", 10058: "Љ", 10059: "Њ", 10060: "Ћ", 10061: "Ќ",
	10062: "Ў", 10145: "Џ", 10146: "Ѣ", 10147: "Ѳ", 10148: "Ѵ",
	10098: "ґ", 10099: "ђ", 10100: "ѓ", 10101: "є", 10102: "ѕ", 10103: "і",
	10104: "ї", 10105: "ј", 10106: "љ", 10107: "њ", 10108: "ћ", 10109: "ќ",
	10110: "ў", 10193: "џ", 10194: "ѣ", 10195: "ѳ", 10196: "ѵ",
	61352: "№",
};

/** The Latin glyph names that are not simply the letter they draw. */
const LATIN_NAMES: Record<string, string> = {
	space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$",
	percent: "%", ampersand: "&", quotesingle: "'", parenleft: "(",
	parenright: ")", asterisk: "*", plus: "+", comma: ",", hyphen: "-",
	period: ".", slash: "/", zero: "0", one: "1", two: "2", three: "3",
	four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
	colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">",
	question: "?", at: "@", bracketleft: "[", backslash: "\\",
	bracketright: "]", asciicircum: "^", underscore: "_", grave: "`",
	braceleft: "{", bar: "|", braceright: "}", asciitilde: "~",
	quoteleft: "‘", quoteright: "’", quotedblleft: "“", quotedblright: "”",
	quotesinglbase: "‚", quotedblbase: "„", guillemotleft: "«",
	guillemotright: "»", guilsinglleft: "‹", guilsinglright: "›",
	endash: "–", emdash: "—", ellipsis: "…", bullet: "•", degree: "°",
	section: "§", paragraph: "¶", copyright: "©", registered: "®",
	trademark: "™", periodcentered: "·", minus: "−", multiply: "×",
	divide: "÷", dagger: "†", daggerdbl: "‡",
	// A space that must not break is still a space to a note, and the rest of
	// the extraction joins and trims on the ordinary kind.
	nbspace: " ", nonbreakingspace: " ",
};

function fromCode(code: number): string {
	return String.fromCharCode(code);
}

/** What a glyph name draws, where the name says; nothing where it does not. */
export function glyphUnicode(name: string): string | undefined {
	if (/^[A-Za-z]$/.test(name)) return name;
	if (name in LATIN_NAMES) return LATIN_NAMES[name];

	const afii = /^afii(\d{5})$/.exec(name);
	if (afii) return cyrillicAfii(Number(afii[1]));

	const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name) ?? /^u([0-9A-Fa-f]{4})$/.exec(name);
	if (uni) {
		const code = parseInt(uni[1], 16);
		// Surrogates name half a character, which nothing here can put back.
		if (code >= 0xd800 && code <= 0xdfff) return undefined;
		return code === 0xa0 ? " " : fromCode(code);
	}
	return undefined;
}

// ─── Reading the font dictionaries ──────────────────────────────────────────

/** The bytes as the characters a PDF's syntax is written in, one per byte. */
function text(bytes: Uint8Array, from: number, to: number): string {
	const end = Math.min(to, bytes.length);
	let out = "";
	for (let at = Math.max(from, 0); at < end; at += 8192) {
		const chunk = bytes.subarray(at, Math.min(at + 8192, end));
		out += String.fromCharCode(...chunk);
	}
	return out;
}

/**
 * Where every object of the file starts, read off its cross-reference tables
 * from the newest back through each `/Prev`. An object a later table moved is
 * kept where the later table put it. Null for a file whose table is a stream,
 * which is not what Quartz writes.
 */
export function objectOffsets(bytes: Uint8Array): Map<number, number> | null {
	const tail = text(bytes, bytes.length - 1024, bytes.length);
	const start = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(tail);
	if (!start) return null;

	const offsets = new Map<number, number>();
	const visited = new Set<number>();
	let table: number | undefined = Number(start[1]);
	while (table !== undefined && !visited.has(table)) {
		visited.add(table);
		let at = table;
		if (text(bytes, at, at + 4) !== "xref") return offsets.size ? offsets : null;
		at += 4;

		for (;;) {
			const header = /^\s*(\d+)\s+(\d+)[ \t]*\r?\n?/.exec(text(bytes, at, at + 64));
			if (!header) break;
			at += header[0].length;
			const first = Number(header[1]);
			const count = Number(header[2]);
			const entries = text(bytes, at, at + count * 20);
			const rows = entries.match(/(\d{10}) (\d{5}) ([nf])/g) ?? [];
			rows.forEach((row, index) => {
				const number = first + index;
				if (row.endsWith("n") && !offsets.has(number)) {
					offsets.set(number, Number(row.slice(0, 10)));
				}
			});
			at += count * 20;
		}

		const trailer = text(bytes, at, at + 2048);
		const previous = /^\s*trailer[\s\S]*?\/Prev\s+(\d+)/.exec(trailer);
		table = previous ? Number(previous[1]) : undefined;
	}
	return offsets;
}

/** An object's own text, up to its `endobj` or its stream, whichever is first. */
function objectAt(bytes: Uint8Array, offset: number, length: number): string {
	const body = text(bytes, offset, offset + length);
	const ends = [body.indexOf("endobj"), body.search(/\bstream\r?\n/)]
		.filter((at) => at >= 0);
	return ends.length ? body.slice(0, Math.min(...ends)) : body;
}

function reference(dictionary: string, key: string): number | undefined {
	const found = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dictionary);
	return found ? Number(found[1]) : undefined;
}

/** A PDF name with its `#xx` escapes spelled out. */
function pdfName(raw: string): string {
	return raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
		fromCode(parseInt(hex, 16))
	);
}

/** Code to glyph name, off the body of a `/Differences` array. */
export function parseDifferences(array: string): Map<number, string> {
	const names = new Map<number, string>();
	let code = 0;
	for (const token of array.match(/\d+|\/[^\s/[\]<>()]+/g) ?? []) {
		if (token.startsWith("/")) names.set(code++, pdfName(token.slice(1)));
		else code = Number(token);
	}
	return names;
}

/** UTF-16BE, written as hex. */
function utf16(hex: string): string {
	let out = "";
	for (let at = 0; at + 4 <= hex.length; at += 4) {
		out += fromCode(parseInt(hex.slice(at, at + 4), 16));
	}
	return out;
}

/**
 * Code to text, off a `/ToUnicode` CMap. Only a CMap of one-byte codes is read,
 * which is every simple font; anything wider answers nothing, and the font it
 * belongs to is left alone.
 */
export function parseToUnicode(cmap: string): Map<number, string> {
	const table = new Map<number, string>();
	const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(cmap);
	if (space && space[1].length !== 2) return table;

	for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
		for (const pair of block.matchAll(/<([0-9A-Fa-f]{2})>\s*<([0-9A-Fa-f]*)>/g)) {
			table.set(parseInt(pair[1], 16), utf16(pair[2]));
		}
	}
	for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
		const ranges = block.matchAll(
			/<([0-9A-Fa-f]{2})>\s*<([0-9A-Fa-f]{2})>\s*(?:<([0-9A-Fa-f]*)>|\[([^\]]*)\])/g
		);
		for (const range of ranges) {
			const low = parseInt(range[1], 16);
			const high = parseInt(range[2], 16);
			if (range[4] !== undefined) {
				const each = range[4].match(/<([0-9A-Fa-f]*)>/g) ?? [];
				each.forEach((one, index) => {
					if (low + index <= high) table.set(low + index, utf16(one.slice(1, -1)));
				});
				continue;
			}
			// The last UTF-16 unit counts up across the range.
			const first = utf16(range[3]);
			if (first === "") continue;
			const head = first.slice(0, -1);
			const last = first.charCodeAt(first.length - 1);
			for (let code = low; code <= high; code++) {
				table.set(code, head + fromCode(last + code - low));
			}
		}
	}
	return table;
}

/**
 * The repair of one font, or null for a font whose `/ToUnicode` agrees with its
 * glyph names — which is every font but the ones this is for.
 *
 * What pdf.js reports for a code is `/ToUnicode`'s answer where it has one and
 * the glyph name's where it has not; what the glyph draws is the name's answer.
 *
 * Two codes can report one character. The stale table can send a code to a
 * letter another code draws — in the subsets that prompted this, А's code is
 * told З, while З's own code has no entry and reports the З it draws — and the
 * text then carries one character for both. Nothing in it tells the two apart,
 * so where they are letters of the Cyrillic alphabet the commoner one is taken:
 * one of them was wrong already, and this is wrong the least often. Anything
 * else two codes share is left as reported.
 */
export function repairOf(
	differences: Map<number, string>,
	toUnicode: Map<number, string>
): Repair | null {
	let compared = 0;
	let disagreeing = 0;
	for (const [code, name] of differences) {
		const drawn = glyphUnicode(name);
		const told = toUnicode.get(code);
		if (drawn === undefined || told === undefined) continue;
		compared++;
		if (drawn !== told) disagreeing++;
	}
	if (compared < ENOUGH_CODES || disagreeing / compared < MOSTLY) return null;

	// Every glyph a reported character may stand for; null where one of them
	// draws something no name here says.
	const candidates = new Map<string, Set<string> | null>();
	for (const [code, name] of differences) {
		const drawn = glyphUnicode(name);
		const told = toUnicode.get(code) ?? drawn;
		if (told === undefined || told.length !== 1) continue;
		if (drawn === undefined || drawn.length !== 1) {
			candidates.set(told, null);
			continue;
		}
		const known = candidates.get(told);
		if (known === null) continue;
		if (known) known.add(drawn);
		else candidates.set(told, new Set([drawn]));
	}

	const repair: Repair = new Map();
	for (const [told, drawn] of candidates) {
		if (drawn === null) continue;
		const chosen = drawn.size === 1 ? [...drawn][0] : commonest(drawn);
		if (chosen !== undefined && chosen !== told) repair.set(told, chosen);
	}
	return repair.size ? repair : null;
}

/**
 * Russian letters, commonest first. Capitals keep the order of their lowercase,
 * which is near enough for the word-initial letters they mostly are.
 */
const BY_FREQUENCY = "оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъё";

/** The commonest of several Cyrillic letters; nothing, for any other set. */
function commonest(letters: Set<string>): string | undefined {
	let best: string | undefined;
	let bestRank = Infinity;
	for (const letter of letters) {
		const rank = BY_FREQUENCY.indexOf(letter.toLowerCase());
		if (rank < 0) return undefined;
		if (rank < bestRank) {
			best = letter;
			bestRank = rank;
		}
	}
	return best;
}

/** Inflated, where the stream is deflated; nothing, for any other filter. */
async function streamOf(
	bytes: Uint8Array,
	offsets: Map<number, number>,
	number: number
): Promise<string | null> {
	const offset = offsets.get(number);
	if (offset === undefined) return null;
	const body = text(bytes, offset, offset + 4096);
	const opens = /\bstream(\r\n|\n)/.exec(body);
	if (!opens) return null;
	const dictionary = body.slice(0, opens.index);

	let length: number | undefined;
	const indirect = reference(dictionary, "Length");
	if (indirect !== undefined) {
		const at = offsets.get(indirect);
		const value = at === undefined ? null : /obj\s+(\d+)/.exec(objectAt(bytes, at, 256));
		length = value ? Number(value[1]) : undefined;
	} else {
		const direct = /\/Length\s+(\d+)/.exec(dictionary);
		length = direct ? Number(direct[1]) : undefined;
	}
	if (length === undefined) return null;

	const start = offset + opens.index + opens[0].length;
	const data = bytes.slice(start, start + length);
	const filter = /\/Filter\s*\[?\s*\/(\w+)/.exec(dictionary)?.[1];
	if (filter === undefined) return text(data, 0, data.length);
	if (filter !== "FlateDecode") return null;

	const inflated = new Response(data).body?.pipeThrough(
		new DecompressionStream("deflate")
	);
	if (!inflated) return null;
	const decoded = new Uint8Array(await new Response(inflated).arrayBuffer());
	return text(decoded, 0, decoded.length);
}

/**
 * Every font of the file that needs repairing, by its `/BaseFont` as written —
 * subset tag and all, since two subsets of one face are two different fonts
 * here and the tag is the only thing telling them apart.
 *
 * Read before the file is handed to pdf.js, which takes its bytes over. Nothing
 * here may fail an extraction: a file this cannot read is a file with nothing
 * to repair.
 */
export async function staleToUnicodeFonts(
	content: ArrayBuffer
): Promise<Map<string, Repair>> {
	const repairs = new Map<string, Repair>();
	try {
		const bytes = new Uint8Array(content);
		const offsets = objectOffsets(bytes);
		if (!offsets) return repairs;

		const seen = new Set<string>();
		for (const offset of offsets.values()) {
			const head = objectAt(bytes, offset, HEAD);
			if (!/\/Type\s*\/Font\b/.test(head) || !head.includes("/ToUnicode")) {
				continue;
			}
			const font = objectAt(bytes, offset, WHOLE_OBJECT);
			const baseFont = /\/BaseFont\s*\/([^\s/[\]<>()]+)/.exec(font);
			const cmapAt = reference(font, "ToUnicode");
			if (!baseFont || cmapAt === undefined) continue;
			const name = pdfName(baseFont[1]);
			// Two fonts of one name cannot be told apart by what pdf.js reports.
			if (seen.has(name)) {
				repairs.delete(name);
				continue;
			}
			seen.add(name);

			let encoding = font;
			const encodingAt = reference(font, "Encoding");
			if (encodingAt !== undefined) {
				const at = offsets.get(encodingAt);
				if (at === undefined) continue;
				encoding = objectAt(bytes, at, WHOLE_OBJECT);
			}
			const array = /\/Differences\s*\[([^\]]*)\]/.exec(encoding);
			if (!array) continue;

			const cmap = await streamOf(bytes, offsets, cmapAt);
			if (cmap === null) continue;

			const repair = repairOf(parseDifferences(array[1]), parseToUnicode(cmap));
			if (repair) repairs.set(name, repair);
		}
	} catch (error) {
		console.error(error);
	}
	return repairs;
}

/** A string as the glyphs that drew it read. */
export function repairText(str: string, repair: Repair): string {
	let out = "";
	for (const character of str) out += repair.get(character) ?? character;
	return out;
}
