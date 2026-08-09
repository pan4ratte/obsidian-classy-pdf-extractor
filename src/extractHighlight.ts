import {
	PDFAnnotation,
	PDFFile,
	PDFJsLib,
	PDFSection,
	ProgressReport,
	RawPDFAnnotation,
	RawPDFOutlineItem,
} from "src/types";
import { ANNOTS_TREATED_AS_HIGHLIGHTS } from "src/settings";
import {
	baseFontName,
	decodeLegacyText,
	LegacyEncoding,
	legacyEncodingOf,
} from "src/legacyFonts";
import {
	PDFDocumentProxy,
	PDFPageProxy,
	RefProxy,
	TextContent,
	TextItem,
} from "pdfjs-dist/types/src/display/api";

/** The box one quad covers, in PDF user space. */
interface QuadBounds {
	minx: number;
	maxx: number;
	miny: number;
	maxy: number;
}

/**
 * The box of quad `index`. A quad is four corners, which the spec orders
 * tL, tR, bL, bR — but writers disagree, so the box is taken from the extremes
 * rather than from named corners. That is what makes a highlight dragged right
 * to left read the same as one dragged left to right.
 */
function quadBounds(quadPoints: ArrayLike<number>, index: number): QuadBounds {
	const at = index * 8;
	let minx = quadPoints[at];
	let maxx = minx;
	let miny = quadPoints[at + 1];
	let maxy = miny;
	for (let corner = 2; corner < 8; corner += 2) {
		const x = quadPoints[at + corner];
		const y = quadPoints[at + corner + 1];
		if (x < minx) minx = x;
		else if (x > maxx) maxx = x;
		if (y < miny) miny = y;
		else if (y > maxy) maxy = y;
	}
	return { minx, maxx, miny, maxy };
}

/**
 * The quads grouped into the lines they stand on, down the page, each line's
 * quads left to right. A PDF need not list them that way — a highlight dragged
 * upwards is written bottom line first by some writers, which would otherwise
 * join the lines back to front.
 *
 * Grouped into lines before being sorted within one, rather than compared
 * pairwise against a tolerance: a comparator whose idea of "the same line"
 * depends on the pair it is given is not transitive, and sorts by it come out
 * arbitrary. The lines are kept apart rather than flattened because which end
 * of one its quads are read from is a property of the line — a line of Hebrew
 * or Arabic is read from its right-hand end.
 */
function linesOfQuads(quads: QuadBounds[]): QuadBounds[][] {
	if (quads.length === 0) return [];
	if (quads.length === 1) return [quads];

	// PDF y grows upwards, so the top of the page is the largest.
	const down = [...quads].sort((a, b) => b.maxy - a.maxy);
	// Half a line of the tallest quad: enough to keep the lines apart, loose
	// enough that two quads on one line are not read as two.
	let tallest = 0;
	for (const quad of quads) {
		const height = quad.maxy - quad.miny;
		if (height > tallest) tallest = height;
	}
	const line = tallest / 2;

	const lines: QuadBounds[][] = [];
	for (const quad of down) {
		const current = lines[lines.length - 1];
		if (current && current[0].maxy - quad.maxy <= line) {
			current.push(quad);
		} else {
			lines.push([quad]);
		}
	}

	for (const one of lines) one.sort((a, b) => a.minx - b.minx);
	return lines;
}

/**
 * One line of marked up text: the box its quads cover between them, and which
 * way the text under them runs. Where one paragraph ends and the next begins is
 * read off these and nothing else — a PDF holds no paragraphs, only lines laid
 * out on a page.
 */
interface LineBox {
	top: number;
	bottom: number;
	left: number;
	right: number;
	rightToLeft: boolean;
}

/**
 * Where a line's text begins and where it ends, along the direction it is read.
 * A line of Hebrew or Arabic begins at its right-hand edge and ends at its left,
 * so both are negated for one — every comparison after them then reads the same
 * whichever way the line runs.
 */
function startEdge(line: LineBox): number {
	return line.rightToLeft ? -line.right : line.left;
}

function endEdge(line: LineBox): number {
	return line.rightToLeft ? -line.left : line.right;
}

/** A gap this much wider than the line spacing is a paragraph on its own. */
const PARAGRAPH_GAP = 1.5;
/** Wider than this, it is one where the line before it also ended short. */
const WIDER_GAP = 1.18;
/** A line indented by this much of a line's height begins a paragraph. */
const INDENT = 0.3;
/** How far short of the margin a line stops to have ended a paragraph. */
const SHORT_LINE = 1;
/** Two quads closer than this share of a line's height stand on one line. */
const SAME_LINE = 0.6;

/** What the paragraphs of one annotation are written apart with. */
export const PARAGRAPH_BREAK = "\n\n";

/**
 * The page's own line spacing: the distance most of its lines stand apart.
 * Undefined for a page holding too little text to say.
 *
 * `tops` is every text item's baseline, sorted down the page, so the lines are
 * runs of it and the spacing is the differences between the runs. The median is
 * what is taken rather than the average: a page mixes its body with headings,
 * footnotes and the raised digits that call them, and the body is what most of
 * the lines are.
 */
export function pageLinePitch(tops: Float64Array): number | undefined {
	const gaps: number[] = [];
	for (let at = 1; at < tops.length; at++) {
		const gap = tops[at - 1] - tops[at];
		// The items of one line share its baseline exactly; a raised or lowered
		// one sits a fraction off it and is no line of its own either.
		if (gap > 1) gaps.push(gap);
	}
	if (gaps.length < 3) return undefined;

	gaps.sort((one, other) => one - other);
	return gaps[gaps.length >> 1];
}

/**
 * Which lines begin a paragraph of their own. Nothing in a PDF says where a
 * paragraph ends, so it is read off the shape of the lines — three signs of it,
 * none of which is the words themselves:
 *
 * - **The gap.** The lines of one paragraph stand a fixed distance apart, so a
 *   gap wider than that distance is the space a typesetter leaves between two
 *   of them. The distance is the smallest gap the marked lines have between
 *   them, which is the spacing of whatever block they stand in — a quotation
 *   inside a chapter is usually set tighter than the chapter around it.
 * - **The indent.** A line beginning further in than the one above it is the
 *   first line of something: an indented paragraph, or a quotation stepped in
 *   from the margin. Compared with the line above rather than with the leftmost
 *   of them all, because every line of that quotation stands in from the margin
 *   and only its first one begins anything.
 * - **The short line.** A paragraph's last line stops short of the margin the
 *   others reach. On its own that is only where the text ran out — the one line
 *   of a short quotation is short too — so it is read as what confirms the
 *   other two rather than as the end of a paragraph by itself.
 *
 * `pitch` is the page's own line spacing, where the caller has it. Two things
 * need it: a highlight of two lines has one gap and nothing to compare it with,
 * and a highlight whose every line is a paragraph of its own would otherwise
 * take the space between paragraphs for the space between lines.
 */
function paragraphBreaks(lines: LineBox[], pitch?: number): boolean[] {
	const breaks = new Array<boolean>(lines.length).fill(false);
	if (lines.length < 2) return breaks;

	const heights = lines.map((line) => line.top - line.bottom);
	heights.sort((one, other) => one - other);
	const height = heights[heights.length >> 1];

	// Measured between the bottoms of the lines rather than their tops: a
	// footnote marker raised above its line joins that line and lifts its top,
	// and the tops are what the lines were gathered by in the first place.
	const gaps: number[] = [];
	for (let at = 1; at < lines.length; at++) {
		gaps.push(lines[at - 1].bottom - lines[at].bottom);
	}

	let spacing = Infinity;
	for (const gap of gaps) {
		if (gap >= height * SAME_LINE && gap < spacing) spacing = gap;
	}
	if (!Number.isFinite(spacing)) spacing = pitch ?? height;
	else if (pitch && spacing > pitch * PARAGRAPH_GAP) spacing = pitch;

	// How far the lines running each way reach — the margin a line stopping
	// short of it has ended a paragraph at. The two are kept apart because they
	// are measured from opposite ends of the page.
	let leftToRightMargin = -Infinity;
	let rightToLeftMargin = -Infinity;
	for (const line of lines) {
		const edge = endEdge(line);
		if (line.rightToLeft) {
			if (edge > rightToLeftMargin) rightToLeftMargin = edge;
		} else if (edge > leftToRightMargin) {
			leftToRightMargin = edge;
		}
	}

	for (let at = 1; at < lines.length; at++) {
		const before = lines[at - 1];
		const after = lines[at];
		const gap = gaps[at - 1];

		const margin = before.rightToLeft
			? rightToLeftMargin
			: leftToRightMargin;
		const short = margin - endEdge(before) > height * SHORT_LINE;
		// Nothing to compare where two lines run opposite ways: their edges are
		// measured from opposite margins, and the gap alone decides.
		const indented =
			before.rightToLeft === after.rightToLeft &&
			startEdge(after) - startEdge(before) > height * INDENT;

		breaks[at] =
			gap > spacing * PARAGRAPH_GAP ||
			(short && (indented || gap > spacing * WIDER_GAP));
	}
	return breaks;
}

/**
 * `D:YYYYMMDD` and whatever follows. Everything after the year is optional, and
 * some writers omit the `D:`. Time and zone are deliberately not read — a zone
 * would move an annotation a day either way depending on where it is read.
 */
const PDF_DATE = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?/;

/**
 * The day a PDF date names, as `YYYY-MM-DD`. Undefined when missing or
 * unreadable, so an undated annotation stays apart from one made at the epoch.
 */
export function pdfDateToDay(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const parsed = PDF_DATE.exec(raw.trim());
	if (!parsed) return undefined;

	const [, year, month = "01", day = "01"] = parsed;
	// A writer padding with zeroes would otherwise sort under month 00.
	if (Number(month) < 1 || Number(month) > 12) return undefined;
	if (Number(day) < 1 || Number(day) > 31) return undefined;

	return `${year}-${month}-${day}`;
}

/**
 * The hours and minutes following a whole `D:YYYYMMDD`. Nothing shorter is
 * read: in a date cut off before the day, four more digits would be the day
 * and month of something else, not a time.
 */
const PDF_TIME = /^(?:D:)?\d{8}(\d{2})(\d{2})?/;

/**
 * The time of day a PDF date names, as `HH:mm`, read as the writer wrote it.
 * The zone that may follow is left alone for the reason the day leaves it
 * alone: applying it would move the annotation depending on where it is read,
 * and then the time would no longer be the one on the reader's own screen when
 * they made the note. Undefined when the date carries no time, which many
 * writers omit.
 */
export function pdfDateToTime(
	raw: string | null | undefined
): string | undefined {
	if (!raw) return undefined;
	const parsed = PDF_TIME.exec(raw.trim());
	if (!parsed) return undefined;

	const [, hour, minute = "00"] = parsed;
	// 24 is midnight in some writers' output, but not a time to print.
	if (Number(hour) > 23) return undefined;
	if (Number(minute) > 59) return undefined;

	return `${hour}:${minute}`;
}

/** One channel of a colour, as the two hex digits it is written with. */
function hexByte(value: number): string {
	const bounded = Math.min(255, Math.max(0, Math.round(value)));
	return bounded.toString(16).padStart(2, "0");
}

/** What pdf.js fills a missing `/C` in with, and what it means here. */
const PDFJS_DEFAULT_COLOR = "#000000";

/**
 * The colour of an annotation, as `#rrggbb`. pdf.js hands `/C` over already
 * converted to RGB — the PDF format lets it be written in grey, RGB or CMYK,
 * and none of that reaches here.
 *
 * Undefined for an annotation the file gives no colour to read: pdf.js reports
 * null for one explicitly transparent, and nothing at all for a subtype that
 * carries no colour entry.
 *
 * Black is the awkward one. pdf.js fills a *missing* `/C` in with it rather
 * than leaving it out, so black and unset are the same answer, and which one it
 * is has to be read from the kind of annotation asking. A reader picks black to
 * underline or strike out with, so a markup annotation keeps it — while `/C` on
 * a sticky note or a free text box is the icon or the border, routinely absent,
 * and a black nobody chose would fill the colour list of every PDF with a
 * bucket that means "the file said nothing".
 */
export function annotationColor(
	color: ArrayLike<number> | null | undefined,
	marksUpText: boolean
): string | undefined {
	if (!color || color.length < 3) return undefined;

	const channels = [color[0], color[1], color[2]];
	if (!channels.every((channel) => Number.isFinite(channel))) return undefined;

	const hex = `#${channels.map(hexByte).join("")}`;
	if (hex === PDFJS_DEFAULT_COLOR && !marksUpText) return undefined;
	return hex;
}

/**
 * What the extraction reads off a pdf.js text item. A `TextItem` satisfies it;
 * the matrix is restated because pdf.js types `transform` as `any[]`.
 */
export interface PositionedText {
	str: string;
	width: number;
	/** pdf.js transform matrix; [4] and [5] are the item's x and y. */
	transform: number[];
	/**
	 * Which way the item's glyphs run, as pdf.js resolved it: `"ltr"` or
	 * `"rtl"`. The string is in the order it is written whichever way it runs,
	 * so this is the only thing saying which end of the item its first
	 * character sits at. Absent from a caller that reports no direction, and
	 * then read off the text itself.
	 */
	dir?: string;
	/**
	 * The font the item is set in. pdf.js names it with an id of its own; by
	 * the time the text is read this holds the font's real name, which is the
	 * only thing in the file that says a pre-Unicode font was used — see
	 * `fontNamesOfPage`.
	 */
	fontName?: string;
}

/**
 * The scripts written from right to left that this reads: Hebrew and Arabic,
 * which covers Persian, Urdu and the rest of what the Arabic script is used
 * for. Anything else is taken to run left to right, which is what an unknown
 * script most likely does and what the extraction did for every script before.
 */
const RIGHT_TO_LEFT_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;

/** A letter or a digit of a script that runs left to right. */
const LEFT_TO_RIGHT_LETTER = /[\p{L}\p{N}]/u;

/** Arabic-Indic digits, in both the forms the script writes them. */
const ARABIC_DIGIT = /[٠-٩۰-۹]/;

/**
 * Whether a text item's glyphs run right to left.
 *
 * pdf.js resolves the direction of every item it reports and hands the string
 * over in writing order either way, so `dir` is taken at its word where there
 * is one. Read off the text otherwise, by the share of it belonging to a
 * right-to-left script — the same measure pdf.js settles a mixed item by, so a
 * caller supplying its own items is read the same way as one relaying pdf.js's.
 */
function runsRightToLeft(item: PositionedText): boolean {
	if (item.dir) return item.dir === "rtl";

	const str = item.str;
	let rightToLeft = 0;
	for (let at = 0; at < str.length; at++) {
		if (RIGHT_TO_LEFT_SCRIPT.test(str[at])) rightToLeft++;
	}
	if (rightToLeft === 0) return false;
	return str.length <= 4 || rightToLeft / str.length >= 0.3;
}

/**
 * Which way a character runs inside a line whose base direction is right to
 * left: 1 for one belonging to a left-to-right script, -1 for one belonging to
 * a right-to-left script, 0 for a character taking the direction of whatever
 * surrounds it — spaces, punctuation, and the marks written over a letter.
 *
 * The digits of the Arabic script count as left to right: `١٢٣` is written in
 * an Arabic word the same way `123` is, most significant digit first.
 */
function flowOf(letter: string): number {
	if (RIGHT_TO_LEFT_SCRIPT.test(letter)) {
		return ARABIC_DIGIT.test(letter) ? 1 : -1;
	}
	return LEFT_TO_RIGHT_LETTER.test(letter) ? 1 : 0;
}

/** `values[from..to)`, turned round in place. */
function reverseBetween(values: number[], from: number, to: number): void {
	for (let low = from, high = to - 1; low < high; low++, high--) {
		const held = values[low];
		values[low] = values[high];
		values[high] = held;
	}
}

/**
 * The characters of a right-to-left item in the order their glyphs are drawn
 * along the line — leftmost first — as indices into the string.
 *
 * The line runs the other way to the string, so it is the string turned round.
 * What is not simply turned round is a stretch of it belonging to a
 * left-to-right script: a year or a Latin citation inside an Arabic sentence
 * sits where the sentence puts it but reads forwards inside itself, so each
 * such run is turned back. A run of spaces or punctuation joins the two only
 * when both sides of it run left to right; otherwise it goes with the line, so
 * the space before a Latin word does not end up after it.
 */
function rightToLeftOrder(str: string): number[] {
	const length = str.length;
	const order = new Array<number>(length);
	for (let at = 0; at < length; at++) order[at] = length - 1 - at;

	const flow = new Array<number>(length);
	for (let at = 0; at < length; at++) {
		// A mark written over a letter runs whichever way that letter does —
		// the rule pdf.js resolved the string by before handing it over.
		flow[at] = isZeroWidth(str[at])
			? at > 0
				? flow[at - 1]
				: -1
			: flowOf(str[at]);
	}

	// Nothing strong before the first character, so a run of neutrals opening
	// the string goes with the line, as one closing it does.
	let before = -1;
	for (let at = 0; at < length; at++) {
		if (flow[at] !== 0) {
			before = flow[at];
			continue;
		}
		let end = at;
		while (end < length && flow[end] === 0) end++;
		const after = end < length ? flow[end] : -1;
		const resolved = before === 1 && after === 1 ? 1 : -1;
		for (let mid = at; mid < end; mid++) flow[mid] = resolved;
		at = end - 1;
	}

	for (let at = 0; at < length; ) {
		if (flow[at] !== 1) {
			at++;
			continue;
		}
		let end = at;
		while (end < length && flow[end] === 1) end++;
		// The string's [at, end) landed in `order` at [length - end, length - at).
		reverseBetween(order, length - end, length - at);
		at = end;
	}
	return order;
}

/**
 * Where `y` falls in `tops` — the baselines of one page's text items, largest
 * first. `orEqual` says which side an item sitting exactly on `y` goes: the
 * first item *at* `y` when true, the first one strictly *below* it when false.
 * The two answers together bracket the items on the lines a quad covers.
 */
function baselineAt(tops: Float64Array, y: number, orEqual: boolean): number {
	let low = 0;
	let high = tops.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (orEqual ? tops[mid] > y : tops[mid] >= y) low = mid + 1;
		else high = mid;
	}
	return low;
}

/** The text under one quad, and which way the items carrying it run. */
interface QuadText {
	text: string;
	/** Whether more of it was read off right-to-left items than left-to-right. */
	rightToLeft: boolean;
}

/** The text falling inside one quad. */
function searchQuad(
	quad: QuadBounds,
	items: PositionedText[],
	tops?: Float64Array
): QuadText {
	const { minx, maxx, miny, maxy } = quad;

	// Sorted down the page, the items on the lines a quad covers are one
	// stretch of the page rather than a scattering of it — so it is found by
	// halving, instead of walking every item of the page for every quad of
	// every annotation standing on it. Without the baselines there is nothing
	// saying the items are in that order, and the whole page is read.
	const from = tops ? baselineAt(tops, maxy, true) : 0;
	const to = tops ? baselineAt(tops, miny, false) : items.length;

	// Gathered piece by piece rather than concatenated as they are found: the
	// items arrive left to right, which is the order they are read in only on a
	// line running that way — and which line it is is not settled until its
	// items have been seen.
	const pieces: string[] = [];
	let rightToLeft = 0;
	let leftToRight = 0;

	for (let at = from; at < to; at++) {
		const item = items[at];
		if (item.width == 0) continue; // eliminate empty stuff
		const y = item.transform[5];
		if (y < miny || y > maxy) continue; // y coordinate not in box
		const x = item.transform[4];
		if (x + item.width < minx) continue; // end of txt before highlight starts
		if (x > maxx) continue; // start of text after highlight ends

		// A pre-Unicode font writes Latin bytes that draw Greek or Hebrew, so
		// its text is read off the page as it stands and decoded after — the
		// bytes of even a Hebrew one are already in the order the glyphs are
		// drawn, and it is the decoding that turns the word round.
		const encoding = legacyEncodingOf(item.fontName);
		const rtl = encoding ? encoding.visualOrder : runsRightToLeft(item);
		const order = !encoding && rtl ? rightToLeftOrder(item.str) : undefined;

		// snap both edges to the nearest estimated glyph border
		const borders = glyphBorders(item.str, x, item.width, order, encoding);
		const read = glyphSlice(
			item.str,
			nearestBorder(borders, minx),
			nearestBorder(borders, maxx),
			order,
			encoding
		);
		if (read === "") continue;
		const piece = encoding ? decodeLegacyText(read, encoding) : read;
		if (piece === "") continue;

		pieces.push(piece);
		if (rtl) rightToLeft += piece.length;
		else leftToRight += piece.length;
	}

	const reversed = rightToLeft > leftToRight;
	if (reversed) pieces.reverse();
	return { text: pieces.join("").trim(), rightToLeft: reversed };
}

/**
 * The lines of one paragraph run together, in the order they were read. A line
 * ending in a hyphen is a word broken across two of them, and the word is put
 * back together; anything else is joined with a space.
 */
function joinLines(lines: string[]): string {
	return lines.reduce((txt: string, res) => {
		// if the last character of txt (previous lines) is not a hyphen, we concatenate the lines, by adding a blank
		if (txt != "" && txt.substring(txt.length - 1) != "-") {
			return txt + " " + res;
		} else if (
			txt.substring(txt.length - 2).toLowerCase() ==
				txt.substring(txt.length - 2) && // end by lowercase-
			res.substring(0, 1).toLowerCase() == res.substring(0, 1)
		) {
			// and start with lowercase
			return txt.substring(0, txt.length - 1) + res; // remove hyphon
		} else {
			return txt + res; // keep hyphon or if the previous text is empty, return the whole result
		}
	}, "");
}

/**
 * The marked up text, read quad by quad, joined line by line and broken into
 * the paragraphs the page laid the lines out as — see `paragraphBreaks`.
 *
 * `tops` is the baseline of every item of `items`, in the same order, which
 * only a caller holding them sorted down the page can supply — see
 * `readingOrderText`. It is what lets a quad find its lines without reading
 * the page; given nothing, every item is considered, as before. `pitch` is that
 * caller's line spacing for the page, read off the same items.
 */
export function extractHighlight(
	annot: Pick<RawPDFAnnotation, "quadPoints">,
	items: PositionedText[],
	tops?: Float64Array,
	pitch?: number
): string {
	// No usable QuadPoints: only the comment is left to show, and one
	// malformed annotation must not fail the whole file.
	if (!annot.quadPoints) return "";

	const quadPoints = annot.quadPoints;
	// One quad per line of marked up text, four corners each.
	const quads: QuadBounds[] = [];
	for (let index = 0; index < quadPoints.length / 8; index++) {
		quads.push(quadBounds(quadPoints, index));
	}

	// Read a line at a time, and each line from the end its own text starts at:
	// a line of Hebrew or Arabic runs right to left, so the quads standing on it
	// are taken in that order too. Which way it runs is what the text under it
	// says, so the quads are read before they are ordered.
	const boxes: LineBox[] = [];
	const read: string[][] = [];
	for (const line of linesOfQuads(quads)) {
		const texts = line.map((quad) => searchQuad(quad, items, tops));

		let rightToLeft = 0;
		let leftToRight = 0;
		for (const one of texts) {
			if (one.rightToLeft) rightToLeft += one.text.length;
			else leftToRight += one.text.length;
		}
		const reversed = rightToLeft > leftToRight;
		if (reversed) texts.reverse();

		let { minx: left, maxx: right, miny: bottom, maxy: top } = line[0];
		for (const quad of line) {
			if (quad.minx < left) left = quad.minx;
			if (quad.maxx > right) right = quad.maxx;
			if (quad.miny < bottom) bottom = quad.miny;
			if (quad.maxy > top) top = quad.maxy;
		}
		boxes.push({ top, bottom, left, right, rightToLeft: reversed });
		read.push(texts.map((one) => one.text));
	}

	// One string per paragraph, each holding the lines of it run together. The
	// break falls before the line beginning the new paragraph, so the lines of
	// the one before it are joined by the rule they would have been anyway.
	const paragraphs: string[] = [];
	const breaks = paragraphBreaks(boxes, pitch);
	let lines: string[] = [];
	for (let at = 0; at < read.length; at++) {
		if (breaks[at]) {
			paragraphs.push(joinLines(lines));
			lines = [];
		}
		for (const text of read[at]) lines.push(text);
	}
	paragraphs.push(joinLines(lines));

	return paragraphs
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph !== "")
		.join(PARAGRAPH_BREAK);
}

/**
 * Where in a destination array the top of the view sits, by the kind of
 * destination it is: `[pageRef, {name}, ...arguments]`. The kinds left out —
 * `Fit`, `FitB`, `FitV`, `FitBV` — name a page or a width and no height on it,
 * so a section jumping to one of them starts at the top of its page.
 */
const TOP_IN_DESTINATION: Record<string, number> = {
	// left, top, zoom
	XYZ: 3,
	// top
	FitH: 2,
	FitBH: 2,
	// left, bottom, right, top
	FitR: 5,
};

/** A pdf.js object reference, which is what an explicit destination points at. */
function isPageReference(value: unknown): value is RefProxy {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as RefProxy).num === "number" &&
		typeof (value as RefProxy).gen === "number"
	);
}

/** The `{name}` an explicit destination carries second, or nothing usable. */
function destinationKind(destination: unknown[]): string {
	const kind = destination[1];
	if (typeof kind !== "object" || kind === null) return "";
	const name = (kind as { name?: unknown }).name;
	return typeof name === "string" ? name : "";
}

/**
 * The page a destination lands on and how far down it, or nothing when it
 * cannot be resolved — a named destination the document does not define, or a
 * reference to a page that is not there. One unusable bookmark is not the
 * whole outline.
 */
async function startOfDestination(
	pdf: PDFDocumentProxy,
	dest: string | unknown[] | null
): Promise<{ pageNumber: number; top: number } | null> {
	if (!dest) return null;

	try {
		const destination =
			typeof dest === "string"
				? ((await pdf.getDestination(dest)) as unknown[] | null)
				: dest;
		if (!destination || destination.length === 0) return null;

		// Usually a reference to the page; some writers put its index there.
		const target = destination[0];
		const pageIndex = isPageReference(target)
			? await pdf.getPageIndex(target)
			: typeof target === "number"
				? target
				: null;
		if (pageIndex === null) return null;

		const at = TOP_IN_DESTINATION[destinationKind(destination)];
		const top = at === undefined ? undefined : destination[at];

		return {
			pageNumber: pageIndex + 1,
			// A destination may leave any of its arguments null, which means
			// "whatever the view already shows" — no height of its own either.
			top: typeof top === "number" ? top : Infinity,
		};
	} catch (error) {
		console.error(error);
		return null;
	}
}

/**
 * A heading as a folder may be named after it. A slash would open a folder of
 * its own, and the nesting of the outline is what says which folder holds
 * which — so the title keeps none of its own.
 */
function sectionName(title: string): string {
	return typeof title === "string"
		? title.replace(/[\\/]+/g, " ").replace(/\s+/g, " ").trim()
		: "";
}

/** Bookmarks whose destinations are resolved at once. */
const BOOKMARKS_AT_ONCE = 32;

/**
 * The PDF's own outline, flattened into the sections it names and sorted into
 * document order: down the pages, and down each page.
 *
 * A bookmark keeps its ancestors, so a section is the whole path to it. One
 * that names nothing to jump to still passes its title down to the bookmarks
 * beneath it — that is a heading over a part of the document, not a place in
 * it.
 */
export async function readSections(
	pdf: PDFDocumentProxy
): Promise<PDFSection[]> {
	// Typed as an array by pdf.js and null in a document that has no outline,
	// which is most of them.
	const outline = (await pdf.getOutline()) as RawPDFOutlineItem[] | null;
	if (!outline || outline.length === 0) return [];

	// The outline is flattened first and its destinations resolved after,
	// rather than walked a bookmark at a time. Resolving one is a round trip to
	// the pdf.js worker — two, for a named destination — and a document with a
	// long outline makes a great many of them; waiting for each before asking
	// for the next is most of what reading an outline costs. Bookmarks naming
	// nothing to jump to are left out here: they only pass their title down.
	const bookmarks: { dest: string | unknown[] | null; path: string[] }[] = [];
	const visit = (items: RawPDFOutlineItem[], ancestors: string[]): void => {
		for (const item of items) {
			const name = sectionName(item.title);
			const path = name ? [...ancestors, name] : ancestors;

			if (path.length > 0) bookmarks.push({ dest: item.dest, path });
			if (item.items?.length) visit(item.items, path);
		}
	};
	visit(outline, []);

	// Asked for a batch at a time rather than all at once, so an outline of a
	// few thousand bookmarks does not put that many messages on the worker in
	// one go.
	const sections: PDFSection[] = [];
	for (let first = 0; first < bookmarks.length; first += BOOKMARKS_AT_ONCE) {
		const batch = bookmarks.slice(first, first + BOOKMARKS_AT_ONCE);
		const starts = await Promise.all(
			batch.map((bookmark) => startOfDestination(pdf, bookmark.dest))
		);
		starts.forEach((start, at) => {
			if (start) sections.push({ ...start, path: batch[at].path });
		});
	}

	sections.sort((one, other) => {
		if (one.pageNumber !== other.pageNumber) {
			return one.pageNumber - other.pageNumber;
		}
		// Down the page, so the higher of the two comes first. Compared rather
		// than subtracted: two sections at the top of one page are both at
		// Infinity, and the difference of those is not a number.
		if (one.top === other.top) return 0;
		return one.top > other.top ? -1 : 1;
	});
	return sections;
}

/**
 * The section an annotation falls in: the last one beginning at or above it.
 * Nothing for an annotation standing before the first heading — a title page
 * belongs to no section of the document.
 */
export function sectionAt(
	sections: PDFSection[],
	pageNumber: number,
	top: number
): string[] | undefined {
	// In document order, so the sections beginning at or above the annotation
	// are a run of them from the start and the first one past it ends that run.
	// Where the run ends is found by halving: an annotated document asks this
	// once per annotation, against every heading the document has.
	let low = 0;
	let high = sections.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		const section = sections[mid];
		const atOrAbove =
			section.pageNumber < pageNumber ||
			(section.pageNumber === pageNumber && section.top >= top);
		if (atOrAbove) low = mid + 1;
		else high = mid;
	}
	return low > 0 ? sections[low - 1].path : undefined;
}

/** One page's text, ready for the quads standing on it to be read off. */
interface PageText {
	/** The items, down the page and left to right along each line. */
	items: PositionedText[];
	/** `transform[5]` of each item, in the same order — largest first. */
	tops: Float64Array;
	/**
	 * How far apart the page's lines stand, where enough of them say — what a
	 * highlight measures its own gaps against to find its paragraphs. Read once
	 * for the page rather than once per annotation standing on it.
	 */
	pitch?: number;
}

/**
 * The page's text in reading order, with the baselines lifted out beside it.
 * The two are built together and nowhere else because they have to agree:
 * finding the lines a quad covers is a search through `tops`, and an order
 * those no longer describe would quietly read the wrong text.
 */
function readingOrderText(
	content: TextContent,
	fontNames?: Map<string, string>
): PageText {
	// TextContent also carries marked-content markers, which have no position.
	const items: PositionedText[] = content.items.filter(
		(item): item is TextItem => "str" in item
	);

	// pdf.js names an item's font with an id of its own making. Swapped here
	// for the font's real name, which is the only thing that says the text is
	// set in a pre-Unicode font — nothing else in the file does.
	if (fontNames) {
		for (const item of items) {
			const name = item.fontName && fontNames.get(item.fontName);
			if (name) item.fontName = name;
		}
	}

	items.sort(function (a1: PositionedText, a2: PositionedText) {
		if (a1.transform[5] > a2.transform[5]) return -1; // y coord. descending
		if (a1.transform[5] < a2.transform[5]) return 1;
		if (a1.transform[4] > a2.transform[4]) return 1; // x coord. ascending
		if (a1.transform[4] < a2.transform[4]) return -1;
		return 0;
	});

	const tops = new Float64Array(items.length);
	for (let at = 0; at < items.length; at++) tops[at] = items[at].transform[5];
	return { items, tops, pitch: pageLinePitch(tops) };
}

/**
 * The real name of every font the page's text is set in, by the id pdf.js gives
 * it in `TextItem.fontName`.
 *
 * The names are nowhere in the text pdf.js reports — only in the render list,
 * which is a second parse of the page's content stream, and about as expensive
 * as reading the text was. It is paid for only on a page that carries a markup
 * annotation, and only because a pre-Unicode font announces itself in no other
 * way: its text arrives as ordinary Latin, and the font's name is the whole of
 * the evidence that it is not.
 *
 * It is usually paid once for the document rather than once per page. The font
 * store is the document's, not the page's, so a font another page has already
 * had resolved is answered from it — and a book sets its pages in the same few
 * fonts, so after the first annotated page there is normally nothing left to
 * build a render list for.
 *
 * A page whose render list cannot be built is not a page that fails: its text
 * is read as it stands, which is what happens for every ordinary font anyway.
 */
async function fontNamesOfPage(
	page: PDFPageProxy,
	content: TextContent
): Promise<Map<string, string>> {
	const ids = new Set<string>();
	for (const item of content.items) {
		if ("str" in item && item.fontName) ids.add(item.fontName);
	}

	const names = new Map<string, string>();
	if (ids.size === 0) return names;

	let built = false;
	for (const id of ids) {
		if (!built && !page.commonObjs.has(id)) {
			try {
				await page.getOperatorList();
			} catch (error) {
				console.error(error);
				return names;
			}
			built = true;
		}
		try {
			const font = page.commonObjs.get(id) as { name?: string } | null;
			if (font?.name) names.set(id, baseFontName(font.name));
		} catch {
			// A font the render list did not resolve. Its text stays as it is.
		}
	}
	return names;
}

/** One page's wanted annotations, in the order the page carries them. */
async function loadPage(
	page: PDFPageProxy,
	pagenum: number,
	pageLabel: string,
	file: PDFFile,
	containingFolder: string,
	desiredAnnotations: Set<string>,
	sections: PDFSection[]
): Promise<PDFAnnotation[]> {
	const rawAnnotations = (await page.getAnnotations()) as RawPDFAnnotation[];

	const annotations = rawAnnotations.filter((anno) =>
		desiredAnnotations.has(anno.subtype)
	);
	if (annotations.length === 0) return [];

	// Reading a page's text means parsing its whole content stream, which is by
	// far the most expensive thing done to a PDF here — and nothing that needs
	// doing unless something on the page marks text up, which most pages of
	// most documents do not. A markup annotation pdf.js found no usable
	// QuadPoints on reads nothing either, so it does not ask for the page.
	const marksUpSomething = annotations.some(
		(anno) =>
			ANNOTS_TREATED_AS_HIGHLIGHTS.includes(anno.subtype) &&
			anno.quadPoints
	);
	// pdf.js normalizes whitespace by default since v3.
	let text: PageText | null = null;
	if (marksUpSomething) {
		const content = await page.getTextContent();
		text = readingOrderText(content, await fontNamesOfPage(page, content));
	}

	const total: PDFAnnotation[] = [];
	for (const raw of annotations) {
		// Decides both what is read off the page under the annotation and how
		// its colour is read, so it is settled once before either.
		const marksUpText = ANNOTS_TREATED_AS_HIGHLIGHTS.includes(raw.subtype);

		const anno: PDFAnnotation = {
			...raw,
			folder: containingFolder,
			file: file,
			filepath: file.path, // we need a direct string property in the templates
			pageNumber: pagenum,
			pageLabel: pageLabel, // Real page number defined by author
			author: raw.titleObj.str,
			body: raw.contentsObj.str,
			created: pdfDateToDay(raw.creationDate),
			createdTime: pdfDateToTime(raw.creationDate),
			colorHex: annotationColor(raw.color, marksUpText),
		};

		if (marksUpText) {
			// No text was asked for only when nothing here could have read any.
			anno.highlightedText = text
				? extractHighlight(anno, text.items, text.tops, text.pitch)
				: "";
		}

		if (sections.length > 0) {
			// The top of the annotation, whichever corner the rectangle names
			// first: a section starting between its top and its bottom is one
			// the annotation has already begun before.
			anno.section = sectionAt(
				sections,
				pagenum,
				Math.max(raw.rect[1], raw.rect[3])
			);
		}

		// Nothing a note could show, so nothing worth a blank entry.
		if (!anno.body.trim() && !anno.highlightedText?.trim()) continue;

		total.push(anno);
	}
	return total;
}

/**
 * Pages read at once. Every page costs at least two round trips to the pdf.js
 * worker before anything can be made of it, and read one at a time the worker
 * sits idle across each of them. Kept small deliberately: reading a folder
 * already runs its PDFs side by side, and the two multiply.
 */
const PAGES_AT_ONCE = 4;

/**
 * `withSections` reads the PDF's own outline and tells each annotation which
 * section of the document it falls in. Asked for rather than always done: it
 * resolves the destination of every bookmark, which a document with a long
 * outline makes a great many of, and nothing needs the answer unless the notes
 * are to be filed by section.
 *
 * `onPage` is told as each page is read. The pages are the only part of an
 * extraction whose length is known in advance, so they are what a bar watching
 * this can fill.
 */
export async function loadPDFFile(
	file: PDFFile,
	pdfjsLib: PDFJsLib,
	containingFolder: string,
	total: PDFAnnotation[],
	desiredAnnotations: string[],
	withSections = false,
	onPage?: ProgressReport
) {
	const pdf: PDFDocumentProxy = await pdfjsLib.getDocument(file.content)
		.promise;
	const sections = withSections ? await readSections(pdf) : [];
	const pageLabels = await pdf.getPageLabels();
	// Asked once per annotation of every page, so not a list to search.
	const desired = new Set(desiredAnnotations);

	const readPage = async (pagenum: number): Promise<PDFAnnotation[]> => {
		const page = await pdf.getPage(pagenum);
		// The real page number, as the author labelled it, where there is one.
		const pageLabel = pageLabels?.[pagenum - 1] || pagenum.toString();
		return loadPage(
			page,
			pagenum,
			pageLabel,
			file,
			containingFolder,
			desired,
			sections
		);
	};

	for (let first = 1; first <= pdf.numPages; first += PAGES_AT_ONCE) {
		const last = Math.min(first + PAGES_AT_ONCE - 1, pdf.numPages);
		const reading: Promise<PDFAnnotation[]>[] = [];
		for (let pagenum = first; pagenum <= last; pagenum++) {
			reading.push(readPage(pagenum));
		}
		const read = await Promise.all(reading);

		// Collected page by page rather than as each read finishes, so the
		// annotations come out in the order of the document however the reads
		// happened to interleave — and so does what `onPage` is told. After the
		// page rather than before it, so what is reported is what has been read
		// and not what is about to be.
		for (let at = 0; at < read.length; at++) {
			for (const anno of read[at]) total.push(anno);
			onPage?.(first + at, pdf.numPages);
		}
	}
}

const WIDE_LETTERS = ['w', 'm', 'W', 'M', 'D', 'O', 'Q', 'G', 'S', 'B', 'C', 'P', 'E', 'R', 'A', 'N', 'U', 'V', 'X', 'Y', 'Z', 'K', 'H'];
const SLIM_LETTERS = ['i', 'r', 'l', 't', 'f', 'j', 'I', '1', '.', ',', '(', ')', '"', '\''];

// Greek, by the same rule the Latin lists follow: the capitals stand as wide as
// Latin capitals, iota is the stroke that I is, and omega, mu, phi and psi are
// the wide lowercase letters that w and m are. The rest of the alphabet is
// close enough to the average to be left at it.
const WIDE_GREEK = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ', 'Κ', 'Λ', 'Μ', 'Ν', 'Ξ', 'Ο', 'Π', 'Ρ', 'Σ', 'Τ', 'Υ', 'Φ', 'Χ', 'Ψ', 'Ω', 'ω', 'μ', 'φ', 'ψ'];
const SLIM_GREEK = ['Ι', 'Ί', 'Ϊ', 'ι', 'ί', 'ϊ', 'ΐ'];

// Hebrew has no capitals and most of its letters fill the same square, so only
// the ones written as a single stroke are called out.
const SLIM_HEBREW = ['ו', 'ז', 'י', 'ן', '׳'];

// Arabic is shaped by what a letter joins to, so most of its widths depend on
// where in the word the letter falls and there is no one weight to give them.
// Named here are only those that keep their width throughout: alef and hamza
// are an upright and a hook in every position, and sin, shin, sad and dad carry
// their teeth or their loop in all of them.
const SLIM_ARABIC = ['ا', 'أ', 'إ', 'آ', 'ٱ', 'ء'];
const WIDE_ARABIC = ['س', 'ش', 'ص', 'ض'];

// Glyph width relative to the average for the text item, as the highlight
// rectangles of a proportional font imply.
const WIDE_LETTER_WEIGHT = 1.75;
const SLIM_LETTER_WEIGHT = 0.6;
const NORMAL_LETTER_WEIGHT = 1;
/** What a character drawn over another one, or not drawn at all, takes up. */
const ZERO_ADVANCE_WEIGHT = 0;

// The lists above, turned round: looked up once per character of every text
// item under every quad, which is the innermost the reading gets.
const LETTER_WEIGHTS = new Map<string, number>();
for (const letter of [...WIDE_LETTERS, ...WIDE_GREEK, ...WIDE_ARABIC]) {
	LETTER_WEIGHTS.set(letter, WIDE_LETTER_WEIGHT);
}
for (const letter of [...SLIM_LETTERS, ...SLIM_GREEK, ...SLIM_HEBREW, ...SLIM_ARABIC]) {
	LETTER_WEIGHTS.set(letter, SLIM_LETTER_WEIGHT);
}

/**
 * Characters taking up no width of their own: the marks a script writes its
 * accents and vowels with — Greek's breathings and accents, Hebrew's niqqud and
 * cantillation, Arabic's harakat — the invisible characters that join and order
 * text, and the trailing half of a surrogate pair.
 *
 * Every one of them is drawn over, under or inside the character before it, or
 * not drawn at all. Counted as characters of their own each would take a share
 * of the item's width, and a fully pointed Hebrew word is more mark than letter
 * — so every border after the first one would be in the wrong place, and the
 * text that came out would be a stretch of the word the reader never marked.
 */
const OVER_ANOTHER_CHARACTER = /[\p{Mn}\p{Me}\p{Cf}]/u;

function takesNoWidth(letter: string): boolean {
	const code = letter.charCodeAt(0);
	// The low half of a surrogate pair. The pair is one glyph and the high half
	// is the one given its width, which also keeps the two from being split.
	if (code >= 0xdc00 && code <= 0xdfff) return true;
	return OVER_ANOTHER_CHARACTER.test(letter);
}

function letterWeight(letter: string): number {
	const known = LETTER_WEIGHTS.get(letter);
	if (known !== undefined) return known;

	// Worked out once per character the documents actually hold and then kept
	// beside the listed letters: this is the innermost lookup the reading does,
	// and a Unicode property test per character of every text item under every
	// quad is not one to repeat.
	const weight = takesNoWidth(letter)
		? ZERO_ADVANCE_WEIGHT
		: NORMAL_LETTER_WEIGHT;
	LETTER_WEIGHTS.set(letter, weight);
	return weight;
}

/** Whether the character is drawn over the one before it — see `letterWeight`. */
function isZeroWidth(letter: string): boolean {
	return letterWeight(letter) === ZERO_ADVANCE_WEIGHT;
}

/**
 * What one character of a text item takes up, given the font's encoding.
 *
 * A pre-Unicode font's bytes are Latin characters standing for Greek or Hebrew
 * ones, so the Latin widths say nothing about them — `l` there is λ, which is
 * no narrower than its neighbours. The byte is weighed as what it draws, and
 * the font's own accents and points take no width at all.
 */
function byteWidth(letter: string, encoding?: LegacyEncoding): number {
	if (!encoding) return letterWeight(letter);
	if (encoding.marks.has(letter)) return ZERO_ADVANCE_WEIGHT;
	const drawn = encoding.table.get(letter);
	return letterWeight(drawn ? drawn[0] : letter);
}

/** Whether the character takes no width, given the font's encoding. */
function takesNoRoom(letter: string, encoding?: LegacyEncoding): boolean {
	return encoding ? encoding.marks.has(letter) : isZeroWidth(letter);
}

// pdf.js reports one width per text item, not per glyph. borders[i] is where
// the item's i-th glyph starts, the last entry where the item ends. Splitting
// the width evenly instead lands a single-character highlight on its neighbour.
//
// `order` is the item's characters in the order their glyphs are drawn, for an
// item running right to left; nothing where the two orders are the same.
function glyphBorders(
	str: string,
	itemStartX: number,
	itemWidth: number,
	order?: number[],
	encoding?: LegacyEncoding
): number[] {
	// Weighed in two passes over the string rather than into an array of its
	// own: the same additions in the same order, and nothing allocated for a
	// call made once per text item under every quad.
	let totalWeight = 0;
	for (let at = 0; at < str.length; at++) {
		totalWeight += byteWidth(str[at], encoding);
	}
	const borders = [itemStartX];
	if (totalWeight === 0) return borders;

	let position = itemStartX;
	for (let at = 0; at < str.length; at++) {
		const letter = order ? str[order[at]] : str[at];
		position += (byteWidth(letter, encoding) * itemWidth) / totalWeight;
		borders.push(position);
	}
	return borders;
}

/**
 * What the glyphs between two borders spell, in the order the text is written
 * rather than the order it is drawn. `order` is the item's characters left to
 * right, for one running right to left; nothing for the ordinary case.
 *
 * Taken as the span from the first character the glyphs cover to the last, so a
 * right-to-left line comes out as a stretch of what it says even where a Latin
 * word or a year inside it is drawn the other way round.
 *
 * A character drawn over another one goes with the character it is drawn over:
 * the border between the two is no width at all, so which side of it the snap
 * lands on is a coin toss, and losing it would strip a Greek word of its accents
 * or leave a Hebrew one opening on a vowel point belonging to the letter before.
 */
function glyphSlice(
	str: string,
	from: number,
	to: number,
	order?: number[],
	encoding?: LegacyEncoding
): string {
	if (to <= from) return "";

	let start: number;
	let end: number;
	if (order) {
		start = order[from];
		end = start;
		for (let at = from + 1; at < to; at++) {
			const index = order[at];
			if (index < start) start = index;
			if (index > end) end = index;
		}
		end += 1;
	} else {
		start = from;
		end = to;
	}

	while (end < str.length && takesNoRoom(str[end], encoding)) end++;
	while (start < end && takesNoRoom(str[start], encoding)) start++;

	return start < end ? str.substring(start, end) : "";
}

/** Index of the glyph border closest to `x`. */
function nearestBorder(borders: number[], x: number): number {
	let nearest = 0;
	for (let i = 1; i < borders.length; i++) {
		if (Math.abs(borders[i] - x) < Math.abs(borders[nearest] - x)) {
			nearest = i;
		}
	}
	return nearest;
}

