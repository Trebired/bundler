import fs from "node:fs";
import path from "node:path";
import generate from "@babel/generator";
import { parse, type ParserPlugin } from "@babel/parser";
import traverse from "@babel/traverse";
import type { File, JSXIdentifier, MemberExpression, StringLiteral, TemplateLiteral } from "@babel/types";

const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const CLASS_LIST_METHODS = new Set(["add", "contains", "remove", "replace", "toggle"]);
const SELECTOR_METHODS = new Set(["closest", "matches", "querySelector", "querySelectorAll"]);
const CLASS_NAME_HELPERS = new Set(["classNames", "classnames", "clsx", "cn"]);

type ClassNameMap = Map<string, string>;

function createClassNameMap(rootDir: string): ClassNameMap {
  const classNames = new Set<string>();

  for (const filePath of collectStyleFiles(rootDir)) {
    for (const className of extractClassNamesFromStyle(fs.readFileSync(filePath, "utf8"))) {
      classNames.add(className);
    }
  }

  return new Map(
    [...classNames]
      .sort()
      .map((className, index) => [className, toCompactClassName(index)]),
  );
}

function collectStyleFiles(rootDir: string): string[] {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop()!;

    let stats: fs.Stats;
    try {
      stats = fs.statSync(current);
    } catch {
      continue;
    }

    if (!stats.isDirectory()) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }

      const nextPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }

      if (STYLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(nextPath);
      }
    }
  }

  return files.sort();
}

function extractClassNamesFromStyle(contents: string): Set<string> {
  const classNames = new Set<string>();
  const pattern = /(^|[^a-zA-Z0-9_-])\.([_a-zA-Z][\w-]*)/g;

  for (const match of contents.matchAll(pattern)) {
    if (match[2]) {
      classNames.add(match[2]);
    }
  }

  return classNames;
}

function toCompactClassName(index: number): string {
  return `c${index.toString(36)}`;
}

function rewriteCssClassTokens(contents: string, classNameMap: ClassNameMap): string {
  if (classNameMap.size === 0) return contents;

  return contents.replace(/\.([_a-zA-Z][\w-]*)/g, (match, className: string) => {
    return classNameMap.has(className) ? `.${classNameMap.get(className)}` : match;
  });
}

function rewriteSelectorValue(value: string, classNameMap: ClassNameMap): string {
  if (classNameMap.size === 0) return value;

  return value.replace(/\.([_a-zA-Z][\w-]*)/g, (match, className: string) => {
    return classNameMap.has(className) ? `.${classNameMap.get(className)}` : match;
  });
}

function rewriteClassListValue(value: string, classNameMap: ClassNameMap): string {
  if (classNameMap.size === 0) return value;

  return value
    .split(/\s+/)
    .map((token) => classNameMap.get(token) || token)
    .join(" ");
}

function updateStringLiteral(node: StringLiteral, rewrite: (value: string) => string): boolean {
  const nextValue = rewrite(node.value);
  if (nextValue === node.value) return false;
  node.value = nextValue;
  return true;
}

function updateTemplateLiteral(node: TemplateLiteral, rewrite: (value: string) => string): boolean {
  if (node.expressions.length > 0 || node.quasis.length !== 1) return false;

  const quasi = node.quasis[0];
  const nextValue = rewrite(quasi.value.cooked || "");
  if (nextValue === (quasi.value.cooked || "")) return false;

  quasi.value.cooked = nextValue;
  quasi.value.raw = nextValue;
  return true;
}

function isJsxIdentifierName(node: JSXIdentifier | null | undefined, value: string): boolean {
  return Boolean(node && node.name === value);
}

function readMemberPropertyName(node: MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }

  if (node.computed && node.property.type === "StringLiteral") {
    return node.property.value;
  }

  return null;
}

function parseCodeFile(contents: string, filePath: string): File {
  const ext = path.extname(filePath).toLowerCase();
  const pluginSets: ParserPlugin[][] = [];

  if (ext === ".tsx") {
    pluginSets.push(["typescript", "jsx"]);
  } else if (ext === ".ts" || ext === ".mts" || ext === ".cts") {
    pluginSets.push(["typescript"]);
    pluginSets.push(["typescript", "jsx"]);
  } else if (ext === ".jsx") {
    pluginSets.push(["jsx"]);
  } else {
    pluginSets.push(["jsx"]);
    pluginSets.push([]);
  }

  let lastError: unknown;

  for (const plugins of pluginSets) {
    try {
      return parse(contents, {
        plugins,
        sourceFilename: filePath,
        sourceType: "module",
      }) as File;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("bundler-obfuscation-parse-failed");
}

function rewriteCodeClassTokens(args: {
  classNameMap: ClassNameMap;
  contents: string;
  filePath: string;
}): string {
  if (args.classNameMap.size === 0) return args.contents;

  const ast = parseCodeFile(args.contents, args.filePath);

  let changed = false;

  traverse(ast, {
    AssignmentExpression(path) {
      const left = path.node.left;

      if (left.type !== "MemberExpression") return;
      if (readMemberPropertyName(left) !== "className") return;

      const right = path.node.right;
      if (right.type === "StringLiteral") {
        changed = updateStringLiteral(right, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        return;
      }

      if (right.type === "TemplateLiteral") {
        changed = updateTemplateLiteral(right, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
      }
    },
    CallExpression(path) {
      const callee = path.node.callee;

      if (callee.type === "Identifier" && CLASS_NAME_HELPERS.has(callee.name)) {
        for (const arg of path.node.arguments) {
          if (arg.type === "StringLiteral") {
            changed = updateStringLiteral(arg, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
          } else if (arg.type === "TemplateLiteral") {
            changed = updateTemplateLiteral(arg, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
          }
        }
        return;
      }

      if (callee.type !== "MemberExpression") return;
      const methodName = readMemberPropertyName(callee);
      if (!methodName) return;

      if (SELECTOR_METHODS.has(methodName)) {
        const first = path.node.arguments[0];
        if (!first) return;

        if (first.type === "StringLiteral") {
          changed = updateStringLiteral(first, (value) => rewriteSelectorValue(value, args.classNameMap)) || changed;
        } else if (first.type === "TemplateLiteral") {
          changed = updateTemplateLiteral(first, (value) => rewriteSelectorValue(value, args.classNameMap)) || changed;
        }
        return;
      }

      if (methodName === "getElementsByClassName") {
        const first = path.node.arguments[0];
        if (!first) return;

        if (first.type === "StringLiteral") {
          changed = updateStringLiteral(first, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        } else if (first.type === "TemplateLiteral") {
          changed = updateTemplateLiteral(first, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        }
        return;
      }

      if (!CLASS_LIST_METHODS.has(methodName)) return;
      if (callee.object.type !== "MemberExpression") return;
      if (readMemberPropertyName(callee.object) !== "classList") return;

      for (const arg of path.node.arguments) {
        if (arg.type === "StringLiteral") {
          changed = updateStringLiteral(arg, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        } else if (arg.type === "TemplateLiteral") {
          changed = updateTemplateLiteral(arg, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        }
      }
    },
    JSXAttribute(path) {
      const name = path.node.name;
      if (name.type !== "JSXIdentifier") return;
      if (!isJsxIdentifierName(name, "class") && !isJsxIdentifierName(name, "className")) return;

      const value = path.node.value;
      if (!value) return;

      if (value.type === "StringLiteral") {
        changed = updateStringLiteral(value, (current) => rewriteClassListValue(current, args.classNameMap)) || changed;
        return;
      }

      if (value.type === "JSXExpressionContainer") {
        const expression = value.expression;
        if (expression.type === "StringLiteral") {
          changed = updateStringLiteral(expression, (current) => rewriteClassListValue(current, args.classNameMap)) || changed;
        } else if (expression.type === "TemplateLiteral") {
          changed = updateTemplateLiteral(expression, (current) => rewriteClassListValue(current, args.classNameMap)) || changed;
        }
      }
    },
  });

  if (!changed) return args.contents;

  return generate(ast, {
    comments: true,
    retainLines: true,
  }).code;
}

export {
  createClassNameMap,
  rewriteCodeClassTokens,
  rewriteCssClassTokens,
  rewriteClassListValue,
  rewriteSelectorValue,
};
export type { ClassNameMap };
