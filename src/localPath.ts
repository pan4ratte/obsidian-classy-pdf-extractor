/**
 * A path as it arrives from wherever it was copied, made into the path of a
 * file.
 *
 * Three things stand between the two, all of them written by whatever did the
 * copying rather than by the reader:
 *
 * - **Quotes.** Windows' "Copy as path" puts the path inside them.
 * - **Shell escapes.** A path copied on a Mac — out of Calibre, or dragged into
 *   Terminal — comes with a backslash before every space, comma, apostrophe and
 *   bracket: `/Users/me/Inghrem\ M.\ A.\,\ Alikin/...`. Read as it stands, that
 *   names a folder called `Inghrem\ M.\` which does not exist. Only a POSIX path
 *   is unescaped: there a backslash cannot be a separator, while in a Windows
 *   path it is nothing else. A quoted path is left as quoted, since the quotes
 *   are what already said the characters are meant as written.
 * - **A `file://` URL**, which is the path percent-encoded.
 *
 * The surrounding whitespace goes too — a path copied out of a terminal often
 * carries the line ending after it.
 */
export function pathFromClipboard(raw: string): string {
	const trimmed = raw.trim();
	const quoted = /^(["']).*\1$/.test(trimmed);
	let path = trimmed.replace(/^["']|["']$/g, "");

	if (/^file:\/\//i.test(path)) {
		try {
			// `file:///C:/x` is a Windows path, `file:///Users/x` a POSIX one.
			path = decodeURIComponent(path.replace(/^file:\/\//i, ""));
			if (/^\/[a-zA-Z]:\//.test(path)) path = path.slice(1);
		} catch {
			// A malformed escape: the path is left as pasted, and the loader
			// says it could not be read.
		}
		return path;
	}

	if (!quoted && /^[/~]/.test(path)) path = path.replace(/\\(.)/g, "$1");
	return path;
}
