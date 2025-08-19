const fs = require('fs');
const path = require('path');

const IGNORED_ITEMS = [
  'node_modules', '.git', 'dist', 'build', '.firebase', 'hosting.cHVibGlj.cache', 
  '.firebaserc', '.gitignore', 'package-lock.json', 'package.json', 'public', 
  'README.md', 'firebase.json', 'serviceAccountKey.json', '.env', 
  '.env.development', '.env.production', '.env.development.local', '.github', 'venv', 'lib'
];

function getDirectoryTree(dirPath, depth = 0) {
  const indent = '-'.repeat(depth * 2);
  const items = fs.readdirSync(dirPath);

  items.forEach(item => {
    const fullPath = path.join(dirPath, item);
    const isDirectory = fs.lstatSync(fullPath).isDirectory();

    if (!IGNORED_ITEMS.includes(item)) {
      console.log(`${indent}${item}`);
      if (isDirectory) {
        getDirectoryTree(fullPath, depth + 1);
      }
    }
  });
}

const projectRoot = path.resolve(__dirname, '..');
console.log(projectRoot);
getDirectoryTree(projectRoot);