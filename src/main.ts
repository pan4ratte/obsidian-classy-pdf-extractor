import {
	compile as compileTemplate,
	TemplateDelegate as Template,
} from "handlebars";
import {
	Editor,
	FileSystemAdapter,
	loadPdfJs,
	MarkdownView,
	Platform,
	Plugin,
	TFile,
	Vault,
	Notice,
} from "obsidian";
import { t } from "lang/helpers";
import { loadPDFFile } from "src/extractHighlight";
import {
	cleanNoteName,
	DEFAULT_DESIRED_ANNOTATIONS,
	PDFAnnotationPluginSetting,
	PDFAnnotationPluginSettingTab,
	resolveNotePath,
} from "src/settings";
import { compareAnnotations } from "src/ordering";
import { takeTagsFromAnnotations } from "src/tags";
import { assignTopics, takeTopicForNoteName } from "src/topics";
import {
	asIndexable,
	FileMeta,
	LoadedAnnotations,
	PDFAnnotation,
	PDFFile,
	PDFJsLib,
	ProgressReport,
} from "src/types";
import { AdvancedExtractionModal } from "src/advancedExtractionModal";
import { ExtractionProgress } from "src/progress";

import { PDFAnnotationPluginFormatter } from "./formatter";

/**
 * The two things this plugin asks of Node's `fs`: what a path the reader pasted
 * names, and — when it names a folder — what is in it.
 *
 * Described here rather than taken from `typeof import("fs")`, which is only a
 * type where `@types/node` is installed. It is a devDependency, so a checkout
 * that installs none — a reviewer's, a CI job that lints without building —
 * resolves it to `any`, and that `any` then spreads through every call made on
 * it. Naming the methods used costs four lines and depends on nothing.
 */
interface NodeFileSystem {
	statSync(path: string): { isFile(): boolean; isDirectory(): boolean };
	readdirSync(path: string): string[];
}

/**
 * The loader Obsidian's CommonJS bundle is handed. Declared for the same
 * reason as the interface above: without `@types/node` the name resolves to
 * nothing at all, and a call on an unresolved name is unsafe by definition.
 * Declaring it emits nothing — at run time this is Electron's own `require`,
 * reached only behind the desktop guard that precedes every use.
 */
declare const require: (id: string) => unknown;

/** When a name template and the PDF's own name both render nothing usable. */
const FALLBACK_NOTE_NAME = "Annotations";

/** The quotes a path copied from a file manager arrives inside. */
function unquotedPath(path: string): string {
	return path.replace(/^["']|["']$/g, "");
}

/**
 * A name onto the folder holding it, written with the separator the pasted path
 * already uses — a Windows path stays a Windows path, and a trailing slash on
 * the folder does not double up.
 */
function joinPath(folder: string, name: string): string {
	const trimmed = folder.replace(/[\\/]+$/, "");
	return `${trimmed}${trimmed.includes("\\") ? "\\" : "/"}${name}`;
}

/** The last step of a path, however the path spells its separators. */
function fileNameOf(path: string): string {
	return path.split(/[\\/]/).last() ?? path;
}

/** What a read of several PDFs came to, all of them together. */
function countAnnotations(loaded: LoadedAnnotations[]): number {
	return loaded.reduce((total, one) => total + one.annotations.length, 0);
}

export default class PDFAnnotationPlugin extends Plugin {
	public settings: PDFAnnotationPluginSetting;
	public formatter: PDFAnnotationPluginFormatter;

	// Template compilation options
	private templateSettings = {
		noEscape: true,
	};

	sort(grandtotal: PDFAnnotation[]) {
		const settings = this.settings;

		// Independent of the headings: grouping decides whether the line stays
		// in the body, not whether it is read.
		assignTopics(grandtotal, settings.sortByTopic);

		grandtotal.sort(compareAnnotations(settings, grandtotal));
	}

	/**
	 * Reads one PDF in the vault without writing anything — the advanced
	 * extraction needs the annotations long before it knows which to write.
	 * It asks for every type, so ticking one off needs no second read.
	 */
	async loadAnnotationsFromVaultFile(
		pdfFile: TFile,
		desiredAnnotations: string[] = this.settings.desiredAnnotations,
		progress?: ExtractionProgress
	): Promise<LoadedAnnotations> {
		const pdfjsLib = (await loadPdfJs()) as PDFJsLib;
		const containingFolder = pdfFile.parent.name;
		const grandtotal: PDFAnnotation[] = [];
		const content = await this.app.vault.readBinary(pdfFile);
		await loadPDFFile(
			PDFFile.convertTFileToPDFFile(pdfFile, content),
			pdfjsLib,
			containingFolder,
			grandtotal,
			desiredAnnotations,
			this.settings.subfolderPerSection,
			this.settings.footnoteMarks,
			(page, pages) => progress?.reading(pdfFile.name, page, pages)
		);
		return {
			fileMeta: pdfFile,
			annotations: grandtotal,
			isExternalFile: false,
		};
	}

	/**
	 * Into the note being edited, for the advanced extraction — which is asked
	 * for from the palette and so reaches this without an editor of its own.
	 */
	async insertLoadedAnnotations(
		loaded: LoadedAnnotations,
		view: MarkdownView
	): Promise<void> {
		this.sort(loaded.annotations);
		await this.insertIntoNote(
			view.editor,
			view,
			loaded.annotations,
			loaded.isExternalFile
		);
	}

	/**
	 * Sorts and files what an extraction gathered, however it was gathered.
	 * `openIt` is what an extraction spanning several PDFs turns off: the note
	 * of every one of them opening at once buries the vault.
	 *
	 * False when there was nowhere to put the notes, which is the one way this
	 * comes back having written none — and not a thing to report as a finished
	 * extraction.
	 */
	async writeLoadedAnnotations(
		loaded: LoadedAnnotations,
		onePerAnnotation = false,
		openIt = true,
		onNote?: ProgressReport,
		written = new Set<string>()
	): Promise<boolean> {
		this.sort(loaded.annotations);
		return await this.writeNotes(
			loaded.fileMeta,
			loaded.annotations,
			loaded.isExternalFile,
			onePerAnnotation,
			openIt,
			onNote,
			written
		);
	}

	async loadSinglePDFFile(pdfFile: TFile, onePerAnnotation = false) {
		const progress = new ExtractionProgress();
		try {
			const loaded = await this.loadAnnotationsFromVaultFile(
				pdfFile,
				undefined,
				progress
			);
			progress.writing();
			const written = await this.writeLoadedAnnotations(
				loaded,
				onePerAnnotation,
				true,
				(note, notes) => progress.writing(note, notes)
			);
			// Nowhere to put them, which the write said so itself. Nothing was
			// extracted anywhere, so nothing is reported as having been.
			if (!written) {
				progress.stop();
				return;
			}
			progress.succeed(loaded.annotations.length);
		} catch (error) {
			// The command that asked says what went wrong; the bar only has to
			// stop claiming the extraction is still running.
			progress.stop();
			throw error;
		}
	}
	/**
	 * Into the note's own properties rather than a front matter block in its
	 * text, which further down a note is text like any other. Existing tags
	 * are kept.
	 */
	private async addTagsToNoteProperties(
		note: TFile,
		tags: string[]
	): Promise<void> {
		if (tags.length === 0) return;

		await this.app.fileManager.processFrontMatter(note, (frontmatter) => {
			const properties = frontmatter as Record<string, unknown>;
			const existing = properties.tags;
			const kept = Array.isArray(existing)
				? existing.map(String)
				: typeof existing === "string" && existing.length > 0
					? [existing]
					: [];

			properties.tags = [...new Set([...kept, ...tags])];
		});
	}

	/**
	 * Inserts at the cursor instead of making a note. The tags go to that
	 * note's properties, so what was inserted is saved first — properties are
	 * written to the note on disk, over anything still unsaved in the editor.
	 */
	private async insertIntoNote(
		editor: Editor,
		view: MarkdownView,
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean
	): Promise<void> {
		// Everything gathered goes into the one note being edited, which is a
		// single note as far as the setting is concerned.
		const tags = this.settings.extractsTags(false)
			? takeTagsFromAnnotations(grandtotal)
			: [];

		editor.replaceSelection(
			this.formatter.format(grandtotal, isExternalFile)
		);

		const note = view.file;
		if (tags.length === 0 || !note) return;

		await view.save();
		await this.addTagsToNoteProperties(note, tags);
	}

	private async writeNotes(
		fileMeta: FileMeta,
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean,
		onePerAnnotation = false,
		openIt = true,
		onNote?: ProgressReport,
		written = new Set<string>()
	): Promise<boolean> {
		if (!this.hasSomewhereToWriteNotes()) return false;

		const currentFolder = this.currentFolder();
		const extractTags = this.settings.extractsTags(onePerAnnotation);

		// Every annotation of one read came out of the same PDF, so the first
		// of them speaks for the file. A read with nothing in it still writes
		// its note, and that note's name has no folder to go by.
		const pdfFolder = grandtotal[0]?.folder ?? "";

		/** Taken out before rendering, so a tag lands in the properties only. */
		const takeTags = (annotations: PDFAnnotation[]) =>
			extractTags ? takeTagsFromAnnotations(annotations) : [];

		/**
		 * A note this extraction has already written is one to add to, never
		 * one to overwrite. Two annotations can perfectly well name the same
		 * note — a note per annotation named `{{topic}}` writes every
		 * annotation of one topic to it, and a folder of PDFs can name one
		 * note between them — and overwriting there leaves the last of them
		 * and silently loses the rest. `overwriteExistingNote` is about the
		 * note that was there before the extraction began.
		 */
		const overwriting = (path: string) =>
			this.settings.overwriteExistingNote && !written.has(path);

		if (onePerAnnotation) {
			// Written one after another: concurrent writes to the same note (when
			// the note name lacks {{counter}}) would race each other.
			for (const [index, anno] of grandtotal.entries()) {
				const counter = index + 1;
				const tags = takeTags([anno]);
				// What names the note it need not also say inside. Grouping by
				// topic has already taken the line out of the body.
				const topic = this.settings.topicToNoteName
					? takeTopicForNoteName(anno, !this.settings.sortByTopic)
					: null;
				const note = this.formatter.format(
					[anno],
					isExternalFile,
					true
				);
				const fileNameOfNote =
					(topic === null
						? this.getResolvedOneNotePerAnnotationName(
								fileMeta,
								counter,
								anno,
								isExternalFile
							)
						: this.usableNoteName(
								topic,
								this.getResolvedNoTopicName(fileMeta, counter)
							)) + ".md";
				const filePathOfNote = this.getResolvedNotePath(fileMeta, currentFolder, fileNameOfNote, pdfFolder, true, anno);
				// A note per annotation is a great many notes; opening each of
				// them buries whatever the reader was looking at.
				const noteFile = await this.saveHighlightsToFile(filePathOfNote, note, overwriting(filePathOfNote), false);
				if (noteFile) {
					written.add(filePathOfNote);
					await this.addTagsToNoteProperties(noteFile, tags);
				}
				onNote?.(counter, grandtotal.length);
			}
		} else {
			const tags = takeTags(grandtotal);
			const finalMarkdown = this.formatter.format(grandtotal, isExternalFile);
			const fileNameOfNote =
				this.getResolvedNoteName(fileMeta, pdfFolder) + ".md";
			const filePathOfNote = this.getResolvedNotePath(fileMeta, currentFolder, fileNameOfNote, pdfFolder, false);
			const noteFile = await this.saveHighlightsToFile(filePathOfNote, finalMarkdown, overwriting(filePathOfNote), openIt);
			if (noteFile) {
				written.add(filePathOfNote);
				await this.addTagsToNoteProperties(noteFile, tags);
			}
		}
		return true;
	}

	/**
	 * Notes following the current file need one to follow, and the clipboard
	 * commands need nothing open. Falling back to the vault root would quietly
	 * scatter notes nobody asked for, so the extraction says so and stops.
	 *
	 * Asked once for an extraction spanning several PDFs, and again by each note
	 * it writes: the answer is the same for all of them, and the reader should
	 * hear it once.
	 */
	private hasSomewhereToWriteNotes(): boolean {
		if (
			this.settings.noteLocation === "current" &&
			!this.app.workspace.getActiveFile()
		) {
			new Notice(t.NOTICE_NO_CURRENT_FILE);
			return false;
		}
		return true;
	}

	/** Folder of the file being looked at; empty for the root or nothing open. */
	private currentFolder(): string {
		return this.app.workspace.getActiveFile()?.parent?.path ?? "";
	}

	/** Says why a path from outside the vault cannot be read, and reads none. */
	private noticeLocalPathsAreDesktopOnly(): null {
		new Notice(t.NOTICE_PATH_DESKTOP_ONLY);
		return null;
	}

	/**
	 * Node's fs, or nothing where there is none — and the reader told why.
	 * `isDesktop` only means the UI is in desktop mode; the module exists solely
	 * in the Electron app.
	 *
	 * The one place it is asked for. require() because esbuild leaves a bare
	 * import() in the CJS bundle, which Obsidian's loader cannot always resolve,
	 * and the guard opens this call because that is where the rule against Node
	 * modules on mobile looks for it.
	 */
	private localFileSystem(): NodeFileSystem | null {
		if (!Platform.isDesktop) return this.noticeLocalPathsAreDesktopOnly();
		if (!Platform.isDesktopApp)
			return this.noticeLocalPathsAreDesktopOnly();

		return require("fs") as NodeFileSystem;
	}

	/**
	 * Reads one PDF from outside the vault. The path is absolute and already
	 * unquoted, and anything wrong with it is thrown rather than reported here:
	 * a folder of PDFs is read one file at a time, and one unreadable file is
	 * not the whole folder.
	 */
	private async readExternalPDF(
		filePath: string,
		desiredAnnotations: string[],
		onPage?: ProgressReport
	): Promise<LoadedAnnotations> {
		const pdfjsLib = (await loadPdfJs()) as PDFJsLib;
		const binaryContent = await FileSystemAdapter.readLocalFile(filePath);
		const filePathWithSlashs: string = filePath.replace(/\\/g, "/");
		const filePathSplits: string[] = filePathWithSlashs.split("/");
		const fileName = filePathSplits.last();
		const extension = fileName.split(".").last();
		const encodedFilePath = encodeURI("file://" + filePath);
		const pdfFile = new PDFFile(
			fileName,
			binaryContent,
			extension,
			encodedFilePath
		);
		const containingFolder = filePathWithSlashs.slice(
			0,
			filePathWithSlashs.lastIndexOf("/")
		);
		const annotations: PDFAnnotation[] = [];
		await loadPDFFile(
			pdfFile,
			pdfjsLib,
			containingFolder,
			annotations,
			desiredAnnotations,
			this.settings.subfolderPerSection,
			this.settings.footnoteMarks,
			onPage
		);
		return { fileMeta: pdfFile, annotations, isExternalFile: true };
	}

	/**
	 * The one PDF a path names, for the callers that can only be asking about
	 * one — the advanced extraction, which filters the pages and days of a
	 * single file.
	 */
	async loadAnnotationsFromExternalFile(
		filePathFromClipboard: string,
		desiredAnnotations: string[] = this.settings.desiredAnnotations,
		progress?: ExtractionProgress
	): Promise<LoadedAnnotations | null> {
		const fs = this.localFileSystem();
		if (fs === null) return null;

		try {
			const filePath = unquotedPath(filePathFromClipboard);
			if (!fs.statSync(filePath).isFile()) {
				new Notice(t.NOTICE_PATH_NOT_A_FILE);
				return null;
			}
			return await this.readExternalPDF(
				filePath,
				desiredAnnotations,
				(page, pages) =>
					progress?.reading(fileNameOf(filePath), page, pages)
			);
		} catch (error) {
			new Notice(t.NOTICE_PATH_UNREADABLE);
			console.error(error);
			return null;
		}
	}

	/**
	 * Every PDF a path in the clipboard named: the one file, or the PDFs the
	 * folder holds — the folder itself and not the folders under it, since what
	 * was pasted is what is read.
	 *
	 * They come back one entry per file rather than gathered into a single list:
	 * a note name is a template over the file it was read from, so a folder
	 * writes a note per PDF.
	 */
	async loadAnnotationsFromClipboardPath(
		pathFromClipboard: string,
		desiredAnnotations: string[] = this.settings.desiredAnnotations,
		progress?: ExtractionProgress
	): Promise<LoadedAnnotations[]> {
		const fs = this.localFileSystem();
		if (fs === null) return [];

		let names: string[];
		let folder: string;
		try {
			const path = unquotedPath(pathFromClipboard);
			const stats = fs.statSync(path);
			if (stats.isFile()) {
				// One PDF, so its pages are what there is to count.
				return [
					await this.readExternalPDF(
						path,
						desiredAnnotations,
						(page, pages) =>
							progress?.reading(fileNameOf(path), page, pages)
					),
				];
			}
			if (!stats.isDirectory()) {
				new Notice(t.NOTICE_PATH_NOT_A_FILE_OR_FOLDER);
				return [];
			}
			folder = path;
			names = fs
				.readdirSync(path)
				.filter((name) => name.toLowerCase().endsWith(".pdf"))
				.sort();
		} catch (error) {
			new Notice(t.NOTICE_PATH_UNREADABLE);
			console.error(error);
			return [];
		}

		if (names.length === 0) {
			new Notice(t.NOTICE_FOLDER_HAS_NO_PDFS);
			return [];
		}

		// One after another rather than all at once: a folder holds as many PDFs
		// as it holds, and every one of them is read into memory whole.
		const loaded: LoadedAnnotations[] = [];
		for (const [index, name] of names.entries()) {
			// The files are what is counted here, not the pages inside them: a
			// bar that ran to the end and started again with every PDF would
			// say nothing about how much of the folder was left.
			progress?.reading(name, index, names.length);
			try {
				loaded.push(
					await this.readExternalPDF(
						joinPath(folder, name),
						desiredAnnotations
					)
				);
			} catch (error) {
				// The rest of the folder is still worth reading, so the file
				// that would not open is named and left out.
				new Notice(`${t.NOTICE_FILE_SKIPPED}: ${name}`);
				console.error(error);
			}
		}
		return loaded;
	}

	/**
	 * Notes for every PDF a path in the clipboard named. Nothing is opened when
	 * a folder wrote more than one note — a folder's worth of notes opening at
	 * once buries whatever the reader was looking at.
	 */
	private async writeAnnotationsFromClipboardPath(
		onePerAnnotation: boolean
	): Promise<void> {
		// Before the reading rather than after it: a folder of PDFs is a long
		// wait for notes that have nowhere to go.
		if (!this.hasSomewhereToWriteNotes()) return;

		const clipText = await navigator.clipboard.readText();
		const progress = new ExtractionProgress();
		try {
			const loaded = await this.loadAnnotationsFromClipboardPath(
				clipText,
				undefined,
				progress
			);
			// Nothing to write, and the reason already said by the loader.
			if (loaded.length === 0) {
				progress.stop();
				return;
			}

			// One set of written notes for the whole read: two of its PDFs
			// naming one note between them fill it in together.
			const writtenNotes = new Set<string>();
			for (const [index, one] of loaded.entries()) {
				progress.writing(index, loaded.length);
				const written = await this.writeLoadedAnnotations(
					one,
					onePerAnnotation,
					loaded.length === 1,
					undefined,
					writtenNotes
				);
				if (!written) {
					progress.stop();
					return;
				}
			}
			progress.succeed(countAnnotations(loaded));
		} catch (error) {
			progress.stop();
			console.error(error);
			new Notice(t.NOTICE_EXTRACTION_FAILED);
		}
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PDFAnnotationPluginSettingTab(this.app, this));

		this.formatter = new PDFAnnotationPluginFormatter(this.settings);

		this.addCommand({
			id: "extract-annotations-single",
			name: t.COMMAND_EXTRACT_CURRENT_FILE,
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file != null && file.extension === "pdf") {
					if (!checking) {
						// load file if (not only checking) && conditions are valid
						this.loadSinglePDFFile(file).catch((error) => {
							console.error(error);
							new Notice(t.NOTICE_EXTRACTION_FAILED);
						});
					}
					return true;
				} else {
					return false;
				}
			},
		});

		// A command rather than a setting, so the choice is made where the
		// extraction is asked for.
		this.addCommand({
			id: "extract-annotations-single-per-annotation",
			name: t.COMMAND_EXTRACT_CURRENT_FILE_PER_ANNOTATION,
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file != null && file.extension === "pdf") {
					if (!checking) {
						this.loadSinglePDFFile(file, true).catch((error) => {
							console.error(error);
							new Notice(t.NOTICE_EXTRACTION_FAILED);
						});
					}
					return true;
				} else {
					return false;
				}
			},
		});

		// Nothing need be open: which PDF to read is one of the modal's
		// questions rather than something decided before the command ran.
		this.addCommand({
			id: "extract-annotations-advanced",
			name: t.COMMAND_EXTRACT_ADVANCED,
			callback: () => {
				new AdvancedExtractionModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const progress = new ExtractionProgress();
				try {
					const loaded =
						await this.loadAnnotationsFromClipboardPath(
							clipText,
							undefined,
							progress
						);
					if (loaded.length === 0) {
						progress.stop();
						return;
					}

					// One insertion however many PDFs were read: the note being
					// edited is the one place all of it goes.
					progress.writing();
					const grandtotal = loaded.flatMap((one) => one.annotations);
					this.sort(grandtotal);
					await this.insertIntoNote(editor, view, grandtotal, true);
					progress.succeed(grandtotal.length);
				} catch (error) {
					progress.stop();
					console.error(error);
					new Notice(t.NOTICE_EXTRACTION_FAILED);
				}
			},
		});

		// A command of its own, so a PDF outside the vault reaches a new note
		// without one open to insert into first.
		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path-to-note",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH_TO_NOTE,
			callback: async () => {
				await this.writeAnnotationsFromClipboardPath(false);
			},
		});

		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path-per-annotation",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH_PER_ANNOTATION,
			callback: async () => {
				await this.writeAnnotationsFromClipboardPath(true);
			},
		});

		this.addCommand({
			id: "extract-annotations",
			name: t.COMMAND_EXTRACT_CURRENT_FOLDER,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const file = this.app.workspace.getActiveFile();
				if (file == null) return;
				const folder = file.parent;
				const grandtotal: PDFAnnotation[] = []; // array that will contain all fetched Annotations
				const desiredAnnotations = this.settings.desiredAnnotations;

				const pdfjsLib = (await loadPdfJs()) as PDFJsLib;

				// Gathered before any is read, so there is a number to count
				// against. `recurseChildren` visits them all before it returns.
				const pdfs: TFile[] = [];
				Vault.recurseChildren(folder, (child) => {
					if (child instanceof TFile && child.extension === "pdf") {
						pdfs.push(child);
					}
				});

				const progress = new ExtractionProgress();
				try {
					// All at once, as before. So what is counted is how many
					// have been read rather than which one is being read —
					// they are all being read.
					let read = 0;
					await Promise.all(
						pdfs.map(async (pdf) => {
							const content =
								await this.app.vault.readBinary(pdf);
							await loadPDFFile(
								PDFFile.convertTFileToPDFFile(pdf, content),
								pdfjsLib,
								pdf.parent.name,
								grandtotal,
								desiredAnnotations,
								false,
								this.settings.footnoteMarks
							);
							progress.reading(pdf.name, ++read, pdfs.length);
						})
					);

					progress.writing();
					this.sort(grandtotal);
					await this.insertIntoNote(
						editor,
						view,
						grandtotal,
						false
					);
					progress.succeed(grandtotal.length);
				} catch (error) {
					progress.stop();
					console.error(error);
					new Notice(t.NOTICE_EXTRACTION_FAILED);
				}
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = new PDFAnnotationPluginSetting();
		const loadedSettings = (await this.loadData()) as
			| Record<string, unknown>
			| null;
		if (!loadedSettings) return;

		// Every field the settings object declares, so a new setting cannot be
		// forgotten here and silently never load.
		Object.keys(this.settings).forEach((setting) => {
			if (!(setting in loadedSettings)) return;
			// A field this version declares as a toggle and data.json holds as
			// something else keeps the default: 1.1 wrote `fileHeading` as the
			// dropdown the folder and file toggles replaced, and every string
			// it could have written — `"none"` included — is truthy.
			if (
				typeof asIndexable(this.settings)[setting] === "boolean" &&
				typeof loadedSettings[setting] !== "boolean"
			) {
				return;
			}
			asIndexable(this.settings)[setting] = loadedSettings[setting];
		});

		// data.json is a file a reader may edit, so nothing loaded from it is
		// taken on trust: a value none of these knows falls back to the default.
		const settings = PDFAnnotationPluginSetting;
		this.settings.desiredAnnotations =
			settings.normalizeDesiredAnnotations(
				this.settings.desiredAnnotations
			) ?? [...DEFAULT_DESIRED_ANNOTATIONS];
		this.settings.annotationTemplates =
			settings.normalizeAnnotationTemplates(
				this.settings.annotationTemplates
			);
		this.settings.noteLocation = settings.normalizeNoteLocation(
			this.settings.noteLocation
		);
		this.settings.extractTags = settings.normalizeTagExtraction(
			this.settings.extractTags
		);
		this.settings.paragraphSeparation =
			settings.normalizeParagraphSeparation(
				this.settings.paragraphSeparation
			);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onunload() {}

	get noteNameTemplate(): Template {
		return compileTemplate(this.settings.noteName, this.templateSettings);
	}

	get oneNotePerAnnotationNameTemplate(): Template {
		return compileTemplate(this.settings.oneNotePerAnnotationName, this.templateSettings);
	}

	/**
	 * `folder` is the annotations' own, so `{{folder}}` names the same place
	 * here as it does inside a template. It is empty when the read found
	 * nothing to say where it came from.
	 */
	getTemplateVariablesForNoteName(
		file: FileMeta,
		folder = ""
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename,
			folder: folder,
		};

		return { file: file, ...shortcuts };
	}

	getTemplateVariablesForOneNotePerAnnotationName(
		file: FileMeta,
		counter: number,
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename,
			counter: counter,
		};

		// The note holds one annotation, so its own variables name it as well
		// as the PDF's do — {{topic}} above all.
		return {
			...this.formatter.getTemplateVariablesForAnnotation(
				annotation,
				isExternalFile
			),
			file: file,
			...shortcuts,
		};
	}

	/**
	 * A name the vault will take, whatever the template rendered. An empty one
	 * would write a hidden `.md` nobody finds, so a fallback stands in.
	 */
	private usableNoteName(rendered: string, fallback: string): string {
		return (
			cleanNoteName(rendered) ||
			cleanNoteName(fallback) ||
			FALLBACK_NOTE_NAME
		);
	}

	getResolvedNoteName(file: FileMeta, folder = ""): string {
		return this.usableNoteName(
			this.noteNameTemplate(
				this.getTemplateVariablesForNoteName(file, folder)
			),
			file.basename
		);
	}

	/**
	 * For an annotation with no comment to take a topic from — a highlight
	 * marked without a word. Numbered, or they would all be the one note.
	 */
	getResolvedNoTopicName(file: FileMeta, counter: number): string {
		return compileTemplate(t.NAME_NO_TOPIC, this.templateSettings)({
			filename: file.basename,
			counter: counter,
		});
	}

	getResolvedOneNotePerAnnotationName(
		file: FileMeta,
		counter: number,
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): string {
		return this.usableNoteName(
			this.oneNotePerAnnotationNameTemplate(
				this.getTemplateVariablesForOneNotePerAnnotationName(
					file,
					counter,
					annotation,
					isExternalFile
				)
			),
			// Renders nothing when what it asks of the annotation is absent —
			// `{{topic}}` for a highlight marked without a comment.
			this.getResolvedNoTopicName(file, counter)
		);
	}

	get noteSubfolderTemplate(): Template {
		return compileTemplate(
			this.settings.noteSubfolder,
			this.templateSettings
		);
	}

	getResolvedNoteSubfolder(file: FileMeta, folder = ""): string {
		if (!this.settings.noteSubfolder.trim()) return "";
		return this.noteSubfolderTemplate(
			this.getTemplateVariablesForNoteName(file, folder)
		);
	}

	/**
	 * The folders one note goes in under its destination: what the subfolder
	 * template renders, and under that the PDF's own section the annotation
	 * falls in, as deep as the outline nests it.
	 *
	 * A part that renders nothing is skipped rather than left as an empty step
	 * in the path — an annotation before the first heading of the document is
	 * in no section, and files beside the ones that are.
	 */
	private getResolvedSubfolders(
		pdfFile: FileMeta,
		folder: string,
		annotation?: PDFAnnotation
	): string {
		const parts = [this.getResolvedNoteSubfolder(pdfFile, folder)];
		if (this.settings.subfolderPerSection && annotation?.section) {
			parts.push(...annotation.section);
		}
		return parts.filter((part) => part.trim().length > 0).join("/");
	}

	/**
	 * `separateNotes` is the extraction that writes a note per annotation, and
	 * the only one the subfolders apply to: a subfolder is what keeps that many
	 * notes together, and an extraction writing the one note has nothing to
	 * keep together. `annotation` is that note's own, and what says which
	 * section of the PDF it came out of.
	 */
	getResolvedNotePath(
		pdfFile: FileMeta,
		currentFolder: string,
		fileNameOfNote: string,
		folder = "",
		separateNotes = false,
		annotation?: PDFAnnotation
	): string {
		return resolveNotePath(
			this.settings,
			currentFolder,
			fileNameOfNote,
			separateNotes
				? this.getResolvedSubfolders(pdfFile, folder, annotation)
				: ""
		);
	}

	/**
	 * The subfolder a template names need not exist yet, and `vault.create`
	 * will not make it. Anything already there is left alone.
	 *
	 * One level at a time, outermost first: the path may nest as deep as the
	 * PDF's outline does, and a folder is not made under a parent that is not
	 * there yet. False when a level could not be made and is not there — the
	 * note below it has nowhere to go, and writing it anyway fails deeper down,
	 * where the reason is no longer legible.
	 */
	private async createMissingFolders(filePath: string): Promise<boolean> {
		const lastSlash = filePath.lastIndexOf("/");
		if (lastSlash < 0) return true;

		let folder = "";
		for (const part of filePath.slice(0, lastSlash).split("/")) {
			folder = folder ? `${folder}/${part}` : part;
			if (this.app.vault.getFolderByPath(folder)) continue;

			try {
				await this.app.vault.createFolder(folder);
			} catch (error) {
				// Either another note of the same run made it in the meantime —
				// then it is there now and the rest of the path can go on — or
				// the vault refused the name, and nothing can be written under
				// it.
				if (!this.app.vault.getFolderByPath(folder)) {
					console.error(error);
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Returns the note it wrote, so its properties can be filled in afterwards,
	 * or null when the vault would not take the path.
	 */
	async saveHighlightsToFile(
		filePath: string,
		mdString: string,
		overwriteExistingNote: boolean,
		openIt: boolean
	): Promise<TFile | null> {
		if (!(await this.createMissingFolders(filePath))) {
			new Notice(t.NOTICE_NOTE_PATH_INVALID);
			return null;
		}

		// Every write here is one the vault can still refuse — a folder gone
		// between the two calls, a name the file system will not take — and a
		// refusal that escapes stops the whole extraction on one note.
		try {
			const fileExists = await this.app.vault.adapter.exists(filePath);
			if (fileExists) {
				if (overwriteExistingNote) {
					await this.app.vault.adapter.write(filePath, mdString);
				} else {
					await this.appendHighlightsToFile(filePath, mdString);
				}
				if (openIt) {
					await this.app.workspace.openLinkText(filePath, "", true);
				}
				return this.app.vault.getFileByPath(filePath);
			}

			const created = await this.app.vault.create(filePath, mdString);
			if (openIt) {
				await this.app.workspace.openLinkText(filePath, "", true);
			}
			return created;
		} catch (error) {
			console.error(error);
			new Notice(t.NOTICE_NOTE_PATH_INVALID);
			return null;
		}
	}

	async appendHighlightsToFile(filePath: string, note: string) {
		let existingContent = await this.app.vault.adapter.read(filePath);
		if (existingContent.length > 0) {
			existingContent = existingContent + "\r\r";
		}
		await this.app.vault.adapter.write(filePath, existingContent + note);
	}
}
