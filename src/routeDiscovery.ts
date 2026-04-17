import * as path from "node:path";
import * as ts from "typescript";
import * as vscode from "vscode";

export type RouteSourceKind = "jsx" | "route-object";

export interface RouteMatch {
  readonly path: string;
  readonly source: vscode.Uri;
  readonly line: number;
  readonly kind: RouteSourceKind;
}

const ROUTE_FILE_GLOB = "**/*.{ts,tsx,js,jsx}";
const ROUTE_FILE_EXCLUDES =
  "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/coverage/**}";

export interface RouteDiscoveryOptions {
  readonly includePatterns?: readonly string[];
}

export async function discoverRoutes(
  options: RouteDiscoveryOptions = {},
): Promise<RouteMatch[]> {
  const includePatterns =
    options.includePatterns && options.includePatterns.length > 0
      ? options.includePatterns
      : [ROUTE_FILE_GLOB];

  const files = await collectFiles(includePatterns);
  const discovered: RouteMatch[] = [];

  for (const file of files) {
    const text = await readFileText(file);
    discovered.push(...discoverRoutesInText(text, file));
  }

  return dedupeRoutes(discovered).sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }

    const sourceComparison = left.source.fsPath.localeCompare(
      right.source.fsPath,
    );
    if (sourceComparison !== 0) {
      return sourceComparison;
    }

    return left.line - right.line;
  });
}

export function discoverRoutesInText(
  text: string,
  source: vscode.Uri,
): RouteMatch[] {
  const scriptKind = getScriptKind(source.fsPath);
  const sourceFile = ts.createSourceFile(
    source.fsPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const matches: RouteMatch[] = [];
  const seen = new Set<string>();

  visitNode(sourceFile, "/", matches, seen);
  return matches;
}

export function normalizeRoutePath(input: string): string {
  if (!input) {
    return "/";
  }

  if (input === "*") {
    return "/*";
  }

  let normalized = input.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/+/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || "/";
}

export function buildRouteUrl(port: number, routePath: string): string {
  const normalizedPath = normalizeRoutePath(routePath);
  return `http://localhost:${port}${normalizedPath === "/" ? "" : normalizedPath}`;
}

function visitNode(
  node: ts.Node,
  basePath: string,
  matches: RouteMatch[],
  seen: Set<string>,
): void {
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
    visitJsxRoute(node, basePath, matches, seen);
    return;
  }

  if (ts.isObjectLiteralExpression(node)) {
    visitRouteObject(node, basePath, matches, seen);
    return;
  }

  ts.forEachChild(node, (child) => visitNode(child, basePath, matches, seen));
}

function visitJsxRoute(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  basePath: string,
  matches: RouteMatch[],
  seen: Set<string>,
): void {
  const openingElement = ts.isJsxElement(node) ? node.openingElement : node;
  const tagName = openingElement.tagName.getText();

  if (tagName !== "Route") {
    if (ts.isJsxElement(node)) {
      for (const child of node.children) {
        visitNode(child, basePath, matches, seen);
      }
    }

    return;
  }

  const pathValue = readJsxAttributeValue(openingElement, "path");
  const isIndexRoute = readJsxBooleanAttribute(openingElement, "index");

  const currentPath = isIndexRoute
    ? normalizeRoutePath(basePath)
    : pathValue
      ? joinRoutePaths(basePath, pathValue)
      : normalizeRoutePath(basePath);

  if (pathValue || isIndexRoute) {
    addMatch(
      matches,
      seen,
      currentPath,
      openingElement.getStart(),
      openingElement.getSourceFile(),
      "jsx",
    );
  }

  const nextBasePath = pathValue ? currentPath : basePath;
  if (ts.isJsxElement(node)) {
    for (const child of node.children) {
      visitNode(child, nextBasePath, matches, seen);
    }
  }
}

function visitRouteObject(
  node: ts.ObjectLiteralExpression,
  basePath: string,
  matches: RouteMatch[],
  seen: Set<string>,
): void {
  const pathValue = readObjectPropertyString(node, "path");
  const isIndexRoute = readObjectPropertyBoolean(node, "index");

  const currentPath = isIndexRoute
    ? normalizeRoutePath(basePath)
    : pathValue
      ? joinRoutePaths(basePath, pathValue)
      : normalizeRoutePath(basePath);

  if (pathValue || isIndexRoute) {
    addMatch(
      matches,
      seen,
      currentPath,
      node.getStart(),
      node.getSourceFile(),
      "route-object",
    );
  }

  const nextBasePath = pathValue ? currentPath : basePath;
  for (const property of node.properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }

    const propertyName = getPropertyName(property.name);
    if (propertyName !== "children" && propertyName !== "routes") {
      continue;
    }

    const initializer = ts.isPropertyAssignment(property)
      ? property.initializer
      : undefined;
    if (!initializer) {
      continue;
    }

    visitNode(initializer, nextBasePath, matches, seen);
  }
}

function addMatch(
  matches: RouteMatch[],
  seen: Set<string>,
  routePath: string,
  startPosition: number,
  sourceFile: ts.SourceFile,
  kind: RouteSourceKind,
): void {
  const normalizedPath = normalizeRoutePath(routePath);
  const line = sourceFile.getLineAndCharacterOfPosition(startPosition).line + 1;
  const key = `${sourceFile.fileName}:${line}:${normalizedPath}:${kind}`;

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  matches.push({
    path: normalizedPath,
    source: vscode.Uri.file(sourceFile.fileName),
    line,
    kind,
  });
}

function dedupeRoutes(routes: RouteMatch[]): RouteMatch[] {
  const seen = new Set<string>();
  const deduped: RouteMatch[] = [];

  for (const route of routes) {
    const key = `${route.source.fsPath}:${route.line}:${route.path}:${route.kind}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(route);
  }

  return deduped;
}

function joinRoutePaths(basePath: string, childPath: string): string {
  const normalizedBase = normalizeRoutePath(basePath);
  const normalizedChild = childPath.trim();

  if (!normalizedChild || normalizedChild === ".") {
    return normalizedBase;
  }

  if (normalizedChild.startsWith("/")) {
    return normalizeRoutePath(normalizedChild);
  }

  if (normalizedBase === "/") {
    return normalizeRoutePath(normalizedChild);
  }

  return normalizeRoutePath(`${normalizedBase}/${normalizedChild}`);
}

function readJsxAttributeValue(
  element: ts.JsxOpeningLikeElement,
  attributeName: string,
): string | undefined {
  const attribute = element.attributes.properties.find((candidate) => {
    return (
      ts.isJsxAttribute(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === attributeName
    );
  });

  if (!attribute || !ts.isJsxAttribute(attribute)) {
    return undefined;
  }

  const initializer = attribute.initializer;
  if (!initializer) {
    return undefined;
  }

  if (
    ts.isStringLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    return initializer.text;
  }

  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = initializer.expression;
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text;
    }
  }

  return undefined;
}

function readJsxBooleanAttribute(
  element: ts.JsxOpeningLikeElement,
  attributeName: string,
): boolean {
  const attribute = element.attributes.properties.find((candidate) => {
    return (
      ts.isJsxAttribute(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === attributeName
    );
  });

  if (!attribute || !ts.isJsxAttribute(attribute)) {
    return false;
  }

  const initializer = attribute.initializer;
  if (!initializer) {
    return true;
  }

  if (ts.isJsxExpression(initializer)) {
    if (!initializer.expression) {
      return true;
    }

    return initializer.expression.kind === ts.SyntaxKind.TrueKeyword;
  }

  return false;
}

function readObjectPropertyString(
  node: ts.ObjectLiteralExpression,
  propertyName: string,
): string | undefined {
  const property = node.properties.find((candidate) => {
    if (
      !ts.isPropertyAssignment(candidate) &&
      !ts.isShorthandPropertyAssignment(candidate)
    ) {
      return false;
    }

    return getPropertyName(candidate.name) === propertyName;
  });

  if (!property || !ts.isPropertyAssignment(property)) {
    return undefined;
  }

  if (!ts.isPropertyAssignment(property)) {
    return undefined;
  }

  const initializer = property.initializer;
  if (
    ts.isStringLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    return initializer.text;
  }

  return undefined;
}

function readObjectPropertyBoolean(
  node: ts.ObjectLiteralExpression,
  propertyName: string,
): boolean {
  const property = node.properties.find((candidate) => {
    if (
      !ts.isPropertyAssignment(candidate) &&
      !ts.isShorthandPropertyAssignment(candidate)
    ) {
      return false;
    }

    return getPropertyName(candidate.name) === propertyName;
  });

  if (!property) {
    return false;
  }

  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name.text === propertyName;
  }

  if (!ts.isPropertyAssignment(property)) {
    return false;
  }

  const initializer = property.initializer;
  if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  return false;
}

function getPropertyName(name: ts.PropertyName): string {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return name.getText();
}

function getScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".ts":
      return ts.ScriptKind.TS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}

async function collectFiles(
  includePatterns: readonly string[],
): Promise<vscode.Uri[]> {
  const collected: vscode.Uri[] = [];
  const seen = new Set<string>();

  for (const includePattern of includePatterns) {
    const files = await vscode.workspace.findFiles(
      includePattern,
      ROUTE_FILE_EXCLUDES,
    );
    for (const file of files) {
      if (seen.has(file.fsPath)) {
        continue;
      }

      seen.add(file.fsPath);
      collected.push(file);
    }
  }

  return collected;
}

async function readFileText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder("utf-8").decode(bytes);
}
