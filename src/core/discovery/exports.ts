import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { resolveAggregateModuleLoader } from "./shared.js";
import type { DiscoveredFile, NormalizedAggregateRule } from "./shared.js";

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
  const sourceFile = ts.createSourceFile(
    args.filePath,
    args.source,
    ts.ScriptTarget.Latest,
    true,
    resolveScriptKind(args.filePath),
  );
  return sourceFile.statements.some((statement) => statementExportsName(statement, args.exportName));
}

function statementExportsName(statement: ts.Statement, exportName: string): boolean {
  if (exportName === "default" && isDefaultExportAssignment(statement)) return true;
  if (isExportedDeclaration(statement, exportName)) return true;
  if (ts.isVariableStatement(statement)) return variableStatementExportsName(statement, exportName);
  if (ts.isExportDeclaration(statement)) return exportDeclarationExportsName(statement, exportName);
  return false;
}

function isDefaultExportAssignment(statement: ts.Statement): boolean {
  return ts.isExportAssignment(statement) && !statement.isExportEquals;
}

function isExportedDeclaration(statement: ts.Statement, exportName: string): boolean {
  const modifiers = getNodeModifiers(statement);
  const exported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  if (!exported) return false;
  const defaulted = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
  if (defaulted) return exportName === "default";
  return getStatementName(statement) === exportName;
}

function variableStatementExportsName(statement: ts.VariableStatement, exportName: string): boolean {
  if (!getNodeModifiers(statement).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
  return statement.declarationList.declarations.some((declaration) => bindingNameExportsName(declaration.name, exportName));
}

function getNodeModifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) || [] : [];
}

function getStatementName(statement: ts.Statement): string | undefined {
  if (ts.isFunctionDeclaration(statement)) return statement.name?.text;
  if (ts.isClassDeclaration(statement)) return statement.name?.text;
  if (ts.isInterfaceDeclaration(statement)) return statement.name.text;
  if (ts.isTypeAliasDeclaration(statement)) return statement.name.text;
  if (ts.isEnumDeclaration(statement)) return statement.name.text;
  if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name)) return statement.name.text;
  return undefined;
}

function bindingNameExportsName(name: ts.BindingName, exportName: string): boolean {
  if (ts.isIdentifier(name)) return name.text === exportName;
  const elements = ts.isObjectBindingPattern(name) ? name.elements : name.elements;
  return elements.some((element) => {
    if (!ts.isBindingElement(element)) return false;
    return bindingNameExportsName(element.name, exportName);
  });
}

function exportDeclarationExportsName(statement: ts.ExportDeclaration, exportName: string): boolean {
  const clause = statement.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false;
  return clause.elements.some((specifier) => specifier.name.text === exportName);
}

function resolveScriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") return ts.ScriptKind.TS;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

export {
  filterAggregateMatchedFiles,
  hasModuleExport,
};
export type {
  FilteredAggregateFiles,
};
