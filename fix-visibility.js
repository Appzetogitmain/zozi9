const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'frontend/src/modules/seller/pages');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Typography scaling: replace text-[9px], text-[10px], text-[11px] with text-xs
    content = content.replace(/text-\[(9|10|11)px\]/g, 'text-xs');

    // 2. Add font-bold to text-xs if it is part of an uppercase tracking label that was previously tiny
    // Actually, text-[10px] is mostly replaced, but we can look for `text-xs uppercase` and ensure it has font-bold
    // Wait, replacing text-[10px] with text-xs might be enough. Let's do it safely.
    // If it had text-xs uppercase tracking-widest, it's better if it has font-bold.
    content = content.replace(/text-xs\s+(uppercase\s+tracking-(?:wider|widest|tight|tighter))/g, 'text-xs font-bold $1');
    content = content.replace(/text-xs\s+font-(?:medium|semibold|bold)\s+text-[a-zA-Z0-9-]+\s+uppercase/g, (match) => {
        return match.replace(/font-(?:medium|semibold)/, 'font-bold');
    });

    // 3. Contrast enhancements
    // text-slate-400 -> text-slate-500
    content = content.replace(/text-slate-400/g, 'text-slate-500');
    // text-gray-400 -> text-gray-500
    content = content.replace(/text-gray-400/g, 'text-gray-500');
    // text-slate-300 -> text-slate-400 (just bump it one up)
    content = content.replace(/text-slate-300/g, 'text-slate-400');
    // text-gray-300 -> text-gray-400
    content = content.replace(/text-gray-300/g, 'text-gray-400');

    // Placeholders
    content = content.replace(/placeholder-slate-400/g, 'placeholder-slate-500');
    content = content.replace(/placeholder-slate-300/g, 'placeholder-slate-400');
    content = content.replace(/placeholder-gray-400/g, 'placeholder-gray-500');
    content = content.replace(/placeholder-gray-300/g, 'placeholder-gray-400');

    // Badge text colors for standard primary/secondary colors
    content = content.replace(/text-(indigo|blue|green|emerald|rose|red|amber|yellow|purple)-[45]00/g, 'text-$1-700');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${path.basename(filePath)}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.jsx')) {
            processFile(fullPath);
        }
    }
}

walkDir(targetDir);
console.log('Done modifying text visibility classes.');
