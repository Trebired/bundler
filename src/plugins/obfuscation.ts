import fs from "node:fs";
import path from "node:path";
import generate from "@babel/generator";
import { parse, type ParserPlugin } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import type {
  Expression,
  File,
  JSXAttribute,
  JSXIdentifier,
  MemberExpression,
  ObjectProperty,
  StringLiteral,
  TemplateElement,
  TemplateLiteral,
} from "@babel/types";

const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const CLASS_LIST_METHODS = new Set(["add", "contains", "remove", "replace", "toggle"]);
const SELECTOR_METHODS = new Set(["closest", "matches", "querySelector", "querySelectorAll"]);
const CLASS_NAME_HELPERS = new Set([
  "classNames",
  "classnames",
  "clsx",
  "cn",
  "cx",
  "cva",
  "joinClassNames",
  "joinClasses",
  "mergeClassNames",
]);

type ClassNameMap = Map<string, string>;
type RewriteContext = {
  classNameMap: ClassNameMap;
  helperAliases: Set<string>;
  visitedBindings: WeakSet<object>;
};

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

  return value.replace(/(^|[\s])([_a-zA-Z][\w-]*)(?=$|[\s])/g, (match, prefix: string, className: string) => {
    const nextValue = classNameMap.get(className);
    return nextValue ? `${prefix}${nextValue}` : match;
  });
}

function rewriteHtmlClassAttributes(value: string, classNameMap: ClassNameMap): string {
  if (classNameMap.size === 0) return value;

  return value.replace(/(class(?:Name)?\s*=\s*["'])([^"']*)(["'])/g, (match, prefix: string, classNames: string, suffix: string) => {
    const rewritten = rewriteClassListValue(classNames, classNameMap);
    return rewritten === classNames ? match : `${prefix}${rewritten}${suffix}`;
  });
}

function readTemplateElementValue(node: TemplateElement): string {
  return node.value.cooked ?? node.value.raw;
}

function updateTemplateElement(node: TemplateElement, nextValue: string): boolean {
  const current = readTemplateElementValue(node);
  if (nextValue === current) return false;
  node.value.cooked = nextValue;
  node.value.raw = nextValue;
  return true;
}

function rewriteTemplateElements(
  node: TemplateLiteral,
  rewrite: (value: string) => string,
): boolean {
  let changed = false;

  for (const quasi of node.quasis) {
    changed = updateTemplateElement(quasi, rewrite(readTemplateElementValue(quasi))) || changed;
  }

  return changed;
}

function rewriteHtmlTemplateLiteral(node: TemplateLiteral, classNameMap: ClassNameMap): boolean {
  let changed = false;
  let activeQuote: `"` | "'" | null = null;

  for (const quasi of node.quasis) {
    const current = readTemplateElementValue(quasi);
    let index = 0;
    let next = "";

    while (index < current.length) {
      if (!activeQuote) {
        const match = current.slice(index).match(/class(?:Name)?\s*=\s*(["'])/);

        if (!match || match.index == null) {
          next += current.slice(index);
          break;
        }

        const start = index + match.index;
        const quote = match[1] as `"` | "'";
        const quoteIndex = current.indexOf(quote, start) + 1;
        next += current.slice(index, quoteIndex);
        index = quoteIndex;
        activeQuote = quote;
        continue;
      }

      const endIndex = current.indexOf(activeQuote, index);

      if (endIndex === -1) {
        next += rewriteClassListValue(current.slice(index), classNameMap);
        index = current.length;
        break;
      }

      next += rewriteClassListValue(current.slice(index, endIndex), classNameMap);
      next += activeQuote;
      index = endIndex + 1;
      activeQuote = null;
    }

    changed = updateTemplateElement(quasi, next) || changed;
  }

  return changed;
}

function updateStringLiteral(node: StringLiteral, rewrite: (value: string) => string): boolean {
  const nextValue = rewrite(node.value);
  if (nextValue === node.value) return false;
  node.value = nextValue;
  return true;
}

function updateTemplateLiteral(node: TemplateLiteral, rewrite: (value: string) => string): boolean {
  if (node.expressions.length > 0 || node.quasis.length !== 1) return false;
  return updateTemplateElement(node.quasis[0], rewrite(readTemplateElementValue(node.quasis[0])));
}

function updateClassListTemplateLiteral(node: TemplateLiteral, classNameMap: ClassNameMap): boolean {
  if (node.expressions.length === 0) {
    return updateTemplateLiteral(node, (value) => rewriteClassListValue(value, classNameMap));
  }

  return rewriteTemplateElements(node, (value) => rewriteClassListValue(value, classNameMap));
}

function updateSelectorTemplateLiteral(node: TemplateLiteral, classNameMap: ClassNameMap): boolean {
  if (node.expressions.length === 0) {
    return updateTemplateLiteral(node, (value) => rewriteSelectorValue(value, classNameMap));
  }

  return rewriteTemplateElements(node, (value) => rewriteSelectorValue(value, classNameMap));
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

function resolveExpressionName(expression: Expression | null | undefined): string | null {
  if (!expression) return null;
  if (expression.type === "Identifier") return expression.name;
  if (expression.type === "MemberExpression") return readMemberPropertyName(expression);
  return null;
}

function looksLikeClassHelperName(value: string | null | undefined): boolean {
  if (!value) return false;
  if (CLASS_NAME_HELPERS.has(value)) return true;
  return /class(?:name|names|es)?/i.test(value);
}

function looksLikeClassPropertyName(value: string | null | undefined): boolean {
  if (!value) return false;
  return /class(?:name)?$/i.test(value);
}

function isExpressionNode(value: unknown): value is Expression {
  if (!value || typeof value !== "object" || !("type" in value)) return false;

  const type = String((value as { type?: unknown }).type || "");
  return Boolean(type && !type.endsWith("Pattern") && type !== "PrivateName");
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

function collectHelperAliases(ast: File): Set<string> {
  const aliases = new Set(CLASS_NAME_HELPERS);

  traverse(ast, {
    FunctionDeclaration(path) {
      if (looksLikeClassHelperName(path.node.id?.name)) {
        aliases.add(path.node.id!.name);
      }
    },
    ImportSpecifier(path) {
      if (path.node.imported.type === "Identifier" && looksLikeClassHelperName(path.node.imported.name)) {
        aliases.add(path.node.local.name);
      }
    },
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier") return;
      const name = path.node.id.name;

      if (looksLikeClassHelperName(name)) {
        aliases.add(name);
        return;
      }

      const initName = path.node.init ? resolveExpressionName(path.node.init as Expression) : null;
      if (looksLikeClassHelperName(initName) || (initName && aliases.has(initName))) {
        aliases.add(name);
      }
    },
  });

  return aliases;
}

function readObjectPropertyName(property: ObjectProperty): string | null {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "StringLiteral") return property.key.value;
  return null;
}

function rewritePropertyKeyAsClassName(
  property: ObjectProperty,
  classNameMap: ClassNameMap,
): boolean {
  if (property.computed) return false;

  if (property.key.type === "Identifier") {
    const nextValue = rewriteClassListValue(property.key.name, classNameMap);
    if (nextValue === property.key.name || /\s/.test(nextValue)) return false;
    property.key.name = nextValue;
    return true;
  }

  if (property.key.type === "StringLiteral") {
    return updateStringLiteral(property.key, (value) => rewriteClassListValue(value, classNameMap));
  }

  return false;
}

function rewriteBoundIdentifier(path: NodePath<Expression>, context: RewriteContext): boolean {
  if (!path.isIdentifier()) return false;

  const binding = path.scope.getBinding(path.node.name);
  if (!binding || context.visitedBindings.has(binding.path.node)) return false;
  context.visitedBindings.add(binding.path.node);

  try {
    if (binding.path.isVariableDeclarator()) {
      const initPath = binding.path.get("init");
      if (initPath && initPath.node && isExpressionNode(initPath.node)) {
        return rewriteExpressionAsClassList(initPath as NodePath<Expression>, context);
      }
    }

    return false;
  } finally {
    context.visitedBindings.delete(binding.path.node);
  }
}

function rewriteClassBearingProperty(
  path: NodePath<ObjectProperty>,
  context: RewriteContext,
): boolean {
  const propertyName = readObjectPropertyName(path.node);
  if (!looksLikeClassPropertyName(propertyName)) return false;

  const valuePath = path.get("value");
  if (!valuePath.node || !isExpressionNode(valuePath.node)) return false;

  return rewriteExpressionAsClassList(valuePath as NodePath<Expression>, context);
}

function rewriteExpressionAsClassList(
  path: NodePath<Expression>,
  context: RewriteContext,
): boolean {
  const { classNameMap, helperAliases } = context;
  const expression = path.node;

  switch (expression.type) {
    case "ArrayExpression": {
      let changed = false;

      for (const elementPath of path.get("elements")) {
        if (!elementPath.node || elementPath.isSpreadElement() || !isExpressionNode(elementPath.node)) continue;
        changed = rewriteExpressionAsClassList(elementPath as NodePath<Expression>, context) || changed;
      }

      return changed;
    }
    case "AssignmentExpression":
      return rewriteExpressionAsClassList(path.get("right") as NodePath<Expression>, context);
    case "BinaryExpression": {
      let changed = false;

      if (expression.left.type !== "PrivateName") {
        changed = rewriteExpressionAsClassList(path.get("left") as NodePath<Expression>, context) || changed;
      }

      changed = rewriteExpressionAsClassList(path.get("right") as NodePath<Expression>, context) || changed;
      return changed;
    }
    case "CallExpression": {
      const calleePath = path.get("callee");
      const calleeName = isExpressionNode(calleePath.node) ? resolveExpressionName(calleePath.node) : null;
      if (!calleeName || (!helperAliases.has(calleeName) && !looksLikeClassHelperName(calleeName))) {
        if (calleePath.isMemberExpression()) {
          const objectPath = calleePath.get("object");
          if (objectPath.node && isExpressionNode(objectPath.node)) {
            return rewriteExpressionAsClassList(objectPath as NodePath<Expression>, context);
          }
        }
        return false;
      }

      let changed = false;
      for (const argumentPath of path.get("arguments")) {
        if (!argumentPath.node || argumentPath.isSpreadElement() || !isExpressionNode(argumentPath.node)) continue;
        changed = rewriteExpressionAsClassList(argumentPath as NodePath<Expression>, context) || changed;
      }
      return changed;
    }
    case "ConditionalExpression": {
      const changedConsequent = rewriteExpressionAsClassList(path.get("consequent") as NodePath<Expression>, context);
      const changedAlternate = rewriteExpressionAsClassList(path.get("alternate") as NodePath<Expression>, context);
      return changedConsequent || changedAlternate;
    }
    case "Identifier":
      return rewriteBoundIdentifier(path, context);
    case "LogicalExpression": {
      const changedLeft = rewriteExpressionAsClassList(path.get("left") as NodePath<Expression>, context);
      const changedRight = rewriteExpressionAsClassList(path.get("right") as NodePath<Expression>, context);
      return changedLeft || changedRight;
    }
    case "ObjectExpression": {
      let changed = false;

      for (const propertyPath of path.get("properties")) {
        if (!propertyPath.isObjectProperty()) continue;
        const property = propertyPath.node;

        if (looksLikeClassPropertyName(readObjectPropertyName(property))) {
          changed = rewriteClassBearingProperty(propertyPath, context) || changed;
          continue;
        }

        if (!isExpressionNode(property.value)) {
          changed = rewritePropertyKeyAsClassName(property, classNameMap) || changed;
          continue;
        }

        changed = rewritePropertyKeyAsClassName(property, classNameMap) || changed;
        changed = rewriteExpressionAsClassList(propertyPath.get("value") as NodePath<Expression>, context) || changed;
      }
      return changed;
    }
    case "ParenthesizedExpression":
      return rewriteExpressionAsClassList(path.get("expression") as NodePath<Expression>, context);
    case "SequenceExpression": {
      let changed = false;

      for (const itemPath of path.get("expressions")) {
        if (!itemPath.node) continue;
        changed = rewriteExpressionAsClassList(itemPath as NodePath<Expression>, context) || changed;
      }
      return changed;
    }
    case "StringLiteral":
      return updateStringLiteral(expression, (value) => rewriteClassListValue(value, classNameMap));
    case "TemplateLiteral": {
      let changed = updateClassListTemplateLiteral(expression, classNameMap);

      for (const expressionPath of path.get("expressions")) {
        if (!expressionPath.node || !isExpressionNode(expressionPath.node)) continue;
        changed = rewriteExpressionAsClassList(expressionPath as NodePath<Expression>, context) || changed;
      }

      return changed;
    }
    default:
      return false;
  }
}

function rewriteClassAttributeValuePath(args: {
  classNameMap: ClassNameMap;
  helperAliases: Set<string>;
  visitedBindings: WeakSet<object>;
  valuePath: NodePath<JSXAttribute["value"]>;
}): boolean {
  const { classNameMap, helperAliases, valuePath, visitedBindings } = args;
  const value = valuePath.node;
  if (!value) return false;

  if (value.type === "StringLiteral") {
    return updateStringLiteral(value, (current) => rewriteClassListValue(current, classNameMap));
  }

  if (value.type === "JSXExpressionContainer") {
    const expressionPath = valuePath.get("expression");
    if (!expressionPath.node || expressionPath.isJSXEmptyExpression() || !isExpressionNode(expressionPath.node)) return false;

    return rewriteExpressionAsClassList(expressionPath as NodePath<Expression>, {
      classNameMap,
      helperAliases,
      visitedBindings,
    });
  }

  return false;
}

function rewriteCodeClassTokens(args: {
  classNameMap: ClassNameMap;
  contents: string;
  filePath: string;
}): string {
  if (args.classNameMap.size === 0) return args.contents;

  const ast = parseCodeFile(args.contents, args.filePath);
  const helperAliases = collectHelperAliases(ast);
  const visitedBindings = new WeakSet<object>();
  let changed = false;

  traverse(ast, {
    AssignmentExpression(path) {
      const left = path.node.left;

      if (left.type !== "MemberExpression") return;
      if (readMemberPropertyName(left) !== "className") return;
      if (!isExpressionNode(path.node.right)) return;

      changed = rewriteExpressionAsClassList(path.get("right") as NodePath<Expression>, {
        classNameMap: args.classNameMap,
        helperAliases,
        visitedBindings,
      }) || changed;
    },
    CallExpression(path) {
      const callee = path.node.callee;
      const calleeName = resolveExpressionName(callee as Expression);

      if (calleeName && (helperAliases.has(calleeName) || looksLikeClassHelperName(calleeName))) {
        for (const argumentPath of path.get("arguments")) {
          if (!argumentPath.node || argumentPath.isSpreadElement() || !isExpressionNode(argumentPath.node)) continue;

          changed = rewriteExpressionAsClassList(argumentPath as NodePath<Expression>, {
            classNameMap: args.classNameMap,
            helperAliases,
            visitedBindings,
          }) || changed;
        }
        return;
      }

      if (callee.type !== "MemberExpression") return;
      const methodName = readMemberPropertyName(callee);
      if (!methodName) return;

      if (SELECTOR_METHODS.has(methodName)) {
        const first = path.node.arguments[0];
        if (!first || first.type === "SpreadElement" || !("type" in first)) return;

        if (first.type === "StringLiteral") {
          changed = updateStringLiteral(first, (value) => rewriteSelectorValue(value, args.classNameMap)) || changed;
        } else if (first.type === "TemplateLiteral") {
          changed = updateSelectorTemplateLiteral(first, args.classNameMap) || changed;
        }
        return;
      }

      if (methodName === "getElementsByClassName") {
        const first = path.node.arguments[0];
        if (!first || first.type === "SpreadElement" || !("type" in first)) return;

        if (first.type === "StringLiteral") {
          changed = updateStringLiteral(first, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        } else if (first.type === "TemplateLiteral") {
          changed = updateClassListTemplateLiteral(first, args.classNameMap) || changed;
        }
        return;
      }

      if (methodName === "setAttribute" || methodName === "setAttributeNS") {
        const nameArg = path.node.arguments[methodName === "setAttributeNS" ? 1 : 0];
        const valueArgIndex = methodName === "setAttributeNS" ? 2 : 1;
        const valueArg = path.node.arguments[valueArgIndex];
        if (!nameArg || nameArg.type !== "StringLiteral") return;
        if (nameArg.value !== "class" && nameArg.value !== "className") return;
        if (!valueArg || valueArg.type === "SpreadElement" || !("type" in valueArg)) return;

        const valuePath = path.get(`arguments.${valueArgIndex}`);
        if (!valuePath.node || !isExpressionNode(valuePath.node)) return;

        changed = rewriteExpressionAsClassList(valuePath as NodePath<Expression>, {
          classNameMap: args.classNameMap,
          helperAliases,
          visitedBindings,
        }) || changed;
        return;
      }

      if (!CLASS_LIST_METHODS.has(methodName)) return;
      if (callee.object.type !== "MemberExpression") return;
      if (readMemberPropertyName(callee.object) !== "classList") return;

      for (const argument of path.node.arguments) {
        if (argument.type === "SpreadElement" || !("type" in argument)) continue;

        if (argument.type === "StringLiteral") {
          changed = updateStringLiteral(argument, (value) => rewriteClassListValue(value, args.classNameMap)) || changed;
        } else if (argument.type === "TemplateLiteral") {
          changed = updateClassListTemplateLiteral(argument, args.classNameMap) || changed;
        }
      }
    },
    JSXAttribute(path) {
      const name = path.node.name;
      if (name.type !== "JSXIdentifier") return;
      if (!isJsxIdentifierName(name, "class") && !isJsxIdentifierName(name, "className")) return;

      changed = rewriteClassAttributeValuePath({
        classNameMap: args.classNameMap,
        helperAliases,
        valuePath: path.get("value"),
        visitedBindings,
      }) || changed;
    },
    ObjectProperty(path) {
      changed = rewriteClassBearingProperty(path, {
        classNameMap: args.classNameMap,
        helperAliases,
        visitedBindings,
      }) || changed;
    },
    StringLiteral(path) {
      if (!/class(?:Name)?\s*=\s*["']/.test(path.node.value)) return;
      changed = updateStringLiteral(path.node, (value) => rewriteHtmlClassAttributes(value, args.classNameMap)) || changed;
    },
    TemplateLiteral(path) {
      const hasHtmlClasses = path.node.quasis.some((quasi) => /class(?:Name)?\s*=\s*["']/.test(readTemplateElementValue(quasi)));
      if (!hasHtmlClasses) return;
      changed = rewriteHtmlTemplateLiteral(path.node, args.classNameMap) || changed;
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
