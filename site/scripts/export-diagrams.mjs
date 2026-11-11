import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, '..', 'docs', 'diagrams');
const bundle = path.join(root, 'dist-diagrams', 'entry-diagrams.js');

const tokens = await readFile(path.join(root, 'src', 'tokens.css'), 'utf8');
const pageCss = await readFile(path.join(root, 'src', 'page.css'), 'utf8');
const vars = tokens.match(/--color-[a-z0-9-]+:\s*[^;]+;|--font-[a-z]+:\s*[^;]+;/g);
const rules = pageCss.split('\n').filter((l) => l.startsWith('.diagram .dw-')).join('\n');
if (!vars || !rules) {
  throw new Error('Could not read diagram tokens or rules from src/tokens.css and src/page.css');
}
const style = `<style>svg{${vars.join('')}background:var(--color-paper)}${rules.replaceAll('.diagram ', '')}</style>`;

const {renderDiagrams} = await import(pathToFileURL(bundle).href);
await mkdir(outDir, {recursive: true});
for (const [name, markup] of Object.entries(renderDiagrams())) {
  const [, viewBox] = markup.match(/viewBox="([^"]+)"/) ?? [];
  if (!viewBox) throw new Error(`${name}: no viewBox in rendered svg`);
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  const svg = markup
    .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `)
    .replace(/(<svg[^>]*>)/, `$1${style}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="oklch(35% 0.105 256)"/>`);
  await writeFile(path.join(outDir, `${name}.svg`), svg);
}
await rm(path.join(root, 'dist-diagrams'), {recursive: true, force: true});
console.log(`wrote ${outDir}`);
