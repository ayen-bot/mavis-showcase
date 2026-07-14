// Build the single-file showcase from src/ into index.html
import fs from 'fs';
const tpl = fs.readFileSync('src/template.html', 'utf8');
const data = fs.readFileSync('src/showcase_data.json', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const out = tpl.split('__DATA__').join(data).split('__APP_JS__').join(app);
fs.writeFileSync('index.html', out);
if (!fs.existsSync('.nojekyll')) fs.writeFileSync('.nojekyll', '');
console.log('built index.html', out.length, 'bytes');
