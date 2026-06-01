type ClassNameMap = Map<string, string>;
declare function createClassNameMap(rootDir: string): ClassNameMap;
declare function rewriteCssClassTokens(contents: string, classNameMap: ClassNameMap): string;
declare function rewriteSelectorValue(value: string, classNameMap: ClassNameMap): string;
declare function rewriteClassListValue(value: string, classNameMap: ClassNameMap): string;
declare function rewriteCodeClassTokens(args: {
    classNameMap: ClassNameMap;
    contents: string;
    filePath: string;
}): string;
export { createClassNameMap, rewriteCodeClassTokens, rewriteCssClassTokens, rewriteClassListValue, rewriteSelectorValue, };
export type { ClassNameMap };
//# sourceMappingURL=obfuscation.d.ts.map