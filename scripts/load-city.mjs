import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';

// Load the engine's TypeScript module graph without a browser or a second build.
export function cityModuleLoader(reference = false) {
  const cache = new Map();
  return function load(file) {
    if (!reference && !fs.existsSync(file)) file = 'frontend/' + file;
    if (cache.has(file)) return cache.get(file);
    const source = reference
      ? execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8' })
      : fs.readFileSync(file, 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    output = output.replace(/from (['"])(\.\/[^'"]+)\1/g, (_, quote, name) =>
      'from ' + JSON.stringify(load(path.posix.join(path.posix.dirname(file), name + '.ts'))));
    const url = 'data:text/javascript;base64,' + Buffer.from(output + '\n//# sourceURL=' + file).toString('base64');
    cache.set(file, url);
    return url;
  };
}
