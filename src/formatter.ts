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
		let text = "";
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

		grandtotal.forEach((anno) => {
			if (headingFolders) {
				if (folder != folderFor(anno)) {
					folder = folderFor(anno);
					if (fileVaries) file = "";
					if (dateVaries) date = "";
					if (topicVaries) topic = "";
					text += `${folderLevel} ${folder}\n\n`;
				}
			}

			if (headingFiles) {
				if (file != anno.file.name) {
					file = anno.file.name;
					if (dateVaries) date = "";
					if (topicVaries) topic = "";
					text += `${fileLevel} ${file}\n\n`;
				}
			}

			if (headingDates) {
				if (date != dateFor(anno)) {
					date = dateFor(anno);
					if (topicVaries) topic = "";
					text += `${dateLevel} ${date}\n\n`;
				}
			}

			if (headingTopics) {
				if (topic != anno.topic) {
					topic = anno.topic;
					text += `${topicLevel} ${topic}\n\n`;
				}
			}

			text += this.getContentFor(anno, isExternalFile);
		});

		if (grandtotal.length == 0) return t.NOTE_NO_ANNOTATIONS;
		else return text;
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
