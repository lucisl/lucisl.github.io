import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

async function listFiles(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) return listFiles(path.join(directory, entry.name), entryRelative);
    return [entryRelative];
  }));
  return files.flat().sort();
}

test('build script creates a deployable artifact without development files', async () => {
  await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: root });

  assert.deepEqual(await listFiles(dist), [
    '.nojekyll',
    'assets/favicon.svg',
    'assets/js/app.mjs',
    'assets/js/json-core.mjs',
    'assets/js/json-history.mjs',
    'assets/js/monopoly-ai.mjs',
    'assets/js/monopoly-app.mjs',
    'assets/js/monopoly-core.mjs',
    'assets/js/router-core.mjs',
    'assets/js/timestamp-core.mjs',
    'assets/monopoly.css',
    'assets/portal.css',
    'assets/styles.css',
    'assets/workspace.css',
    'devkit/index.html',
    'game/monopoly/index.html',
    'index.html',
    'projects/content/lita-activities.md',
    'projects/content/lita-companion.md',
    'projects/content/lita-gifting.md',
    'projects/content/lita-voice-room.md',
    'projects/content/lita-work-ops.md',
    'projects/content/lita-work-prompts.md',
    'projects/content/lita-work-skeleton.md',
    'projects/content/lita-work-skills-mcp.md',
    'projects/content/lita-work.md',
    'projects/content/lita.md',
    'projects/index.html',
    'projects/lita-activities.html',
    'projects/lita-companion.html',
    'projects/lita-gifting.html',
    'projects/lita-voice-room.html',
    'projects/lita-work-ops.html',
    'projects/lita-work-prompts.html',
    'projects/lita-work-skeleton.html',
    'projects/lita-work-skills-mcp.html',
    'projects/lita-work.html',
    'projects/lita.html',
  ]);
});
