import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

/** Load actual TS modules in one isolated realm, with explicit browser mocks.
 * Resolve local imports normally; never silently substitute an unrelated module.
 * A fresh call creates a fresh module cache (and fresh module-owned state).
 */
export function loadTypeScript(entry, globals = {}, mocks = {}) {
  const context = vm.createContext({ console, ...globals });
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = readFileSync(file, "utf8");
    const js = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    }).outputText;
    const require = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (!specifier.startsWith("."))
        throw new Error(`Unmocked dependency ${specifier} in ${file}`);
      const base = resolve(dirname(file), specifier);
      const dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(
        (candidate) => existsSync(candidate),
      );
      if (!dependency)
        throw new Error(`Cannot resolve ${specifier} in ${file}`);
      return load(dependency);
    };
    const evaluate = vm.runInContext(
      `(function(exports, require, module) {\n${js}\n})`,
      context,
      { filename: file },
    );
    evaluate(module.exports, require, module);
    return module.exports;
  }
  return load(entry instanceof URL ? fileURLToPath(entry) : resolve(entry));
}
