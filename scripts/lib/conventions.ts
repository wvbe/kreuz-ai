import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import ts from "typescript";

/** One convention violation found by {@link checkConventions}. */
export type ConventionViolation = {
  file: string;
  message: string;
};

type ExportedSymbol = {
  name: string;
  isFunction: boolean;
};

const sourceExtension = /\.(ts|tsx)$/;
const testExtension = /\.test\.(ts|tsx)$/;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else if (sourceExtension.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isFunctionLike(node: ts.Expression | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

/**
 * Lists the named exports of a source text and whether each is function-like
 * (function, class, or `const` bound to a function expression).
 *
 * @param text - TypeScript source text.
 * @param fileName - File name used for parsing (decides TS vs TSX).
 * @returns Exported symbols plus the module specifiers of any re-export statements.
 */
export function listExports(
  text: string,
  fileName: string,
): { symbols: ExportedSymbol[]; reExports: string[] } {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const localFunctions = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      localFunctions.add(statement.name.text);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      localFunctions.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && isFunctionLike(decl.initializer)) {
          localFunctions.add(decl.name.text);
        }
      }
    }
  }
  const symbols: ExportedSymbol[] = [];
  const reExports: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        reExports.push(statement.moduleSpecifier.text);
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          symbols.push({
            name: element.name.text,
            isFunction: localFunctions.has((element.propertyName ?? element.name).text),
          });
        }
      }
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          symbols.push({ name: decl.name.text, isFunction: isFunctionLike(decl.initializer) });
        }
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      symbols.push({ name: statement.name.text, isFunction: true });
    } else if (
      (ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      symbols.push({ name: statement.name.text, isFunction: false });
    }
  }
  return { symbols, reExports };
}

/**
 * Checks the machine-checkable parts of spec 023 under `root`: no barrel files or re-exports
 * (FR-002), file name equals the primary exported symbol (FR-009), every file exporting a
 * function or class has a co-located test that mentions each of them (FR-013), and every test
 * has a source file (FR-013). Files starting with `// @generated` are skipped (FR-015).
 *
 * @param root - Folder to scan, normally `src`.
 * @returns All violations, sorted by file path.
 */
export function checkConventions(root: string): ConventionViolation[] {
  const violations: ConventionViolation[] = [];
  for (const file of listFiles(root)) {
    const text = readFileSync(file, "utf8");
    if (text.startsWith("// @generated")) {
      continue;
    }
    const name = basename(file);
    if (testExtension.test(name)) {
      const stem = name.replace(testExtension, "");
      const hasSource = [".ts", ".tsx"].some((ext) => existsSync(join(dirname(file), stem + ext)));
      if (!hasSource) {
        violations.push({ file, message: `test has no source file ${stem}.ts(x) next to it` });
      }
      continue;
    }
    const stem = name.replace(sourceExtension, "");
    if (stem === "index") {
      violations.push({ file, message: "barrel files (index.ts) are prohibited (FR-002)" });
    }
    const { symbols, reExports } = listExports(text, name);
    for (const specifier of reExports) {
      violations.push({ file, message: `re-export from "${specifier}" is prohibited (FR-002)` });
    }
    if (symbols.length === 1 && symbols[0] && symbols[0].name !== stem) {
      violations.push({
        file,
        message: `file name must equal its only export "${symbols[0].name}" (FR-009)`,
      });
    }
    if (symbols.length > 1 && !symbols.some((sym) => sym.name === stem) && /^[A-Z]/.test(stem)) {
      violations.push({
        file,
        message: `PascalCase file name "${stem}" matches none of its exports; name it after a symbol or use a lowercase domain name (FR-009)`,
      });
    }
    const functions = symbols.filter((sym) => sym.isFunction);
    if (functions.length > 0) {
      const testPath = [".test.ts", ".test.tsx"]
        .map((ext) => join(dirname(file), stem + ext))
        .find((candidate) => existsSync(candidate));
      if (!testPath) {
        violations.push({ file, message: `missing co-located test ${stem}.test.ts (FR-013)` });
        continue;
      }
      const testText = readFileSync(testPath, "utf8");
      for (const fn of functions) {
        if (!new RegExp(`\\b${fn.name}\\b`).test(testText)) {
          violations.push({
            file,
            message: `exported "${fn.name}" is not referenced by ${basename(testPath)} (FR-013)`,
          });
        }
      }
    }
  }
  return violations.sort((left, right) => left.file.localeCompare(right.file));
}
