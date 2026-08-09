import {
	compile as compileTemplate,
	TemplateDelegate as Template,
} from "handlebars";
import { t } from "../lang/helpers";
import {
	ParagraphSeparation,
	PDFAnnotationPluginSetting,
	templateForAnnotation,
} from "./settings";
import { PARAGRAPH_BREAK } from "./extractHighlight";
import { PDFAnnotation } from "./types";

/** What each way of separating paragraphs writes between two of them. */
const PARAGRAPH_SEPARATOR: Record<ParagraphSeparation, string> = {
	blank: PARAGRAPH_BREAK,
	break: "\n",
	none: " ",
};

/**
 * The marked up text as the note is to show it. The extraction writes the
 * paragraphs it found a blank line apart, which is what a reader wanting them
 * as paragraphs wants; the other two answers are for a template that cannot
 * take one — a blockquote ends at a blank line, and a table row at any line
 * break at all.
 */
export function separateParagraphs(
	text: string | undefined,
	separation: ParagraphSeparation
): string | undefined {
	if (!text || separation === "blank") return text;
	return text.split(PARAGRAPH_BREAK).join(PARAGRAPH_SEPARATOR[separation]);
}

/**
 * The `#` prefix for each heading, outermost first. A heading that is not
 * written takes no level with it, so the note keeps an unbroken outline.
 */
export function headingLevels(written: boolean[]): string[] {
	let depth = 0;
	return written.map((isWritten) =>
		isWritten ? "#".repeat(++depth) : ""
	);
}

/** The deepest heading markdown has; a seventh `#` heads nothing. */
const MAX_HEADING_LEVEL = 6;

/**
 * A fence opening or closing a code block. A `#` inside one is a comment in
 * whatever the block is written in, and no heading of the note's.
 */
const CODE_FENCE = /^ {0,3}(?:```|~~~)/;

/**
 * A heading and the `#`s that set its level. Three spaces of indent still make
 * one; what tells a heading from a `#tag` is the space after the last `#`, or
 * the end of the line — a heading with nothing under it is still a heading.
 *
 * Matched at the start of the line only. A `#` behind a `> ` heads a quotation,
 * and a quotation in these notes is most often the marked text this plugin put
 * there: the book's own words are not the note's outline, and moving them would
 * change what the page says.
 */
const ATX_HEADING = /^( {0,3})(#{1,6})(?=\s|$)/;

/**
 * Every line ending a PDF may have written a comment with, captured so that it
 * survives the split. The headings a reader types into a comment arrive here
 * through `{{body}}` — and a PDF reader ends the lines of a comment with a bare
 * `\r` as readily as with a `\n`, so a note split on `\n` alone has the whole
 * comment as one line and every heading past its first invisible.
 *
 * `topics.ts` reads the same four endings off the first line of a comment. This
 * one keeps them where that one replaces them: nothing but the `#`s of a heading
 * is to change, so what a comment came in as is what it goes out as.
 */
const LINE_BREAK = /(\r\n|\n\r|\n|\r)/;

/**
 * The lines of `text` and the endings between them, in one list: the lines at
 * the even places, the ending that follows each at the odd one after it. Joined
 * back with nothing, the pieces are the text again, character for character.
 */
function piecesOf(text: string): string[] {
	return text.split(LINE_BREAK);
}

/**
 * Which of `pieces` are headings, and the level each is written at. Indexes into
 * the list `piecesOf` returned, so the line endings between them are stepped
 * over rather than read as lines of their own.
 */
function headingsOf(pieces: string[]): { at: number; level: number }[] {
	const found: { at: number; level: number }[] = [];
	let fenced = false;

	for (let at = 0; at < pieces.length; at += 2) {
		const line = pieces[at];
		if (CODE_FENCE.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;

		const heading = ATX_HEADING.exec(line);
		// The pattern has both groups or it did not match; the fallback is for
		// the type only.
		if (heading) found.push({ at, level: (heading[2] ?? "").length });
	}
	return found;
}

/**
 * The words of a heading a reader wrote as one, with the `#`s taken off. A topic
 * is the first line of a comment, so a reader who writes that line as a heading
 * hands the marks over as part of it — and the heading it is written as already
 * carries a level of its own, which `# ## Notes` would only be read as the text
 * of.
 */
function withoutHeadingMarks(name: string): string {
	return name.replace(ATX_HEADING, "").trimStart();
}

/**
 * How far the note's own headings have to move for the shallowest of them to
 * stand one level under `under`, which is the deepest group heading the note
 * was given. Negative where they are written deeper than they need to be, so a
 * template of `###` headings heads the note itself when nothing groups above
 * it; zero when there is no heading to move.
 *
 * One shift for the whole note rather than one per annotation: what the
 * headings say about each other is the reader's own structure, and only where
 * it begins is this setting's business.
 */
export function nestingShift(texts: string[], under: number): number {
	const levels = texts.flatMap((text) =>
		headingsOf(piecesOf(text)).map(({ level }) => level)
	);
	if (levels.length === 0) return 0;
	return under + 1 - Math.min(...levels);
}

/**
 * `text` with every heading in it moved `by` levels, the `#`s rewritten and the
 * rest of the line left as it stands.
 *
 * Held to the six levels markdown has: a heading pushed past the sixth would
 * stop being a heading at all, so it stops at the sixth instead. Two levels of
 * the reader's own can meet there, which is the one thing this cannot keep —
 * markdown has nowhere deeper to put them.
 */
export function shiftHeadings(text: string, by: number): string {
	if (by === 0) return text;

	const pieces = piecesOf(text);
	for (const { at, level } of headingsOf(pieces)) {
		const moved = Math.min(
			Math.max(level + by, 1),
			MAX_HEADING_LEVEL
		);
		// The line, not the level: everything after the `#`s is untouched.
		pieces[at] = pieces[at].replace(
			ATX_HEADING,
			(_, indent: string) => `${indent}${"#".repeat(moved)}`
		);
	}
	return pieces.join("");
}

export class PDFAnnotationPluginFormatter {
	private settings: PDFAnnotationPluginSetting;

	private templateSettings = {
		noEscape: true,
	};

	constructor(settings: PDFAnnotationPluginSetting) {
		this.settings = settings;
	}

	/**
	 * `onePerNote` for the notes holding a single annotation: the headings that
	 * group have nothing to group there, so only the topic heading is written —
	 * a topic is what the annotation is about, not where it came from.
	 */
	format(
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean,
		onePerNote = false
	): string {
		let folder = "";
		let file = "";
		let date = "";
		let topic = "";

		// A PDF in the vault root has no folder to name.
		const folderFor = (anno: PDFAnnotation) =>
			anno.folder || t.NOTE_VAULT_ROOT;
		const dateFor = (anno: PDFAnnotation) => anno.created || t.NOTE_NO_DATE;

		// A new group restarts the headings under it, so a day read from
		// several files says which each annotation came from. A heading with
		// only one thing to say is not restarted, or it would repeat down the
		// whole note.
		const fileVaries = new Set(grandtotal.map((a) => a.file.name)).size > 1;
		const dateVaries = new Set(grandtotal.map(dateFor)).size > 1;
		const topicVaries = new Set(grandtotal.map((a) => a.topic)).size > 1;

		// Nothing to head a group with unless the annotations were gathered
		// into one: ungrouped they interleave, and a heading naming one group
		// would stand above annotations belonging to another. A note holding a
		// single annotation has nothing gathered at all — except the topic,
		// which says what it is about rather than where it came from.
		const headingFolders =
			this.settings.folderHeading &&
			this.settings.groupByFolder &&
			!onePerNote;
		const headingFiles =
			this.settings.fileHeading &&
			this.settings.groupByFile &&
			!onePerNote;
		const headingDates =
			this.settings.dateHeading &&
			this.settings.groupByDate &&
			!onePerNote;
		const headingTopics =
			this.settings.topicHeading && this.settings.sortByTopic;

		// Whichever heading encloses the others takes the first level, and the
		// rest follow the order the annotations were grouped in.
		const [folderLevel, fileLevel, dateLevel, topicLevel] = headingLevels([
			headingFolders,
			headingFiles,
			headingDates,
			headingTopics,
		]);

		/** Each annotation's own headings, and the annotation as written. */
		const entries: { headings: string; content: string }[] = [];
		/**
		 * The deepest group heading this note was actually given, which is not
		 * always the deepest one the settings reserve a level for: a heading
		 * saying what it said the line before is not written again, and the
		 * topic is left out entirely when it has gone to the note's name.
		 */
		let deepest = 0;

		grandtotal.forEach((anno) => {
			let headings = "";
			const head = (level: string, name: string) => {
				headings += `${level} ${name}\n\n`;
				deepest = Math.max(deepest, level.length);
			};

			if (headingFolders) {
				if (folder != folderFor(anno)) {
					folder = folderFor(anno);
					if (fileVaries) file = "";
					if (dateVaries) date = "";
					if (topicVaries) topic = "";
					head(folderLevel, folder);
				}
			}

			if (headingFiles) {
				if (file != anno.file.name) {
					file = anno.file.name;
					if (dateVaries) date = "";
					if (topicVaries) topic = "";
					head(fileLevel, file);
				}
			}

			if (headingDates) {
				if (date != dateFor(anno)) {
					date = dateFor(anno);
					if (topicVaries) topic = "";
					head(dateLevel, date);
				}
			}

			if (headingTopics) {
				if (topic != anno.topic) {
					topic = anno.topic;
					// A comment headed by its first line has handed the `#`s
					// over as part of the topic, and the heading written from it
					// takes its level from the groupings instead.
					head(
						topicLevel,
						this.settings.nestContentHeadings
							? withoutHeadingMarks(topic)
							: topic
					);
				}
			}

			entries.push({
				headings,
				content: this.getContentFor(anno, isExternalFile),
			});
		});

		if (grandtotal.length == 0) return t.NOTE_NO_ANNOTATIONS;

		// Rendered before a line of the note is joined up, because how far the
		// headings inside them move is a question about all of them at once.
		const shift = this.settings.nestContentHeadings
			? nestingShift(
					entries.map(({ content }) => content),
					deepest
				)
			: 0;

		return entries
			.map(({ headings, content }) => headings + shiftHeadings(content, shift))
			.join("");
	}

	/** The template of this annotation's type, or the default. */
	templateFor(annotation: PDFAnnotation): Template {
		return compileTemplate(
			templateForAnnotation(this.settings, annotation.subtype),
			this.templateSettings
		);
	}

	getTemplateVariablesForAnnotation(
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): Record<string, unknown> {
		const shortcuts = {
			highlightedText: separateParagraphs(
				annotation.highlightedText,
				this.settings.paragraphSeparation
			),
			folder: annotation.folder,
			filename: annotation.file.basename,
			filepath: annotation.filepath,
			// One template, both locations: a wiki link inside the vault, a
			// file:// URL outside it.
			filelink: isExternalFile
				? annotation.filepath
				: `[[${annotation.filepath}]]`,
			isExternal: isExternalFile,
			pageNumber: annotation.pageNumber,
			pageLabel: annotation.pageLabel,
			author: annotation.author,
			body: annotation.body,
			// As pdf.js names it, which a {{#if}} can be written against.
			type: annotation.subtype,
			// `#rrggbb`, and empty for an annotation the PDF gives no colour,
			// which `{{#if color}}` tells apart. What a colour means is the
			// reader's own and no palette this plugin could ship.
			color: annotation.colorHex,
			topic: annotation.topic,
			// The day and the time of day apart, so a template can write either
			// without the other. The PDF's own timestamp, down to the second,
			// stays on `annotation.creationDate` in the shape the file wrote it.
			created: annotation.created,
			createdTime: annotation.createdTime,
		};

		return { annotation: annotation, ...shortcuts };
	}

	getContentFor(annotation: PDFAnnotation, isExternalFile: boolean): string {
		return this.templateFor(annotation)(
			this.getTemplateVariablesForAnnotation(annotation, isExternalFile)
		);
	}
}
