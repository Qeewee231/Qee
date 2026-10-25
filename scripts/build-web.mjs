// فایل‌های وب را در پوشهٔ www برای بسته‌بندی اندروید کپی می‌کند
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons']) cpSync(f, `www/${f}`, { recursive: true });

// پل Capacitor باید پیش از کد برنامه بارگذاری شود تا افزونه‌های اندروید در دسترس باشند
cpSync('node_modules/@capacitor/core/dist/capacitor.js', 'www/capacitor.js');
const html = readFileSync('www/index.html', 'utf8').replace('<script type="module" src="js/app.js">', '<script src="capacitor.js"></script>\n  <script type="module" src="js/app.js">');
writeFileSync('www/index.html', html);
console.log('www ready');
