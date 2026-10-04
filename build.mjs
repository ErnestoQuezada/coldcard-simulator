import fs from 'fs';
import path from 'path';

const dirs = ['css', 'js', 'vendor'];
const files = ['index.html', 'favicon.ico'];

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

dirs.forEach(d => {
  if (fs.existsSync(d)) {
    fs.cpSync(d, path.join('dist', d), { recursive: true, force: true });
  }
});

files.forEach(f => {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join('dist', f));
  }
});
console.log('Copied assets to dist/ for Tauri build.');
