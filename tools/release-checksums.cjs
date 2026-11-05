const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

async function checksumLine(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return `${hash.digest('hex')}  ${path.basename(file)}\n`;
}

async function writeChecksums(manifest, files) {
  const directory = path.dirname(path.resolve(manifest));
  if (!files.length || files.some(file => path.dirname(path.resolve(file)) !== directory)) {
    throw Error('Provide at least one artifact in the checksum file directory');
  }
  const lines = [];
  for (const file of files) lines.push(await checksumLine(file));
  fs.writeFileSync(manifest, lines.join(''), 'ascii');
}

if (require.main === module) {
  const [manifest, ...files] = process.argv.slice(2);
  writeChecksums(manifest, files).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { checksumLine, writeChecksums };
