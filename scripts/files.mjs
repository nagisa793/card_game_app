import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function inventory(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${name}`);
    if (entry.isDirectory()) Object.assign(files, await inventory(root, name));
    else if (entry.isFile()) files[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  }
  return files;
}
