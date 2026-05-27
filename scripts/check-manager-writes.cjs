const fs = require('fs');
const path = require('path');

const MANAGER_DIR = path.join(__dirname, '../src/pages/manager');
const FORBIDDEN_TOKENS = ['.insert(', '.update(', '.upsert(', '.delete('];

let foundErrors = false;

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory ${dir} not found. Skipping scan.`);
    return;
  }

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile() && /\.(js|jsx)$/.test(file)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      FORBIDDEN_TOKENS.forEach(token => {
        if (content.includes(token)) {
          console.error(`\x1b[31m[ERROR] Zero-write safeguard violation in ${file}:\x1b[0m found forbidden token "${token}"`);
          foundErrors = true;
        }
      });
    }
  }
}

console.log('Running Manager Zero-Write Safeguard Scan...');
scanDirectory(MANAGER_DIR);

if (foundErrors) {
  console.error('\x1b[31m[FATAL] Manager components must be purely read-only. Remove any DB write operations to pass the build.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m[OK] Zero-write safeguard passed. No DB writes found in manager pages.\x1b[0m');
  process.exit(0);
}
