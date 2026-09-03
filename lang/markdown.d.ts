/**
 * `helpers.ts` imports the changelogs as text. esbuild's ".md" loader turns
 * each one into a string export at build time; this is what tells `tsc` so.
 * Jest resolves them through `moduleNameMapper` instead — the same shape.
 */
declare module "*.md" {
    const content: string;
    export default content;
}
