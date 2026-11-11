import {readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const serverDir = path.join(root, 'dist-server');
const marker = '<div id="root"></div>';

const {render} = await import(pathToFileURL(path.join(serverDir, 'entry-server.js')).href);
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!template.includes(marker)) {
  throw new Error(`dist/index.html has no ${marker} to fill`);
}
const html = template.replace(marker, `<div id="root">${render()}</div>`);
await writeFile(path.join(dist, 'index.html'), html);
await rm(serverDir, {recursive: true, force: true});
console.log('prerendered dist/index.html');
