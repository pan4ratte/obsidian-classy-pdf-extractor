import {
	AbstractInputSuggest,
	AbstractTextComponent,
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	setIcon,
	Setting,
	SettingDefinitionItem,
	SettingDefinitionRender,
	setTooltip,
	TextAreaComponent,
	ToggleComponent,
} from "obsidian";
import { t } from "lang/helpers";
import PDFAnnotationPlugin from "src/main";
import { createCollapsible } from "src/collapsible";
import { asIndexable } from "src/types";

// The variable names are the interface — what a template types — so they live
// here; only their descriptions are translated. The whole annotation is
// available as {{annotation}} too, for fields that have no shortcut of their own.
export const TEMPLATE_VARIABLES: Record<string, string> = {
	highlightedText: t.VAR_HIGHLIGHTED_TEXT,
	folder: t.VAR_FOLDER,
	filename: t.VAR_FILENAME,
	filepath: t.VAR_FILEPATH,
	filelink: t.VAR_FILELINK,
	pageNumber: t.VAR_PAGE_NUMBER,
	pageLabel: t.VAR_PAGE_LABEL,
	author: t.VAR_AUTHOR,
	body: t.VAR_BODY,
	type: t.VAR_TYPE,
	color: t.VAR_COLOR,
	topic: t.VAR_TOPIC,
	created: t.VAR_CREATED,
	createdTime: t.VAR_CREATED_TIME,
	isExternal: t.VAR_IS_EXTERNAL,
};

export interface SupportedAnnotation {
	/** PDF annotation subtype, as reported by pdf.js. */
	subtype: string;
	description: string;
	/**
	 * True for the text markup types, which carry QuadPoints: the PDF text
	 * under them is extracted into {{highlightedText}}. The rest contribute
	 * only their own comment.
	 */
	marksUpText?: boolean;
	/** Part of the default selection. */
	desiredByDefault?: boolean;
}

// The types carrying text a note can show: the PDF text they mark up, or text
// the reader typed. The graphical types (Ink, Square, Stamp, …) are left out on
// purpose — their content is a drawing and their Contents is usually empty, so
// extracting them yields blank entries. Link, Widget and Popup are not the
// reader's annotations at all.
export const SUPPORTED_ANNOTS: SupportedAnnotation[] = [
	{
		subtype: "Highlight",
		description: t.ANNOT_HIGHLIGHT,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Underline",
		description: t.ANNOT_UNDERLINE,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Squiggly",
		description: t.ANNOT_SQUIGGLY,
		marksUpText: true,
	},
	{
		subtype: "StrikeOut",
		description: t.ANNOT_STRIKEOUT,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Text",
		description: t.ANNOT_TEXT,
	},
	{ subtype: "FreeText", description: t.ANNOT_FREE_TEXT },
];

export const ANNOTS_TREATED_AS_HIGHLIGHTS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.marksUpText
).map((annotation) => annotation.subtype);

/**
 * The template picker's entry for the template every annotation type falls back
 * on. Not a subtype, so it cannot collide with one.
 */
export const DEFAULT_TEMPLATE_KEY = "default";

/**
 * Nothing to begin with, so `defaultTemplate` covers every type. It carries a
 * `{{highlightedText}}` of its own, which renders empty for the types that mark
 * up nothing, so none of them needs a template to start on.
 */
export function defaultAnnotationTemplates(): Record<string, string> {
	// The pairs are annotated as tuples: an array literal widens to `string[]`,
	// which `Object.fromEntries` answers with its `any`-returning overload
	// rather than the typed one.
	return Object.fromEntries(
		SUPPORTED_ANNOTS.map(({ subtype }): [string, string] => [subtype, ""])
	);
}

/**
 * This type's own template, or the default. Blank counts as none, so clearing
 * one hands the type back to the default rather than writing nothing.
 */
export function templateForAnnotation(
	settings: PDFAnnotationPluginSetting,
	subtype: string
): string {
	const own = settings.annotationTemplates?.[subtype] ?? "";
	return own.trim().length > 0 ? own : settings.defaultTemplate;
}

/**
 * The variables this type leaves empty however a template asks for them, and
 * the type's own name to say so with. Only the text markup types carry the PDF
 * text under them; a sticky note and free text bring nothing but what the
 * reader typed into them.
 *
 * The default template is written for every type at once and deliberately asks
 * for more than any one of them answers, so it is held to none of their
 * limits: `DEFAULT_TEMPLATE_KEY` is no subtype and finds nothing here.
 */
export function unfilledVariablesFor(subtype: string): {
	names: string[];
	description: string;
} {
	const annot = SUPPORTED_ANNOTS.find((one) => one.subtype === subtype);
	if (!annot || annot.marksUpText) return { names: [], description: "" };
	return { names: ["highlightedText"], description: annot.description };
}

/**
 * Where any of `names` is written in `template`, in the order it appears.
 * Handlebars ignores whitespace inside the braces, so `{{ topic }}` names the
 * same variable as `{{topic}}` and is found here too. A name that is the start
 * of a longer one does not stand in for it: the braces have to close on it.
 */
export function findVariableUses(
	template: string,
	names: string[]
): { start: number; end: number; text: string; name: string }[] {
	if (names.length === 0) return [];

	const pattern = new RegExp(`\\{\\{\\s*(${names.join("|")})\\s*\\}\\}`, "g");
	return Array.from(
		template.matchAll(pattern),
		(match: RegExpMatchArray) => {
			const start = match.index ?? 0;
			const text = match[0];
			return {
				start,
				end: start + text.length,
				text,
				// The pattern has one group and it matched, or there would be
				// no match to be here for; the fallback is for the type only.
				name: match[1] ?? "",
			};
		}
	);
}

export const DEFAULT_DESIRED_ANNOTATIONS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.desiredByDefault
).map((annotation) => annotation.subtype);

/**
 * Which extractions move the tags in the comments to the note's properties. The
 * two kinds differ in what a tag means: on one note holding every annotation it
 * is the PDF's subject, on a note per annotation only that comment's. Inserting
 * into the note being edited counts as a single note.
 */
export const TAG_EXTRACTION_MODES = {
	never: t.OPTION_EXTRACT_TAGS_NEVER,
	always: t.OPTION_EXTRACT_TAGS_ALWAYS,
	single: t.OPTION_EXTRACT_TAGS_SINGLE,
	separate: t.OPTION_EXTRACT_TAGS_SEPARATE,
};

export type TagExtraction = keyof typeof TAG_EXTRACTION_MODES;

/**
 * What the paragraphs of one highlight are written apart with. The extraction
 * finds them either way — this is how the note shows them, which is a matter of
 * the templates around it: a blank line is a paragraph to Obsidian, a line
 * break keeps the text one paragraph, and a template that wraps the highlight
 * in a blockquote needs it to stay one.
 */
export const PARAGRAPH_SEPARATORS = {
	blank: t.OPTION_PARAGRAPHS_BLANK,
	break: t.OPTION_PARAGRAPHS_BREAK,
	none: t.OPTION_PARAGRAPHS_NONE,
};

export type ParagraphSeparation = keyof typeof PARAGRAPH_SEPARATORS;

/**
 * Where the notes go. `current` follows the file being looked at rather than
 * the PDF — the same folder when the PDF is open, and the only one there is
 * when the PDF lives outside the vault.
 */
export const NOTE_LOCATIONS = ["current", "vault"] as const;
export type NoteLocation = (typeof NOTE_LOCATIONS)[number];

/** Characters Obsidian will not take in a path, whatever a template renders. */
const ILLEGAL_PATH_CHARS = /[\\:*?"<>|]/g;

/**
 * A folder as a path can use it: no stray slashes, no characters Obsidian
 * rejects, every part trimmed. A nested path survives, an empty one stays empty.
 */
function cleanFolderPath(value: string): string {
	return value
		.replace(ILLEGAL_PATH_CHARS, "")
		.split("/")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join("/");
}

/**
 * Long enough for a `{{topic}}` sentence, short enough that the path around it
 * still fits. Counted in characters, not storage units, so no cut falls inside
 * one.
 */
const MAX_NOTE_NAME_LENGTH = 100;

/**
 * A note name a vault will take: rejected characters out, line breaks collapsed
 * to spaces, no leading dot (a note nobody sees) or trailing one. Empty when
 * nothing usable is left, for the caller to name instead.
 */
export function cleanNoteName(value: string): string {
	const collapsed = value
		.replace(ILLEGAL_PATH_CHARS, "")
		// A name is one path part: a slash in it would write the note somewhere
		// else, which is what the subfolder setting is for.
		.replace(/\//g, " ")
		.replace(/\s+/g, " ")
		.trim();
	// Spread rather than `slice`, which counts UTF-16 units and would cut an
	// emoji — or anything else written outside the basic plane — in half,
	// leaving a name no file system will take.
	const cut = [...collapsed].slice(0, MAX_NOTE_NAME_LENGTH).join("");

	return cut
		.replace(/^\.+/, "")
		.replace(/[. ]+$/, "")
		.trim();
}

/**
 * Where one note is written. `currentFolder` is the folder of the file being
 * looked at; `subfolder` arrives already rendered, and empty from every
 * extraction the subfolder does not apply to — which the caller decides, not
 * this.
 *
 * The subfolder goes under whichever of the two folders the notes are written
 * to: it is a setting of the extraction into separate notes, and that
 * extraction writes as many notes beside the current file as it does into a
 * folder of the vault.
 */
export function resolveNotePath(
	settings: PDFAnnotationPluginSetting,
	currentFolder: string,
	fileNameOfNote: string,
	subfolder = ""
): string {
	const base =
		settings.noteLocation === "current"
			? currentFolder
			: settings.noteFolder;

	const folder = [base, subfolder]
		.map(cleanFolderPath)
		.filter((part) => part.length > 0)
		.join("/");

	return folder ? `${folder}/${fileNameOfNote}` : fileNameOfNote;
}

const HANDLEBARS_DOCS = "https://handlebarsjs.com/guide/expressions.html";

/**
 * Rows of the variables table on screen at once; the rest are scrolled to. Six
 * is about as tall as the panel can be without pushing the templates it
 * describes off the screen.
 */
const VISIBLE_VARIABLE_ROWS = 6;

export class PDFAnnotationPluginSetting {
	/**
	 * The groupings, widest first: a folder holds the files, a file holds the
	 * days it was read on, a day holds the topics. `ordering.ts` applies them
	 * in this order and the headings nest in it.
	 */
	public groupByFolder: boolean;
	public groupByFile: boolean;
	public groupByDate: boolean;
	public sortByTopic: boolean;
	/**
	 * One heading per grouping, in the same order and each paired with the
	 * grouping it heads: a heading is written only where that grouping gathered
	 * the annotations under it, since ungrouped they interleave and the heading
	 * would repeat down the whole note instead of opening a group.
	 */
	public folderHeading: boolean;
	public fileHeading: boolean;
	public dateHeading: boolean;
	public topicHeading: boolean;
	public noteLocation: NoteLocation;
	/** Vault-relative folder the notes go in, empty for the vault root. */
	public noteFolder: string;
	/**
	 * Template for a folder under the notes' destination to put them in. Empty
	 * to put them straight into it. Applies to the extraction into separate
	 * notes only — see `resolveNotePath`.
	 */
	public noteSubfolder: string;
	/**
	 * File a note per annotation under the section of the PDF its annotation
	 * falls in, read from the document's own outline and nested as the outline
	 * nests. Goes under `noteSubfolder` when both are asked for.
	 */
	public subfolderPerSection: boolean;
	public noteName: string;
	public desiredAnnotations: string[];
	/** Written for every annotation type that has no template of its own. */
	public defaultTemplate: string;
	/**
	 * A template per annotation subtype, empty where the type has none of its
	 * own and is written with `defaultTemplate` instead.
	 */
	public annotationTemplates: Record<string, string>;
	public oneNotePerAnnotationName: string;
	/**
	 * Name a note per annotation after its topic instead of using
	 * `oneNotePerAnnotationName`, and leave the topic out of the note.
	 */
	public topicToNoteName: boolean;
	public overwriteExistingNote: boolean;
	public extractTags: TagExtraction;
	/** How `{{highlightedText}}` writes the paragraphs the extraction found. */
	public paragraphSeparation: ParagraphSeparation;

	constructor() {
		this.groupByFolder = false;
		// On: annotations from several PDFs read as one note per PDF, not as
		// every page four of them and then every page five. It costs nothing
		// on the single-file extraction, which has no second file to gather.
		this.groupByFile = true;
		// Off, so an upgrade does not reorder notes nobody asked to reorder.
		this.groupByDate = false;
		this.sortByTopic = true;
		// Both off: one PDF at a time is the usual extraction, and a heading
		// naming the one folder or the one file it came from says nothing the
		// reader did not already know.
		this.folderHeading = false;
		this.fileHeading = false;
		this.dateHeading = true;
		this.topicHeading = true;
		// A folder of the vault's own, which is somewhere whether or not
		// anything is open: an extraction from a path in the clipboard, run
		// from the command palette with no file in front of the reader, has
		// nowhere to go if the notes are to follow what is open. Empty until
		// a folder is named, which is the vault's root.
		this.noteLocation = "vault";
		this.noteFolder = "";
		this.noteSubfolder = "";
		// Off: it reads the PDF's outline on every extraction, and a document
		// without one would gain nothing for the reading.
		this.subfolderPerSection = false;
		this.noteName = t.DEFAULT_NOTE_NAME;
		this.desiredAnnotations = [...DEFAULT_DESIRED_ANNOTATIONS];
		this.defaultTemplate = t.DEFAULT_NOTE_TEMPLATE;
		this.annotationTemplates = defaultAnnotationTemplates();
		this.oneNotePerAnnotationName =
			t.DEFAULT_ONE_NOTE_NAME;
		// A note per annotation is worth finding by what it is about, and the
		// first line of the comment is what the reader wrote to say so.
		this.topicToNoteName = true;
		// A second extraction of the same PDF is nearly always a corrected
		// first one, so it replaces what it corrects rather than piling up
		// beside it.
		this.overwriteExistingNote = true;
		// On a note per annotation a tag in the comment is that annotation's
		// own subject, which is exactly what a note property is for. On one
		// note holding all of them the same tag would claim the whole PDF.
		this.extractTags = "separate";
		// A blank line, so a highlight covering two paragraphs of the book
		// reads as two in the note. The reader who wraps it in a blockquote is
		// the one who has to choose otherwise.
		this.paragraphSeparation = "blank";
	}

	/**
	 * `onePerAnnotation` tells the two kinds apart; inserting into the note
	 * being edited asks with false, being a single note like any other.
	 */
	public extractsTags(onePerAnnotation: boolean): boolean {
		switch (this.extractTags) {
			case "always":
				return true;
			case "single":
				return !onePerAnnotation;
			case "separate":
				return onePerAnnotation;
			default:
				return false;
		}
	}

	public isAnnotationDesired(annotationType: string): boolean {
		return this.desiredAnnotations.includes(annotationType);
	}

	public setAnnotationDesired(
		annotationType: string,
		desired: boolean
	): void {
		const selected = new Set(this.desiredAnnotations);
		if (desired) {
			selected.add(annotationType);
		} else {
			selected.delete(annotationType);
		}

		// Keep the order the types are listed in, then any subtype added to
		// data.json by hand that this version does not offer a checkbox for.
		const known = new Set(SUPPORTED_ANNOTS.map((a) => a.subtype));
		this.desiredAnnotations = [
			...SUPPORTED_ANNOTS.map((a) => a.subtype).filter((type) =>
				selected.has(type)
			),
			...[...selected].filter((type) => !known.has(type)),
		];
	}

	/** A location this version knows, for a data.json edited by hand. */
	public static normalizeNoteLocation(value: unknown): NoteLocation {
		return NOTE_LOCATIONS.includes(value as NoteLocation)
			? (value as NoteLocation)
			: "vault";
	}

	/** A mode this version knows, so the dropdown never shows nothing. */
	public static normalizeTagExtraction(value: unknown): TagExtraction {
		return typeof value === "string" && value in TAG_EXTRACTION_MODES
			? (value as TagExtraction)
			: "never";
	}

	/** A separator this version knows, for the reason the modes above have one. */
	public static normalizeParagraphSeparation(
		value: unknown
	): ParagraphSeparation {
		return typeof value === "string" && value in PARAGRAPH_SEPARATORS
			? (value as ParagraphSeparation)
			: "blank";
	}

	/** Null for anything data.json holds that is not a list of subtypes. */
	public static normalizeDesiredAnnotations(value: unknown): string[] | null {
		if (!Array.isArray(value)) return null;

		const entries: unknown[] = value;
		const subtypes = entries.filter(
			(subtype): subtype is string => typeof subtype === "string"
		);
		return subtypes.length === entries.length ? subtypes : null;
	}

	/**
	 * One entry per supported type. A string is kept, blank included — that is
	 * a type handed back to the default — and anything else read as none.
	 */
	public static normalizeAnnotationTemplates(
		value: unknown
	): Record<string, string> {
		const held = (
			value && typeof value === "object" ? value : {}
		) as Record<string, unknown>;

		// Tuples for the reason `defaultAnnotationTemplates` gives.
		return Object.fromEntries(
			SUPPORTED_ANNOTS.map(({ subtype }): [string, string] => [
				subtype,
				typeof held[subtype] === "string" ? held[subtype] : "",
			])
		);
	}
}

/**
 * One toggle's worth of a settings row: what it says, and how the setting
 * behind it is read and written. Passed rather than the setting's name, since
 * a name would have to be looked up through `asIndexable` and would lose the
 * type on the way.
 */
interface BooleanSetting {
	name: string;
	desc: string;
	get: () => boolean;
	set: (value: boolean) => void;
}

/**
 * Type-ahead over the vault's folders. Every folder is offered on an empty
 * query, so the field can be browsed as well as typed into.
 */
class FolderSuggest extends AbstractInputSuggest<string> {
	getSuggestions(query: string): string[] {
		const wanted = query.toLowerCase();
		return this.app.vault
			.getAllFolders(true)
			.map((folder) => folder.path)
			.filter((path) => path.toLowerCase().includes(wanted));
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}
}

/**
 * Declared through 1.13's `getSettingDefinitions()`, one definition per section
 * of the tab. `display()` is gone: a non-empty array of definitions renders the
 * tab instead of it, and `minAppVersion` is 1.13.0, so there is no version left
 * that would reach it.
 *
 * Every definition draws itself through `render`. None of this tab's pieces —
 * the variables table, the template editor and its gutter, the warning overlay,
 * the accordion, the annotation grid — is a control the API describes, so
 * `control` is used nowhere here and nothing is saved automatically: each
 * change handler still calls `saveSettings()` itself, exactly as it did when
 * the tab was built imperatively.
 *
 * What a definition carries besides its drawing is what the settings search
 * indexes — the DOM is not read — so each one names the settings inside it in
 * `aliases`, and a hit scrolls to the row the section is drawn in.
 *
 * The list never changes shape. Obsidian reconciles rows by a key taken from
 * the definition's name, so a section that has to redraw redraws its own root
 * rather than asking for the list again.
 */
export class PDFAnnotationPluginSettingTab extends PluginSettingTab {
	plugin: PDFAnnotationPlugin;

	constructor(app: App, plugin: PDFAnnotationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	addValueChangeCallback<T extends HTMLTextAreaElement | HTMLInputElement>(
		component: AbstractTextComponent<T> | DropdownComponent,
		settingsKey: string,
		cb?: (value: string) => void
	): void {
		component.onChange(async (value) => {
			asIndexable(this.plugin.settings)[settingsKey] = value;
			await this.plugin.saveSettings();
			if (cb) {
				cb(value);
			}
		});
	}

	buildValueInput<T extends HTMLTextAreaElement | HTMLInputElement>(
		component: AbstractTextComponent<T> | DropdownComponent,
		settingsKey: string,
		cb?: (value: string) => void
	): void {
		component.setValue(
			asIndexable(this.plugin.settings)[settingsKey] as string
		);
		this.addValueChangeCallback(component, settingsKey, cb);
	}

	/**
	 * A collapsible panel, closed to begin with; returns the element its
	 * contents go in. <details> has no transition of its own, so opening
	 * reveals the content to measure it and animates up to that height, and
	 * closing only marks the element closed once the animation has finished.
	 * A toggle mid-animation picks up from the height on screen.
	 */
	createAccordion(
		parent: HTMLElement,
		showText: string,
		hideText: string,
		onOpen?: () => void
	): HTMLElement {
		const details = parent.createEl("details", {
			cls: "pdf-annotations-accordion",
		});
		const summary = details.createEl("summary", {
			cls: "pdf-annotations-accordion-summary",
		});
		const chevron = summary.createSpan({
			cls: "pdf-annotations-accordion-chevron",
		});
		setIcon(chevron, "chevron-right");
		const label = summary.createSpan({ text: showText });
		const content = details.createDiv({
			cls: "pdf-annotations-accordion-content",
		});

		let animation: Animation | null = null;

		// Anything sizing itself against the panel has to measure while the
		// panel has a size, which a closed `details` does not. This covers the
		// path that opens natively; the animated one calls it in step below.
		details.addEventListener("toggle", () => {
			if (details.open) onOpen?.();
		});

		summary.addEventListener("click", (event) => {
			const opening = !details.open;
			chevron.toggleClass("is-open", opening);
			label.setText(opening ? hideText : showText);

			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				return;
			}
			event.preventDefault();

			// Measured before cancelling, while it is still the height on
			// screen rather than the natural one.
			const interrupted = animation !== null;
			const onScreen = interrupted
				? content.getBoundingClientRect().height
				: 0;
			animation?.cancel();

			if (opening) details.open = true;
			// Before the height is read, or the panel would animate open to a
			// size the callback is about to change.
			if (opening) onOpen?.();
			const full = content.scrollHeight;
			const from = interrupted ? onScreen : opening ? 0 : full;
			const to = opening ? full : 0;

			animation = content.animate(
				{
					height: [`${from}px`, `${to}px`],
					opacity: opening ? [0, 1] : [1, 0],
				},
				{ duration: 180, easing: "ease-in-out" }
			);
			animation.onfinish = () => {
				animation = null;
				if (!opening) details.open = false;
			};
		});

		return content;
	}

	/**
	 * A numbered gutter beside a template's text area, redrawn as lines come and
	 * go and scrolled in step. Soft wrapping is off: a wrapped line is still one
	 * line, with no honest number for its second row.
	 *
	 * Returns the box the two share and the redraw — needed for text put in by
	 * anything other than typing, such as switching template, which fires no
	 * input event.
	 */
	addLineNumbers(textarea: HTMLTextAreaElement): {
		editorEl: HTMLElement | null;
		overlayEl: HTMLElement | null;
		redraw: () => void;
	} {
		const parent = textarea.parentElement;
		if (!parent)
			return {
				editorEl: null,
				overlayEl: null,
				redraw: () => undefined,
			};

		const editor = createDiv({ cls: "pdf-annotations-template-editor" });
		parent.insertBefore(editor, textarea);
		const gutter = editor.createDiv({
			cls: "pdf-annotations-template-gutter",
		});
		// A copy of the text area's own text for the marks to be drawn on. It
		// is taken out of the flow entirely rather than made a box beside the
		// gutter: the row it would join is laid out by Obsidian's own rules,
		// which differ on a phone, and a layer that is not in the row cannot
		// disturb them.
		const overlay = editor.createDiv({
			cls: "pdf-annotations-template-overlay",
		});
		editor.appendChild(textarea);
		textarea.setAttr("wrap", "off");

		const drawLineNumbers = () => {
			const lines = textarea.value.split("\n").length;
			gutter.setText(
				Array.from({ length: lines }, (_, i) => i + 1).join("\n")
			);
			// The overlay starts where the numbers end, and they widen by a
			// digit at every tenth line.
			editor.style.setProperty(
				"--pdf-annotations-gutter-width",
				`${gutter.offsetWidth}px`
			);
		};

		textarea.addEventListener("input", drawLineNumbers);
		textarea.addEventListener("scroll", () => {
			gutter.scrollTop = textarea.scrollTop;
			// A mark travels with the text it marks, sideways included: with
			// wrapping off, a long line scrolls out of the box either way.
			overlay.scrollTop = textarea.scrollTop;
			overlay.scrollLeft = textarea.scrollLeft;
		});
		drawLineNumbers();

		return {
			editorEl: editor,
			overlayEl: overlay,
			redraw: drawLineNumbers,
		};
	}

	/**
	 * Marks every variable the type being edited never fills, and says why.
	 * Returns the call that switches the marks to another type, and the one
	 * that gives up the media query it watches — the query outlives the
	 * elements, so the section that drew them hands this back as its cleanup.
	 *
	 * The marks lie under the text area rather than in it, so nothing about
	 * the typing changes; the pointer never reaches them, and is measured
	 * against where they landed instead. The message hangs off `host` because
	 * the editor clips what leaves its frame.
	 *
	 * Where there is no pointer to hover with there is nothing to wait for, so
	 * the message stands under the editor from the moment a mark appears. The
	 * marks themselves are the same either way.
	 */
	addVariableWarnings(
		textarea: HTMLTextAreaElement,
		overlay: HTMLElement,
		host: HTMLElement
	): { show: (subtype: string) => void; dispose: () => void } {
		const tooltip = host.createDiv({
			cls: "pdf-annotations-template-tooltip",
		});
		tooltip.hide();

		// A tablet with a keyboard case can gain and lose a pointer while the
		// tab is open, so this is asked each time rather than once.
		const hovers = window.matchMedia("(hover: hover)");

		let unfilled: string[] = [];
		let description = "";

		/** The warning about `name`, or about all of them at once. */
		const explain = (name?: string) =>
			t.WARNING_VARIABLE_UNFILLED.replace(
				"{{variable}}",
				(name ? [name] : unfilled).map((one) => `{{${one}}}`).join(", ")
			).replace("{{type}}", description);

		const paint = () => {
			overlay.empty();
			tooltip.hide();
			tooltip.toggleClass(
				"pdf-annotations-template-tooltip-static",
				!hovers.matches
			);
			if (unfilled.length === 0) return;

			const text = textarea.value;
			let written = 0;
			let marked = 0;
			for (const use of findVariableUses(text, unfilled)) {
				overlay.appendText(text.slice(written, use.start));
				overlay.createSpan({
					cls: "pdf-annotations-template-unfilled",
					text: use.text,
					// Which variable this mark is, for the message to name
					// when the pointer stops on it.
					attr: { "data-variable": use.name },
				});
				written = use.end;
				marked++;
			}
			// The tail matters as much as the marks: without it the last line
			// is short, and a mark on the line below sits at the wrong height.
			overlay.appendText(text.slice(written));

			// Nothing to hover, and nothing to explain until the template
			// actually asks for one of them.
			if (hovers.matches || marked === 0) return;
			// Placed by the stylesheet from here on, not against a mark.
			tooltip.setCssProps({ left: "", top: "" });
			tooltip.setText(explain());
			tooltip.show();
		};

		textarea.addEventListener("input", paint);
		// The pointer that comes and goes takes the message's place with it.
		hovers.addEventListener("change", paint);

		textarea.addEventListener("mouseleave", () => {
			if (hovers.matches) tooltip.hide();
		});
		textarea.addEventListener("mousemove", (event) => {
			if (!hovers.matches) return;

			const marks = Array.from(
				overlay.querySelectorAll<HTMLElement>(
					".pdf-annotations-template-unfilled"
				)
			);
			const under = marks.find((mark) => {
				const rect = mark.getBoundingClientRect();
				return (
					event.clientX >= rect.left &&
					event.clientX <= rect.right &&
					event.clientY >= rect.top &&
					event.clientY <= rect.bottom
				);
			});
			if (!under) {
				tooltip.hide();
				return;
			}

			const mark = under.getBoundingClientRect();
			const box = host.getBoundingClientRect();
			tooltip.setText(explain(under.dataset.variable));
			tooltip.setCssProps({
				left: `${mark.left - box.left}px`,
				top: `${mark.bottom - box.top + 6}px`,
			});
			tooltip.show();
		});

		return {
			show: (subtype: string) => {
				const unfilledHere = unfilledVariablesFor(subtype);
				unfilled = unfilledHere.names;
				description = unfilledHere.description;
				paint();
			},
			dispose: () => hovers.removeEventListener("change", paint),
		};
	}

	/**
	 * Appends `text`, turning the first `linkText` into a link. Keeps the
	 * paragraph one translatable sentence rather than the fragments either side
	 * of an anchor.
	 */
	appendTextWithLink(
		parent: HTMLElement,
		text: string,
		linkText: string,
		href: string
	): void {
		const at = text.indexOf(linkText);
		if (at < 0) {
			parent.createSpan({ text });
			return;
		}
		parent.createSpan({ text: text.slice(0, at) });
		parent.createEl("a", { text: linkText, href });
		parent.createSpan({ text: text.slice(at + linkText.length) });
	}

	/**
	 * Makes `pill` copy a template variable, with the icon button that says so.
	 * The listener is on the pill so the whole of it is the target; the button
	 * is real, which is what makes the pill reachable by keyboard.
	 */
	addCopyAction(pill: HTMLElement, variable: string): void {
		const button = pill.createEl("button", {
			cls: ["clickable-icon", "pdf-annotations-copy-button"],
			attr: {
				type: "button",
				"aria-label": `${t.COPY_TOOLTIP}: ${variable}`,
			},
		});
		setIcon(button, "copy");
		setTooltip(pill, t.COPY_TOOLTIP);

		pill.addEventListener("click", () => {
			navigator.clipboard
				.writeText(variable)
				.then(() => {
					new Notice(`${t.NOTICE_COPIED}: ${variable}`);
					setIcon(button, "check");
					window.setTimeout(() => setIcon(button, "copy"), 1500);
				})
				.catch((error) => {
					new Notice(t.NOTICE_COPY_FAILED);
					console.error(error);
				});
		});
	}

	/**
	 * One section of the tab, as a definition that draws itself.
	 *
	 * The row Obsidian gives the definition is a host and nothing else: its own
	 * name and description are there for the search to index and are hidden by
	 * the stylesheet, and the section is built into a root inside it. It has to
	 * be `settingEl` and not the group's list element, which Obsidian prunes
	 * down to the rows it created itself after every pass — anything else put
	 * there is drawn and then deleted in the same tick.
	 *
	 * The root is looked up before it is created, since `update()` runs the
	 * callback again on the row it already drew and a second root would leave
	 * the section on screen twice.
	 */
	private section(
		definition: Omit<SettingDefinitionRender, "render">,
		draw: (root: HTMLElement) => (() => void) | void
	): SettingDefinitionRender {
		return {
			...definition,
			render: (setting) => {
				setting.settingEl.addClass("pdf-annotations-settings-anchor");
				const root =
					setting.settingEl.querySelector<HTMLElement>(
						":scope > .pdf-annotations-settings-root"
					) ??
					setting.settingEl.createDiv("pdf-annotations-settings-root");
				root.empty();
				return draw(root);
			},
		};
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		// One group, named so the stylesheet can blank the card 1.13 draws
		// around it: the sections inside bring cards of their own.
		return [
			{
				type: "group",
				cls: "pdf-annotations-settings-group",
				items: [
					this.section(
						{
							name: t.PLUGIN_NAME,
							desc: t.PLUGIN_DESCRIPTION,
						},
						(root) => this.renderHeader(root)
					),
					this.section(
						{
							name: t.SETTING_ANNOTATIONS_NAME,
							aliases: SUPPORTED_ANNOTS.map(
								({ description }) => description
							),
						},
						(root) => this.renderAnnotationTypes(root)
					),
					this.section(
						{
							name: t.SECTION_TEMPLATES,
							desc: t.SECTION_TEMPLATES_DESC,
							// The variable names are what a reader looking for
							// the template editor is most likely to type.
							aliases: [
								t.SETTING_TEMPLATE_NAME,
								t.HANDLEBARS_LINK,
								t.SHOW_VARIABLES_TABLE,
								...Object.keys(TEMPLATE_VARIABLES).map(
									(name) => `{{${name}}}`
								),
							],
						},
						(root) => this.renderTemplates(root)
					),
					this.section(
						{
							name: t.SECTION_GENERAL_RULES,
							aliases: [
								t.SETTING_PARAGRAPHS_NAME,
								t.SETTING_SORT_BY_TOPIC_NAME,
								t.SETTING_TOPIC_HEADING_NAME,
								t.SETTING_NOTE_LOCATION_NAME,
								t.SETTING_NOTE_FOLDER_NAME,
								t.SETTING_EXTRACT_TAGS_NAME,
								t.SETTING_OVERWRITE_NAME,
							],
						},
						(root) => this.renderGeneralRules(root)
					),
					// The two kinds of extraction, each holding the settings
					// that only it obeys.
					this.section(
						{
							name: t.SECTION_SEPARATE_NOTES,
							aliases: [
								t.SETTING_TOPIC_TO_NAME_NAME,
								t.SETTING_ONE_NOTE_NAME_NAME,
								t.SETTING_NOTE_SUBFOLDER_NAME,
								t.SETTING_SECTION_SUBFOLDER_NAME,
							],
						},
						(root) => this.renderSeparateNotes(root)
					),
					this.section(
						{
							name: t.SECTION_SHARED_NOTES,
							aliases: [
								t.SETTING_GROUP_BY_FOLDER_NAME,
								t.SETTING_FOLDER_HEADING_NAME,
								t.SETTING_GROUP_BY_FILE_NAME,
								t.SETTING_FILE_HEADING_NAME,
								t.SETTING_GROUP_BY_DATE_NAME,
								t.SETTING_DATE_HEADING_NAME,
								t.SETTING_NOTE_NAME_NAME,
							],
						},
						(root) => this.renderSharedNotes(root)
					),
				],
			},
		];
	}

	private renderHeader(root: HTMLElement): void {
		const header = new Setting(root)
			.setName(t.PLUGIN_NAME)
			.setDesc(t.PLUGIN_DESCRIPTION)
			.setHeading();
		header.settingEl.addClass("pdf-annotations-settings-header");
	}

	private renderAnnotationTypes(root: HTMLElement): void {
		// Name, description and checkboxes form one card, stacked: the grid
		// goes into the setting's control element, which styles.css widens to
		// the full row underneath the text.
		const annotationSetting = new Setting(root)
			.setName(t.SETTING_ANNOTATIONS_NAME)
			.setHeading();
		annotationSetting.settingEl.addClass(
			"pdf-annotations-annotation-setting"
		);

		const annotationGrid = annotationSetting.controlEl.createDiv({
			cls: "pdf-annotations-annotation-grid",
		});
		SUPPORTED_ANNOTS.forEach(({ subtype, description }) => {
			const option = annotationGrid.createEl("label", {
				cls: "pdf-annotations-annotation-option",
			});
			const checkbox = option.createEl("input", { type: "checkbox" });
			checkbox.checked =
				this.plugin.settings.isAnnotationDesired(subtype);
			option.createSpan({ text: description });

			checkbox.addEventListener("change", () => {
				this.plugin.settings.setAnnotationDesired(
					subtype,
					checkbox.checked
				);
				this.plugin
					.saveSettings()
					.catch((error) => console.error(error));
			});
		});
	}

	/**
	 * Returns the cleanup for the media query the warnings watch: Obsidian
	 * calls it when the tab is hidden and before the section is drawn again.
	 */
	private renderTemplates(root: HTMLElement): () => void {
		// The heading's description rather than a paragraph after it, so the
		// section reads as one block. Through descEl, since setDesc takes text
		// and this has a link in the middle.
		const templatesHeading = new Setting(root)
			.setName(t.SECTION_TEMPLATES)
			.setHeading();
		templatesHeading.descEl.addClass("pdf-annotations-template-instructions");
		this.appendTextWithLink(
			templatesHeading.descEl,
			t.SECTION_TEMPLATES_DESC,
			t.HANDLEBARS_LINK,
			HANDLEBARS_DOCS
		);

		// Folded away by default: the table is a reference to look something up
		// in, not something to read past on the way to the templates.
		// `sizeVariableTable` is assigned below, once there is a table to size.
		let sizeVariableTable: () => void = () => undefined;
		const variablesContent = this.createAccordion(
			root,
			t.SHOW_VARIABLES_TABLE,
			t.HIDE_VARIABLES_TABLE,
			() => sizeVariableTable()
		);
		const variableScroll = variablesContent.createDiv({
			cls: "pdf-annotations-variable-scroll",
		});
		const templateVariableTable = variableScroll.createEl("table", {
			cls: "pdf-annotations-variable-table",
		});
		const templateVariableHead = templateVariableTable
			.createEl("thead")
			.createEl("tr");
		templateVariableHead.createEl("th", {
			text: t.TABLE_VARIABLE,
		});
		templateVariableHead.createEl("th", {
			text: t.TABLE_DESCRIPTION,
		});

		const templateVariableBody = templateVariableTable.createEl("tbody");
		const variableRows: [string, string][] = Object.entries(
			TEMPLATE_VARIABLES
		);
		variableRows.forEach(([key, description]) => {
			const templateVariableRow = templateVariableBody.createEl("tr"),
				nameCell = templateVariableRow.createEl("td", {
					cls: "pdf-annotations-variable-name",
				}),
				variable = "{{" + key + "}}";

			// The variable and its copy button share a pill, so hovering either
			// of them lights up the whole thing.
			const pill = nameCell.createSpan({
				cls: "pdf-annotations-variable",
			});
			pill.createSpan({ cls: "text-monospace", text: variable });
			this.addCopyAction(pill, variable);

			templateVariableRow.createEl("td", { text: description });
		});

		/**
		 * Caps the table at its first `VISIBLE_VARIABLE_ROWS` rows and scrolls
		 * the rest under a header that stays put. Measured rather than counted
		 * in ems: a description wraps to a second line on a narrow pane, and a
		 * height guessed from the font would then cut a row in half.
		 */
		sizeVariableTable = () => {
			const rows = Array.from(templateVariableBody.rows);
			if (rows.length <= VISIBLE_VARIABLE_ROWS) return;

			// From the top of the table, so the header the rows scroll under is
			// counted in as well.
			const last = rows[VISIBLE_VARIABLE_ROWS - 1];
			const height =
				last.getBoundingClientRect().bottom -
				templateVariableTable.getBoundingClientRect().top;
			// Zero while the panel is still closed, and there is nothing to
			// measure against; the next open calls this again.
			if (height <= 0) return;

			// The height goes to the stylesheet as a property rather than as a
			// rule of its own: what to do with it is the stylesheet's to say.
			variableScroll.style.setProperty(
				"--pdf-annotations-variable-rows-height",
				`${Math.ceil(height)}px`
			);
		};

		// One card whose picker says which template is being written. Editing
		// them one at a time keeps the card one template tall.
		const templateColumns = root.createDiv({
			cls: "pdf-annotations-template-columns",
		});
		// The card is a box of ours holding a setting row and the editor
		// under it, rather than a setting row the editor is put inside. A
		// setting row is Obsidian's to lay out, and how it lays one out on a
		// phone is not how it lays one out on a desktop: an editor added to
		// the row was carried off the side of the card there, and no rule
		// here could reach past the one doing it.
		const templateCard = templateColumns.createDiv({
			cls: "pdf-annotations-template-card",
		});

		let editing = DEFAULT_TEMPLATE_KEY;
		let editor!: TextAreaComponent;
		let editorEl: HTMLElement | null = null;
		let overlayEl: HTMLElement | null = null;
		let redrawLineNumbers: () => void = () => undefined;
		// Assigned once there is a card to hang the tooltip off, which is after
		// the first template has already been shown without one.
		let showUnfilledVariables: (subtype: string) => void = () => undefined;

		const templateOf = (target: string) =>
			target === DEFAULT_TEMPLATE_KEY
				? this.plugin.settings.defaultTemplate
				: (this.plugin.settings.annotationTemplates[target] ?? "");

		// The default is the one template that is always written from, so it is
		// the one that says nothing when left empty; a type's own says what
		// happens to it instead.
		const showTemplate = (target: string) => {
			editor.setValue(templateOf(target));
			editor.setPlaceholder(
				target === DEFAULT_TEMPLATE_KEY
					? ""
					: t.PLACEHOLDER_TEMPLATE_DEFAULT
			);
			redrawLineNumbers();
			showUnfilledVariables(target);
		};

		const card = new Setting(templateCard)
			.setName(t.SETTING_TEMPLATE_NAME)
			.setDesc(t.SETTING_TEMPLATE_DESC)
			.addDropdown((dropdown) => {
				dropdown.addOption(
					DEFAULT_TEMPLATE_KEY,
					t.OPTION_TEMPLATE_DEFAULT
				);
				for (const { subtype, description } of SUPPORTED_ANNOTS) {
					dropdown.addOption(subtype, description);
				}
				dropdown.setValue(editing);
				dropdown.onChange((value) => {
					editing = value;
					showTemplate(editing);
				});
				dropdown.selectEl.addClass("pdf-annotations-template-picker");
			})
			.addTextArea((input) => {
				editor = input;
				input.inputEl.addClass("pdf-annotations-template-input");
				const numbered = this.addLineNumbers(input.inputEl);
				redrawLineNumbers = numbered.redraw;
				// Out of the control the picker sits in and into the card
				// itself, so the picker can sit beside the description while
				// the editor keeps the whole width under both.
				if (numbered.editorEl) editorEl = numbered.editorEl;
				overlayEl = numbered.overlayEl;
				input.onChange(async (value) => {
					if (editing === DEFAULT_TEMPLATE_KEY) {
						this.plugin.settings.defaultTemplate = value;
					} else {
						this.plugin.settings.annotationTemplates[editing] =
							value;
					}
					await this.plugin.saveSettings();
				});
				showTemplate(editing);
			});
		card.settingEl.addClass("pdf-annotations-template-setting");
		// Under the setting row rather than inside it: text and picker share
		// the row, the editor takes the width of the card beneath it.
		if (editorEl) templateCard.appendChild(editorEl);
		let disposeWarnings: () => void = () => undefined;
		if (overlayEl) {
			const warnings = this.addVariableWarnings(
				editor.inputEl,
				overlayEl,
				templateCard
			);
			showUnfilledVariables = warnings.show;
			disposeWarnings = warnings.dispose;
			// The template on screen was shown before there was anything to
			// mark it with.
			showUnfilledVariables(editing);
		}

		return () => disposeWarnings();
	}

	/**
	 * A grouping and the heading that heads it, as the one pair they are: a
	 * heading has nothing to head until the grouping gathers something under it,
	 * so it follows the grouping — greyed out but still in view, and remembering
	 * the choice it was switched off from.
	 *
	 * The two are drawn together, so the toggle they share is a local of this
	 * call. It was a field of the tab while they lived in sections of their own,
	 * and needed a cleanup to forget it by; neither is needed now.
	 */
	private renderGroupingPair(
		root: HTMLElement,
		grouping: BooleanSetting,
		heading: BooleanSetting
	): void {
		let headingToggle: ToggleComponent | null = null;
		let syncing = false;

		const syncHeading = () => {
			// Compared with null rather than tested for truth: every component
			// carries a `then` for chaining, which reads as a promise to the
			// rule that guards against awaiting one by accident.
			if (headingToggle === null) return;
			// setValue calls onChange, which would take this for an edit and
			// write the remembered choice away.
			syncing = true;
			headingToggle.setValue(grouping.get() && heading.get());
			headingToggle.setDisabled(!grouping.get());
			syncing = false;
		};

		new Setting(root)
			.setName(grouping.name)
			.setDesc(grouping.desc)
			.addToggle((toggle) =>
				toggle.setValue(grouping.get()).onChange(async (value) => {
					grouping.set(value);
					syncHeading();
					await this.plugin.saveSettings();
				})
			);

		new Setting(root)
			.setName(heading.name)
			.setDesc(heading.desc)
			.addToggle((toggle) => {
				headingToggle = toggle;
				toggle.setValue(heading.get()).onChange(async (value) => {
					if (syncing) return;
					heading.set(value);
					await this.plugin.saveSettings();
				});
			});
		syncHeading();
	}

	/**
	 * What holds for an extraction of either kind: how the topic of a comment is
	 * read, where the notes go, what becomes of the tags in them, and what
	 * happens to a note already there. The two sections after it say what each
	 * kind writes.
	 *
	 * The topic is here and the other three groupings are not, because it is the
	 * only one that reaches both kinds: it takes the topic line out of every
	 * comment, heads the annotations sharing it, and is what a separate note can
	 * be named after.
	 */
	private renderGeneralRules(root: HTMLElement): void {
		new Setting(root)
			.setName(t.SECTION_GENERAL_RULES)
			.setHeading();

		// What is read out of the annotations first, then where what was read
		// is filed — the order the tab has followed since the templates. The
		// marked up text is the first of those: the paragraphs it comes out as.
		new Setting(root)
			.setName(t.SETTING_PARAGRAPHS_NAME)
			.setDesc(t.SETTING_PARAGRAPHS_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(PARAGRAPH_SEPARATORS)
					.setValue(this.plugin.settings.paragraphSeparation)
					.onChange(async (value) => {
						this.plugin.settings.paragraphSeparation =
							value as ParagraphSeparation;
						await this.plugin.saveSettings();
					})
			);

		this.renderGroupingPair(
			root,
			{
				name: t.SETTING_SORT_BY_TOPIC_NAME,
				desc: t.SETTING_SORT_BY_TOPIC_DESC,
				get: () => this.plugin.settings.sortByTopic,
				set: (value) => (this.plugin.settings.sortByTopic = value),
			},
			{
				name: t.SETTING_TOPIC_HEADING_NAME,
				desc: t.SETTING_TOPIC_HEADING_DESC,
				get: () => this.plugin.settings.topicHeading,
				set: (value) => (this.plugin.settings.topicHeading = value),
			}
		);

		// A note following the file being looked at has no vault folder to go
		// in, so the field opens and closes with the choice above it.
		let showNoteTarget!: (shown: boolean, animate: boolean) => void;
		const syncNoteTarget = (animate: boolean) => {
			showNoteTarget(
				this.plugin.settings.noteLocation === "vault",
				animate
			);
		};

		new Setting(root)
			.setName(t.SETTING_NOTE_LOCATION_NAME)
			.setDesc(t.SETTING_NOTE_LOCATION_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						current: t.OPTION_NOTE_LOCATION_CURRENT,
						vault: t.OPTION_NOTE_LOCATION_VAULT,
					})
					.setValue(this.plugin.settings.noteLocation)
					.onChange(async (value) => {
						this.plugin.settings.noteLocation =
							value as NoteLocation;
						syncNoteTarget(true);
						await this.plugin.saveSettings();
					})
			);

		const noteTargetPanel = root.createDiv({
			cls: "pdf-annotations-collapsible",
		});
		showNoteTarget = createCollapsible(noteTargetPanel);
		const noteFolderSetting = new Setting(noteTargetPanel)
			.setName(t.SETTING_NOTE_FOLDER_NAME)
			.setDesc(t.SETTING_NOTE_FOLDER_DESC)
			.addText((input) => {
				input.setPlaceholder(t.PLACEHOLDER_VAULT_ROOT);
				this.buildValueInput(input, "noteFolder");
				const suggest = new FolderSuggest(this.app, input.inputEl);
				suggest.onSelect(async (folder) => {
					input.setValue(folder);
					this.plugin.settings.noteFolder = folder;
					await this.plugin.saveSettings();
					// Registering a callback takes the selection over, closing
					// the popover included: left to itself it stays open over
					// the field it has just answered.
					suggest.close();
				});
			});
		noteFolderSetting.settingEl.addClass("pdf-annotations-stacked-setting");
		syncNoteTarget(false);

		new Setting(root)
			.setName(t.SETTING_EXTRACT_TAGS_NAME)
			.setDesc(t.SETTING_EXTRACT_TAGS_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(TAG_EXTRACTION_MODES)
					.setValue(this.plugin.settings.extractTags)
					.onChange(async (value) => {
						this.plugin.settings.extractTags =
							value as TagExtraction;
						await this.plugin.saveSettings();
					})
			);
		new Setting(root)
			.setName(t.SETTING_OVERWRITE_NAME)
			.setDesc(t.SETTING_OVERWRITE_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.overwriteExistingNote)
					.onChange(async (value) => {
						this.plugin.settings.overwriteExistingNote = value;
						await this.plugin.saveSettings();
					})
			);
	}

	/**
	 * The settings that apply to the extraction writing a note per annotation
	 * and to no other, gathered where that is the one thing they have in
	 * common: what the notes are named, and the folder that keeps that many of
	 * them together under wherever the general rules send them.
	 */
	private renderSeparateNotes(root: HTMLElement): void {
		new Setting(root)
			.setName(t.SECTION_SEPARATE_NOTES)
			.setHeading();

		// The switch above the field it governs: once the topic names the
		// notes, the name template has nothing left to name.
		let showOneNoteName!: (shown: boolean, animate: boolean) => void;
		const syncOneNoteName = (animate: boolean) => {
			showOneNoteName(!this.plugin.settings.topicToNoteName, animate);
		};

		new Setting(root)
			.setName(t.SETTING_TOPIC_TO_NAME_NAME)
			.setDesc(t.SETTING_TOPIC_TO_NAME_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.topicToNoteName)
					.onChange(async (value) => {
						this.plugin.settings.topicToNoteName = value;
						syncOneNoteName(true);
						await this.plugin.saveSettings();
					})
			);

		const oneNoteNamePanel = root.createDiv({
			cls: "pdf-annotations-collapsible",
		});
		showOneNoteName = createCollapsible(oneNoteNamePanel);
		const oneNoteNameSetting = new Setting(oneNoteNamePanel)
			.setName(t.SETTING_ONE_NOTE_NAME_NAME)
			.setDesc(t.SETTING_ONE_NOTE_NAME_DESC)
			.addText((input) =>
				this.buildValueInput(input, "oneNotePerAnnotationName")
			);
		oneNoteNameSetting.settingEl.addClass(
			"pdf-annotations-stacked-setting"
		);
		syncOneNoteName(false);

		const noteSubfolderSetting = new Setting(root)
			.setName(t.SETTING_NOTE_SUBFOLDER_NAME)
			.setDesc(t.SETTING_NOTE_SUBFOLDER_DESC)
			.addText((input) => {
				input.setPlaceholder(t.PLACEHOLDER_SUBFOLDER_EXAMPLE);
				this.buildValueInput(input, "noteSubfolder");
			});
		noteSubfolderSetting.settingEl.addClass(
			"pdf-annotations-stacked-setting"
		);

		// Under the field it nests inside, which is where its folders are made.
		new Setting(root)
			.setName(t.SETTING_SECTION_SUBFOLDER_NAME)
			.setDesc(t.SETTING_SECTION_SUBFOLDER_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.subfolderPerSection)
					.onChange(async (value) => {
						this.plugin.settings.subfolderPerSection = value;
						await this.plugin.saveSettings();
					})
			);
	}

	/**
	 * The extraction that gathers a whole PDF into one note, and the only one
	 * these settings reach: a note holding a single annotation has nothing to
	 * gather and nothing to head, which is why the formatter skips all three of
	 * these headings for it.
	 *
	 * The pairs are in the order the groupings nest, widest first — folder, then
	 * file, then day — which is the order they are applied in and the order the
	 * headings take their levels in.
	 */
	private renderSharedNotes(root: HTMLElement): void {
		new Setting(root)
			.setName(t.SECTION_SHARED_NOTES)
			.setHeading();

		this.renderGroupingPair(
			root,
			{
				name: t.SETTING_GROUP_BY_FOLDER_NAME,
				desc: t.SETTING_GROUP_BY_FOLDER_DESC,
				get: () => this.plugin.settings.groupByFolder,
				set: (value) => (this.plugin.settings.groupByFolder = value),
			},
			{
				name: t.SETTING_FOLDER_HEADING_NAME,
				desc: t.SETTING_FOLDER_HEADING_DESC,
				get: () => this.plugin.settings.folderHeading,
				set: (value) => (this.plugin.settings.folderHeading = value),
			}
		);

		this.renderGroupingPair(
			root,
			{
				name: t.SETTING_GROUP_BY_FILE_NAME,
				desc: t.SETTING_GROUP_BY_FILE_DESC,
				get: () => this.plugin.settings.groupByFile,
				set: (value) => (this.plugin.settings.groupByFile = value),
			},
			{
				name: t.SETTING_FILE_HEADING_NAME,
				desc: t.SETTING_FILE_HEADING_DESC,
				get: () => this.plugin.settings.fileHeading,
				set: (value) => (this.plugin.settings.fileHeading = value),
			}
		);

		this.renderGroupingPair(
			root,
			{
				name: t.SETTING_GROUP_BY_DATE_NAME,
				desc: t.SETTING_GROUP_BY_DATE_DESC,
				get: () => this.plugin.settings.groupByDate,
				set: (value) => (this.plugin.settings.groupByDate = value),
			},
			{
				name: t.SETTING_DATE_HEADING_NAME,
				desc: t.SETTING_DATE_HEADING_DESC,
				get: () => this.plugin.settings.dateHeading,
				set: (value) => (this.plugin.settings.dateHeading = value),
			}
		);

		const noteNameSetting = new Setting(root)
			.setName(t.SETTING_NOTE_NAME_NAME)
			.setDesc(t.SETTING_NOTE_NAME_DESC)
			.addText((input) => this.buildValueInput(input, "noteName"));
		noteNameSetting.settingEl.addClass("pdf-annotations-stacked-setting");
	}
}
