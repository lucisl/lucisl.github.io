import { access, cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPages } from './build-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await buildPages();

await rm(dist, { recursive: true, force: true });
await mkdir(dist);
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, '.nojekyll'), path.join(dist, '.nojekyll'));
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
await cp(path.join(root, 'game'), path.join(dist, 'game'), { recursive: true });
await cp(path.join(root, 'devkit'), path.join(dist, 'devkit'), { recursive: true });
await cp(path.join(root, 'projects'), path.join(dist, 'projects'), { recursive: true });
await Promise.all(['index.html', 'assets/styles.css', 'assets/portal.css',
  'assets/workspace.css', 'assets/js/app.mjs',
  'devkit/index.html', 'game/monopoly/index.html', 'assets/js/monopoly-app.mjs',
  'assets/monopoly.css', 'projects/index.html', 'projects/lita-work.html']
  .map((file) => access(path.join(dist, file))));

console.log('Static site built in dist/');
