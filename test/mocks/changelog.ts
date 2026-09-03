/**
 * Stands in for `CHANGELOG.md` and `CHANGELOG_RU.md`, which `lang/helpers.ts`
 * imports as text. esbuild's ".md" loader does that for the bundle; ts-jest has
 * no such loader, so `moduleNameMapper` sends both imports here. Nothing under
 * test reads the changelog — only that the import resolves matters.
 */
export default "";
