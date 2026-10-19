import fs from "node:fs/promises";
import path from "node:path";

import type ts from "typescript";

import { resolveAggregateModuleLoader } from "./shared.js";
import type { DiscoveredFile, NormalizedAggregateRule } from "./shared.js";

let tsc: typeof ts;

async function loadTypeScript(): Promise<void> {
  tsc ??= (await import("typescript")).default;
}

type FilteredAggregateFiles = {
  matchedFiles: DiscoveredFile[];
  skippedSources: string[];
};

async function filterAggregateMatchedFiles(args: {
    matchedFiles: DiscoveredFile[];
    rule: NormalizedAggregateRule;
}): Promise<FilteredAggregateFiles> {
  if (!args.rule.aggregate.requireMatchedModuleExport) {
    return { matchedFiles: args.matchedFiles, skippedSources: [] };
  }

  await loadTypeScript();
  const matchedFiles: DiscoveredFile[] = [];
  const skippedSources: string[] = [];

  for (const file of args.matchedFiles) {
    if (!resolveAggregateModuleLoader(file.rootRel)) {
      skippedSources.push(file.rootRel);
      continue;
    }

    const source = await fs.readFile(file.absPath, "utf8");
    if (hasModuleExport({ exportName: args.rule.aggregate.matchedModuleExportName, filePath: file.absPath, source })) {
      matchedFiles.push(file);
    } else {
      skippedSources.push(file.rootRel);
    }
  }

  return { matchedFiles, skippedSources };
}

function hasModuleExport(args: {
    exportName: string;
    filePath: string;
    source: string;
}): boolean {
  const sourceFile = tsc.createSourceFile(
    args.filePath,
    args.source,
    tsc.ScriptTarget.Latest,
    true,
    resolveScriptKind(args.filePath),
  );
  return sourceFile.statements.some((statement) => statementExportsName(statement, args.exportName));
}

function statementExportsName(statement: ts.Statement, exportName: string): boolean {
  if (exportName === "default" && isDefaultExportAssignment(statement)) return true;
  if (isExportedDeclaration(statement, exportName)) return true;
  if (tsc.isVariableStatement(statement)) return variableStatementExportsName(statement, exportName);
  if (tsc.isExportDeclaration(statement)) return exportDeclarationExportsName(statement, exportName);
  return false;
}

function isDefaultExportAssignment(statement: ts.Statement): boolean {
  return tsc.isExportAssignment(statement) && !statement.isExportEquals;
}

function isExportedDeclaration(statement: ts.Statement, exportName: string): boolean {
  const modifiers = getNodeModifiers(statement);
  const exported = modifiers.some((modifier) => modifier.kind === tsc.SyntaxKind.ExportKeyword);
  if (!exported) return false;
  const defaulted = modifiers.some((modifier) => modifier.kind === tsc.SyntaxKind.DefaultKeyword);
  if (defaulted) return exportName === "default";
  return getStatementName(statement) === exportName;
}

function variableStatementExportsName(statement: ts.VariableStatement, exportName: string): boolean {
  if (!getNodeModifiers(statement).some((modifier) => modifier.kind === tsc.SyntaxKind.ExportKeyword)) return false;
  return statement.declarationList.declarations.some((declaration) => bindingNameExportsName(declaration.name, exportName));
}

function getNodeModifiers(node: ts.Node): readonly ts.Modifier[] {
  return tsc.canHaveModifiers(node) ? tsc.getModifiers(node) || [] : [];
}

function getStatementName(statement: ts.Statement): string | undefined {
  if (tsc.isFunctionDeclaration(statement)) return statement.name?.text;
  if (tsc.isClassDeclaration(statement)) return statement.name?.text;
  if (tsc.isInterfaceDeclaration(statement)) return statement.name.text;
  if (tsc.isTypeAliasDeclaration(statement)) return statement.name.text;
  if (tsc.isEnumDeclaration(statement)) return statement.name.text;
  if (tsc.isModuleDeclaration(statement) && tsc.isIdentifier(statement.name)) return statement.name.text;
  return undefined;
}

function bindingNameExportsName(name: ts.BindingName, exportName: string): boolean {
  if (tsc.isIdentifier(name)) return name.text === exportName;
  const elements = tsc.isObjectBindingPattern(name) ? name.elements : name.elements;
  return elements.some((element) => {
      if (!tsc.isBindingElement(element)) return false;
      return bindingNameExportsName(element.name, exportName);
  });
}

function exportDeclarationExportsName(statement: ts.ExportDeclaration, exportName: string): boolean {
  const clause = statement.exportClause;
  if (!clause || !tsc.isNamedExports(clause)) return false;
  return clause.elements.some((specifier) => specifier.name.text === exportName);
}

function resolveScriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return tsc.ScriptKind.TSX;
  if (extension === ".jsx") return tsc.ScriptKind.JSX;
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") return tsc.ScriptKind.TS;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return tsc.ScriptKind.JS;
  return tsc.ScriptKind.Unknown;
}

export {
  filterAggregateMatchedFiles,
  hasModuleExport,
};
export type {
  FilteredAggregateFiles,
};
