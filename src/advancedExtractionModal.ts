import {
	AbstractInputSuggest,
	App,
	ButtonComponent,
	MarkdownView,
	Modal,
	moment,
	normalizePath,
	Notice,
	Platform,
	SearchComponent,
	Setting,
	TFile,
	ToggleComponent,
} from "obsidian";
import { t } from "lang/helpers";
import PDFAnnotationPlugin from "src/main";
import { createCollapsible } from "src/collapsible";
import {
	colorsOfAnnotations,
	daysOfAnnotations,
	filterAnnotations,
	NO_COLOR,
	PageSelection,
} from "src/extractionFilter";
import { SUPPORTED_ANNOTS } from "src/settings";
import { LoadedAnnotations, PDFAnnotation } from "src/types";
import { ExtractionProgress } from "src/progress";

/**
 * A place on the machine rather than in the vault. Only tells the two apart —
 * whether the path leads to a readable PDF is the loader's answer to give.
 */
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/])/;

/** The PDF an extraction is to read, once the field has been made sense of. */
type ExtractionSource =
	| { kind: "vault"; file: TFile }
	| { kind: "external"; path: string };

/**
 * Where an extraction puts what it gathered, which the ordinary commands each
 * decide for themselves. Separate notes first: a reader who has narrowed one
 * down is picking annotations apart, not filing them together.
 */
const EXTRACTION_TARGETS = {
	separate: t.MODAL_TARGET_SEPARATE,
	single: t.MODAL_TARGET_SINGLE,
	current: t.MODAL_TARGET_CURRENT,
};

type ExtractionTarget = keyof typeof EXTRACTION_TARGETS;

/** Tells one source from another, so a PDF already read is not read again. */
function sourceKey(source: ExtractionSource): string {
	return source.kind === "vault"
		? `vault:${source.file.path}`
		: `external:${source.path}`;
}

/** A path is pasted with the file manager's quotes as often as without. */
function unquote(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, "");
}

/**
 * A day as the reader's language writes one. Days are held and sorted as
 * `YYYY-MM-DD` and only spelled out here, so the list stays in calendar order
 * whatever the format puts first. Obsidian sets moment's locale to the app's,
 * so a Russian interface reads Russian months without a translation here.
 */
/** The slice of a moment object a day is rendered through. */
interface FormattedDate {
	isValid(): boolean;
	format(format: string): string;
}

// Narrowed to the one call and two methods used rather than typed as
// `moment.Moment`: `moment` reaches us through Obsidian's re-export of the
// moment package, and an `any` here would spread into everything the day is
// written into. The cast is also what keeps this compiling under TypeScript 6,
// which makes esModuleInterop mandatory — Obsidian declares the re-export as
// `typeof Moment` off a namespace import, and a namespace import of a package
// that exports by assignment no longer carries its call signatures.
const parseDay = moment as unknown as (
	value: string,
	format: string,
	strict: boolean,
) => FormattedDate;

function readableDay(day: string): string {
	const date = parseDay(day, "YYYY-MM-DD", true);
	return date.isValid() ? date.format(t.DATE_FORMAT) : day;
}

/**
 * A toggle over a panel of checkboxes, asked of the PDF once it has been read:
 * the days its annotations were made on, and the colours they were marked with.
 * Both narrow the extraction down by something only the file can say, so both
 * are drawn the same way and opened by the same motion.
 */
/** One checkbox in such a panel, kept so the list can be put right in place. */
interface OptionRow {
	row: HTMLElement;
	box: HTMLInputElement;
}

interface FilterPanel {
	/** Null only between the panel being built and its toggle being added. */
	toggle: ToggleComponent | null;
	/** Where the checkboxes go; the panel around it carries the motion. */
	list: HTMLElement;
	show: (shown: boolean, animate: boolean) => void;
}

/** Type-ahead over the PDFs in the vault, for the field that names one. */
class PDFFileSuggest extends AbstractInputSuggest<TFile> {
	getSuggestions(query: string): TFile[] {
		const wanted = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter(
				(file) =>
					file.extension.toLowerCase() === "pdf" &&
					file.path.toLowerCase().includes(wanted)
			);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}
}

/**
 * The extraction a reader sets up rather than one a command already decided.
 * The PDF is read once and kept — the list of dates can only be made from the
 * annotations themselves, so extracting filters what is already in hand.
 */
export class AdvancedExtractionModal extends Modal {
	private readonly plugin: PDFAnnotationPlugin;

	/** What the file field says, before anything has been made of it. */
	private path = "";
	private pages = "";
	private byPageLabel = false;
	private byDate = false;
	private byColor = false;
	private target: ExtractionTarget = "separate";

	/**
	 * The days the reader wants, which is not always the days they can have:
	 * one the annotation types have emptied is shown unticked while it stands
	 * empty, and is held here all the same so that taking the type back brings
	 * the day back as they had it.
	 *
	 * Null until the list is built and again whenever the field names a
	 * different PDF; every day starts ticked, since the list is there to leave
	 * days out.
	 */
	private chosenDays: Set<string> | null = null;

	/** The colours the reader wants, on the same terms as the days. */
	private chosenColors: Set<string> | null = null;

	/**
	 * The row each day and each colour is drawn in, so the ones the filters
	 * before them have left nothing in can be put beyond reach without the list
	 * being built again.
	 */
	private readonly dayRows = new Map<string, OptionRow>();
	private readonly colorRows = new Map<string, OptionRow>();

	/**
	 * The types ticked for this extraction, starting as the settings have them.
	 * Ticking one here settles this extraction only, never the setting behind
	 * every other command.
	 */
	private readonly chosenSubtypes = new Set<string>();

	/** The PDF read so far, under the key of the source it was read from. */
	private loaded: { key: string; result: LoadedAnnotations } | null = null;
	private reading = false;

	private fileInput: SearchComponent | null = null;
	private extractButton: ButtonComponent | null = null;
	/** Null until `onOpen` has drawn them. */
	private dates: FilterPanel | null = null;
	private colors: FilterPanel | null = null;

	constructor(app: App, plugin: PDFAnnotationPlugin) {
		super(app);
		this.plugin = plugin;
	}

	/** One card, in the bordered style the settings tab groups its own into. */
	private card(): HTMLElement {
		return this.contentEl.createDiv({ cls: "pdf-annotations-modal-card" });
	}

	/**
	 * One card holding a toggle and the list it opens. The toggle is added after
	 * the panel is built so the handle exists to hand back — Obsidian draws the
	 * control into the setting row above either way.
	 *
	 * `listCls` is how a list says it is laid out otherwise than as a column:
	 * the stylesheet holds both arrangements, and which one an entry suits is
	 * this window's to say.
	 */
	private addFilterPanel(
		name: string,
		desc: string,
		listCls: string | null,
		onChange: (value: boolean) => void
	): FilterPanel {
		const card = this.card();
		card.addClass("pdf-annotations-filter-card");
		const setting = new Setting(card).setName(name).setDesc(desc);

		// The panel opens and closes and carries no layout of its own: a
		// `display` on it would outrank `pdf-annotations-collapsed` and keep a
		// closed panel on screen. The column lives on the list inside.
		const panel = card.createDiv({
			cls: "pdf-annotations-collapsible pdf-annotations-collapsed",
		});
		const filter: FilterPanel = {
			toggle: null,
			list: panel.createDiv({
				cls: listCls
					? ["pdf-annotations-filter-list", listCls]
					: ["pdf-annotations-filter-list"],
			}),
			show: createCollapsible(panel),
		};

		setting.addToggle((toggle) => {
			filter.toggle = toggle;
			// Off to begin with, and set before the handler is registered so
			// that saying so does not count as the reader having asked for it.
			toggle.setValue(false).onChange(onChange);
		});
		return filter;
	}

	/** The settings tab's grid, answering the same question for this run. */
	private addSubtypes(): void {
		const setting = new Setting(this.card())
			.setName(t.SETTING_ANNOTATIONS_NAME)
			.setClass("pdf-annotations-stacked-setting");

		const grid = setting.controlEl.createDiv({
			cls: "pdf-annotations-annotation-grid",
		});
		for (const { subtype, description } of SUPPORTED_ANNOTS) {
			if (this.plugin.settings.isAnnotationDesired(subtype)) {
				this.chosenSubtypes.add(subtype);
			}

			const option = grid.createEl("label", {
				cls: "pdf-annotations-annotation-option",
			});
			const box = option.createEl("input", { type: "checkbox" });
			box.checked = this.chosenSubtypes.has(subtype);
			box.addEventListener("change", () => {
				if (box.checked) {
					this.chosenSubtypes.add(subtype);
				} else {
					this.chosenSubtypes.delete(subtype);
				}
				// Down the chain in order: the days are ruled by the types,
				// and the colours by what the days are left saying.
				this.muteUnmatchedDays();
				this.muteUnmatchedColors();
			});
			option.createSpan({ text: description });
		}
	}

	onOpen(): void {
		this.setTitle(t.MODAL_ADVANCED_TITLE);

		this.addSubtypes();

		new Setting(this.card())
			.setName(t.MODAL_FILE_NAME)
			.setClass("pdf-annotations-stacked-setting")
			.addSearch((search) => {
				this.fileInput = search;
				search.setPlaceholder(t.MODAL_FILE_PLACEHOLDER);
				search.onChange((value) => this.setPath(value));

				const suggest = new PDFFileSuggest(this.app, search.inputEl);
				suggest.onSelect((file) => {
					search.setValue(file.path);
					this.setPath(file.path);
					// Registering a callback takes the selection over,
					// closing the popover included.
					suggest.close();
				});
			});

		// One question, one card: the toggle says what the field above it
		// means. The placeholder shows the shape of an answer, so neither
		// needs a description.
		const pagesCard = this.card();
		new Setting(pagesCard)
			.setName(t.MODAL_PAGES_NAME)
			.setClass("pdf-annotations-stacked-setting")
			.addText((text) => {
				text.setPlaceholder(t.MODAL_PAGES_PLACEHOLDER);
				text.onChange((value) => {
					this.pages = value;
				});
			});
		new Setting(pagesCard)
			.setName(t.MODAL_PAGE_LABELS_NAME)
			.addToggle((toggle) =>
				toggle.setValue(this.byPageLabel).onChange((value) => {
					this.byPageLabel = value;
				})
			);

		// A written-out day is a line of text, so the days stay a column.
		this.dates = this.addFilterPanel(
			t.MODAL_DATES_NAME,
			t.MODAL_DATES_DESC,
			null,
			(value) => {
				this.byDate = value;
				this.refresh();
				// Switched off, the days stop narrowing anything down, and a
				// colour greyed out over one of them is a colour again.
				this.muteUnmatchedColors();
				if (value) void this.prepare();
			}
		);

		// The colours are blocks, and a grid of them is a palette to look over:
		// several to a row where a column gives one, and all of them in sight at
		// once for a PDF marked in a dozen.
		this.colors = this.addFilterPanel(
			t.MODAL_COLORS_NAME,
			t.MODAL_COLORS_DESC,
			"pdf-annotations-filter-grid",
			(value) => {
				this.byColor = value;
				this.refresh();
				if (value) void this.prepare();
			}
		);

		new Setting(this.card())
			.setName(t.MODAL_TARGET_NAME)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(EXTRACTION_TARGETS)
					.setValue(this.target)
					.onChange((value) => {
						this.target = value as ExtractionTarget;
					});
			});

		// A plain row: a setting row draws a rule and pads for a name and
		// description this one does not have.
		const actions = this.contentEl.createDiv({
			cls: "pdf-annotations-modal-actions",
		});
		this.extractButton = new ButtonComponent(actions)
			.setButtonText(t.MODAL_EXTRACT)
			.setCta()
			.onClick(() => void this.extract());

		this.refresh(false);
		this.releaseFocus();
		void this.prefillFromClipboard();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Obsidian focuses a modal's first field, which here opens the type-ahead
	 * over the whole vault unasked. Given up once that focus is handed out.
	 */
	private releaseFocus(): void {
		const input = this.fileInput?.inputEl;
		if (!input) return;

		// `input.doc` rather than the global one, so the check still holds for a
		// modal opened in a window popped out of the main one.
		window.requestAnimationFrame(() => {
			if (input.doc.activeElement === input) input.blur();
		});
	}

	/**
	 * A path in the clipboard is most likely the one to extract, so it is filled
	 * in — but only when it names a readable PDF. Anything else is the reader's
	 * own and would just have to be cleared out again.
	 */
	private async prefillFromClipboard(): Promise<void> {
		try {
			const clipped = unquote(await navigator.clipboard.readText());
			if (this.path || !this.resolveSource(clipped)) return;

			this.fileInput?.setValue(clipped);
			this.setPath(clipped);
		} catch (error) {
			// No clipboard to read, which is a setup question rather than
			// anything this extraction went wrong at.
			console.error(error);
		}
	}

	/** The PDF the field names, or null while it names none this can read. */
	private resolveSource(raw: string = this.path): ExtractionSource | null {
		const path = unquote(raw);
		if (!path) return null;

		// The vault first: a vault path is what the type-ahead offers and the
		// shorter of the two, so it is also what gets typed by hand.
		const inVault = this.app.vault.getFileByPath(normalizePath(path));
		if (inVault && inVault.extension.toLowerCase() === "pdf") {
			return { kind: "vault", file: inVault };
		}

		if (Platform.isDesktopApp && ABSOLUTE_PATH.test(path)) {
			return { kind: "external", path };
		}
		return null;
	}

	private setPath(value: string): void {
		this.path = value;
		const source = this.resolveSource();

		// What was read belongs to the PDF it was read from: pointed elsewhere,
		// or cleared, the annotations and everything ticked off them go.
		if (!source || (this.loaded && sourceKey(source) !== this.loaded.key)) {
			this.loaded = null;
			this.chosenDays = null;
			this.chosenColors = null;
			this.dates?.list.empty();
			this.colors?.list.empty();
			this.dayRows.clear();
			this.colorRows.clear();
		}

		this.refresh();
		// Read as soon as there is something to read, asked for or not: reading
		// is the slow part, and the list should be there when it opens.
		if (source) void this.prepare();
	}

	/** Whatever the field says now decides what can be done about it. */
	private refresh(animate = true): void {
		const ready = this.resolveSource() !== null;

		this.dates?.toggle?.setDisabled(!ready);
		this.colors?.toggle?.setDisabled(!ready);
		this.extractButton?.setDisabled(!ready || this.reading);
		this.dates?.show(this.byDate && ready, animate);
		this.colors?.show(this.byColor && ready, animate);
	}

	private async load(
		source: ExtractionSource
	): Promise<LoadedAnnotations | null> {
		// Every type, whichever are ticked, so ticking one off needs no second
		// read of the PDF.
		const everyType = SUPPORTED_ANNOTS.map(({ subtype }) => subtype);

		if (source.kind === "vault") {
			return this.plugin.loadAnnotationsFromVaultFile(
				source.file,
				everyType
			);
		}

		// One file: the pages and the days this window filters by are a single
		// PDF's, so a path naming a folder is a path it cannot use. The loader
		// has told the reader what was wrong with it already.
		return this.plugin.loadAnnotationsFromExternalFile(
			source.path,
			everyType
		);
	}

	/** Read on first ask and kept; the dates and the extraction both want them. */
	private async ensureLoaded(): Promise<LoadedAnnotations | null> {
		const source = this.resolveSource();
		if (!source) return null;

		const key = sourceKey(source);
		if (this.loaded?.key === key) return this.loaded.result;

		this.reading = true;
		this.refresh();
		this.showMessage(this.dates, t.MODAL_READING);
		this.showMessage(this.colors, t.MODAL_READING);
		try {
			const result = await this.load(source);
			if (!result) return null;

			// Typed on while the PDF was being read: what came back is no
			// longer what the field asks for.
			const still = this.resolveSource();
			if (!still || sourceKey(still) !== key) return null;

			this.loaded = { key, result };
			return result;
		} catch (error) {
			console.error(error);
			new Notice(t.NOTICE_EXTRACTION_FAILED);
			return null;
		} finally {
			this.reading = false;
			this.refresh();
		}
	}

	/** Stands in a list in place of the checkboxes it has none to draw. */
	private showMessage(panel: FilterPanel | null, message: string): void {
		panel?.list.empty();
		panel?.list.createDiv({
			cls: "pdf-annotations-filter-message",
			text: message,
		});
	}

	/** One ticked row: the checkbox, and whatever is to be shown beside it. */
	private addOption(
		list: HTMLElement,
		chosen: Set<string>,
		value: string,
		onChange?: () => void
	): OptionRow {
		const row = list.createEl("label", {
			cls: "pdf-annotations-filter-option",
		});
		const box = row.createEl("input", { type: "checkbox" });
		box.checked = chosen.has(value);
		box.addEventListener("change", () => {
			if (box.checked) {
				chosen.add(value);
			} else {
				chosen.delete(value);
			}
			onChange?.();
		});
		return { row, box };
	}

	/**
	 * Reads the PDF and fills both lists. Started as soon as one is named rather
	 * than when a list opens, into panels still closed until then.
	 */
	private async prepare(): Promise<void> {
		const loaded = await this.ensureLoaded();
		if (!loaded) return;

		this.showDays(loaded);
		this.showColors(loaded);
	}

	private showDays(loaded: LoadedAnnotations): void {
		const days = daysOfAnnotations(loaded.annotations);
		this.chosenDays ??= new Set(days);

		if (days.length === 0) {
			this.showMessage(this.dates, t.MODAL_DATES_NONE);
			return;
		}

		const list = this.dates?.list;
		if (!list) return;
		list.empty();
		this.dayRows.clear();
		for (const day of days) {
			const option = this.addOption(list, this.chosenDays, day, () =>
				this.muteUnmatchedColors()
			);
			this.dayRows.set(day, option);
			// The PDF dated it not at all, which is a thing a reader may want
			// to leave out like any other day.
			option.row.createSpan({
				text: day ? readableDay(day) : t.NOTE_NO_DATE,
			});
		}

		// The types may already have been narrowed before the file was named,
		// so the list is greyed the moment it is drawn.
		this.muteUnmatchedDays();
	}

	/**
	 * The annotations still standing at one point along the window's chain: the
	 * annotation types rule the days, and the types and the days together rule
	 * the colours. `throughDays` says how far along it the question is asked
	 * from — a list is ruled by what stands before it, never by itself or by
	 * what comes after, or narrowing it would narrow the thing doing the
	 * narrowing.
	 *
	 * Run through the extraction's own filter rather than a rule of its own, so
	 * what a list greys out is exactly what the extraction would find nothing
	 * for. The pages are left out of it: that field is free text, read only when
	 * the extraction is asked for, and half a page expression is not an answer
	 * to grey a row out over.
	 */
	private keptThrough(throughDays: boolean): PDFAnnotation[] {
		const annotations = this.loaded?.result.annotations ?? [];
		return filterAnnotations(annotations, {
			pages: PageSelection.parse("").selection,
			byPageLabel: this.byPageLabel,
			days: throughDays && this.byDate ? this.chosenDays : null,
			colors: null,
			subtypes: this.chosenSubtypes,
		});
	}

	/**
	 * Puts the entries nothing is left to extract in beyond reach: greyed out,
	 * unticked and not to be ticked. What stands before them in the chain has
	 * emptied them, so they are not entries this extraction has to offer, and
	 * offering one would be offering nothing.
	 *
	 * Greyed rather than dropped, because the choice that emptied it is a row or
	 * two up in the same window: a list that lost rows as it was narrowed would
	 * give the reader no way to see what taking a type back would bring back.
	 *
	 * `chosen` goes on holding what the reader ticked rather than what is left
	 * to tick, so an entry that fills again comes back as they had it — and one
	 * they unticked themselves stays unticked.
	 */
	private mute(
		rows: Map<string, OptionRow>,
		matching: Set<string>,
		chosen: Set<string> | null
	): void {
		for (const [value, { row, box }] of rows) {
			const matches = matching.has(value);
			row.toggleClass("pdf-annotations-unmatched", !matches);
			box.disabled = !matches;
			// The rows exist, so the ticked set does too; the fallback is for
			// the type, which cannot see that.
			box.checked = matches && (chosen?.has(value) ?? false);
		}
	}

	/** The days the annotation types have left something in. */
	private muteUnmatchedDays(): void {
		if (this.dayRows.size === 0) return;

		const kept = this.keptThrough(false);
		this.mute(
			this.dayRows,
			new Set(daysOfAnnotations(kept)),
			this.chosenDays
		);
	}

	/** The colours the annotation types and the days have left something in. */
	private muteUnmatchedColors(): void {
		if (this.colorRows.size === 0) return;

		const kept = this.keptThrough(true);
		this.mute(
			this.colorRows,
			new Set(colorsOfAnnotations(kept)),
			this.chosenColors
		);
	}

	/**
	 * The colours this PDF turns out to hold, each shown as itself. There is no
	 * palette to list them from: what a colour is called and which ones a reader
	 * has to pick between are their app's, not the PDF format's, so the list can
	 * only be made from the file in hand.
	 */
	private showColors(loaded: LoadedAnnotations): void {
		const colors = colorsOfAnnotations(loaded.annotations);
		this.chosenColors ??= new Set(colors);

		if (colors.length === 0) {
			this.showMessage(this.colors, t.MODAL_COLORS_NONE);
			return;
		}

		const list = this.colors?.list;
		if (!list) return;
		list.empty();
		this.colorRows.clear();
		for (const color of colors) {
			const option = this.addOption(list, this.chosenColors, color);
			this.colorRows.set(color, option);
			if (color === NO_COLOR) {
				// Nothing to show a swatch of, and a colour to leave out like
				// any other. Named rather than shown, so it is given a row of
				// the grid to itself rather than a cell one word wide — and it
				// comes last, where a full-width row leaves no gap behind it.
				option.row.addClass("pdf-annotations-filter-option-wide");
				option.row.createSpan({ text: t.MODAL_COLOR_NONE });
				continue;
			}

			// The one thing about a swatch that cannot be a class: the colour
			// is read out of the PDF, so it is passed in as a custom property
			// the stylesheet paints with.
			const swatch = option.row.createSpan({
				cls: "pdf-annotations-color-swatch",
			});
			swatch.setCssProps({ "--pdf-annotations-swatch": color });
			// The block is the whole label — a reader picks the colour they
			// marked with by eye, and a row of hex codes is not that. It is
			// still what the colour is called, so it stays as the row's name
			// for a hover and for anything reading the modal aloud.
			option.row.setAttr("aria-label", color);
		}

		// The types and the days may already have been narrowed before the file
		// was named, so the list is greyed the moment it is drawn.
		this.muteUnmatchedColors();
	}

	private async extract(): Promise<void> {
		const { selection, invalid } = PageSelection.parse(this.pages);
		// Extracting only the pages that were understood is the wrong
		// extraction, not a smaller one.
		if (invalid.length > 0) {
			new Notice(`${t.NOTICE_PAGES_UNREADABLE}: ${invalid.join(", ")}`);
			return;
		}

		const loaded = await this.ensureLoaded();
		if (!loaded) return;

		const annotations = filterAnnotations(loaded.annotations, {
			pages: selection,
			byPageLabel: this.byPageLabel,
			days: this.byDate ? this.chosenDays : null,
			colors: this.byColor ? this.chosenColors : null,
			subtypes: this.chosenSubtypes,
		});
		// Here an empty note would mean the filters were narrowed too far,
		// which is worth saying rather than filing.
		if (annotations.length === 0) {
			new Notice(t.NOTICE_NOTHING_SELECTED);
			return;
		}

		// Asked for from the palette, so no note need be open. Checked before
		// closing: it is a choice to change, not an extraction to lose.
		const view =
			this.target === "current"
				? this.app.workspace.getActiveViewOfType(MarkdownView)
				: null;
		if (this.target === "current" && !view) {
			new Notice(t.NOTICE_NO_NOTE_TO_INSERT_INTO);
			return;
		}

		this.close();
		const extraction = { ...loaded, annotations };
		// The PDF was read when it was named, so what is left to wait for is
		// the writing — which a note per annotation makes a great deal of.
		const progress = new ExtractionProgress();
		try {
			progress.writing();
			if (view) {
				await this.plugin.insertLoadedAnnotations(extraction, view);
			} else {
				const written = await this.plugin.writeLoadedAnnotations(
					extraction,
					this.target === "separate",
					true,
					(note, notes) => progress.writing(note, notes)
				);
				// Nowhere to put the notes, and the write has said so.
				if (!written) {
					progress.stop();
					return;
				}
			}
			progress.succeed(annotations.length);
		} catch (error) {
			progress.stop();
			console.error(error);
			new Notice(t.NOTICE_EXTRACTION_FAILED);
		}
	}
}
