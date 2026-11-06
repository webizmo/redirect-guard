import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL('src/', output), { recursive: true });
for (const file of ['index.html', 'src/app.js', 'src/core.js', 'src/style.css']) {
  await copyFile(new URL(file, root), new URL(file, output));
}
await writeFile(new URL('.nojekyll', output), '');
console.log(`Built static app: ${fileURLToPath(output)}`);
