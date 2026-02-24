import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.git') && !fullPath.includes('dist')) {
            results = results.concat(walk(fullPath));
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.html')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walk(__dirname);
let totalUpdated = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const original = content;

    content = content.replace(/\bfont-(black|bold|semibold|extrabold|medium)\b/g, 'font-normal');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated', file);
        totalUpdated++;
    }
});
console.log(`Updated ${totalUpdated} files.`);
