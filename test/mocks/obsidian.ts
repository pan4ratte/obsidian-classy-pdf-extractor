import { Workspace, Vault, MetadataCache, FileManager, UserEvent } from "obsidian";

/**
 * Enough of the base class for `src/settings.ts` to be imported: its setting tab
 * extends this, which is evaluated at import time. The tab's `display()` is not
 * exercised by the tests, so no DOM or `Setting` stub is needed.
 */
/**
 * `lang/helpers.ts` asks for the locale as it loads, to pick a translation.
 * The tests read English, which is what an unrecognised locale falls back to
 * anyway.
 */
export const moment = { locale: () => "en" };

export class PluginSettingTab {

	/** @public */
	app: App;

	/** @public */
	containerEl: HTMLElement;
}

/**
 * The other base class `src/settings.ts` extends at import time, for the
 * folder type-ahead. Its behaviour belongs to Obsidian's popover machinery and
 * is not exercised here either.
 */
export class AbstractInputSuggest<T> {

	/** @public */
	app: App;

	constructor(app: App, _textInputEl: HTMLInputElement) {
		this.app = app;
	}

	onSelect(_callback: (value: T, evt: MouseEvent | KeyboardEvent) => unknown): this {
		return this;
	}
}

export class App {

	/** @public */
	workspace: Workspace;

	/** @public */
	vault: Vault;
	/** @public */
	metadataCache: MetadataCache;

	/** @public */
	fileManager: FileManager;

	/** @public */
	pluginSettingTab: PluginSettingTab;

	/**
	* The last known user interaction event, to help commands find out what modifier keys are pressed.
	* @public
	*/
	lastEvent: UserEvent | null;
}

/**
 * `src/changelogModal.ts` extends `Modal` and holds a `Component`, both
 * evaluated when `src/settings.ts` imports it. The modal is never opened here,
 * so neither class needs behaviour — `MarkdownRenderer` is not even reached.
 */
export class Modal {

	/** @public */
	app: App;

	/** @public */
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
	}
}

export class Component {
}

export const MarkdownRenderer = {
	render: () => Promise.resolve(),
};
