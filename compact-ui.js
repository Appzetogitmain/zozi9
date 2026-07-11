const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'frontend/src/modules/seller/pages');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Compact paddings
    content = content.replace(/\bp-6\b/g, 'p-4');
    content = content.replace(/\bp-8\b/g, 'p-5');
    content = content.replace(/\bpy-6\b/g, 'py-4');
    content = content.replace(/\bpy-8\b/g, 'py-5');
    content = content.replace(/\bpx-6\b/g, 'px-4');
    content = content.replace(/\bpy-5\b/g, 'py-3');
    content = content.replace(/\bpy-4\b/g, 'py-2.5'); // for tables/cards

    // Compact gaps and margins
    content = content.replace(/\bgap-6\b/g, 'gap-4');
    content = content.replace(/\bgap-8\b/g, 'gap-5');
    content = content.replace(/\bspace-y-6\b/g, 'space-y-4');
    content = content.replace(/\bspace-y-8\b/g, 'space-y-5');

    // Reduce large avatars/empty state icons
    content = content.replace(/\bh-16 w-16\b/g, 'h-12 w-12');
    content = content.replace(/\bh-14 w-14\b/g, 'h-10 w-10');
    content = content.replace(/\bh-20 w-20\b/g, 'h-14 w-14');

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
console.log('Done compacting seller UI.');
