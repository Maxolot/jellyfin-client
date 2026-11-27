#!/usr/bin/env node
// Génère design/_tokens.scss à partir de design/tokens.json, la source des jetons du client.
//
//   node scripts/fork/design-tokens.mjs          écrit le fichier
//   node scripts/fork/design-tokens.mjs --check  échoue si le fichier n'est plus à jour
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../..');
const dir = join(root, 'src/apps/modern/features/client/design');
const tokens = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));
const target = join(dir, '_tokens.scss');

const themes = tokens.color.themes.map(theme => theme.id);
const [base] = themes;
const web = token => token.web ?? token.value;
const quote = value => (/[\s,()]/.test(String(value)) ? `#{"${value}"}` : value);

function themed(token, theme) {
    if (typeof token.value !== 'object') return token.value;
    return token.value[theme] ?? token.value[base];
}

const sheens = Object.fromEntries(tokens.glass.tokens.filter(token => token.applies).map(token => [token.applies, token.value]));
const glassEffects = tokens.glass.tokens.filter(token => !token.applies);

const lines = [
    '// Généré par scripts/fork/design-tokens.mjs depuis tokens.json. Ne pas modifier à la main.',
    '// stylelint-disable',
    ''
];

for (const theme of themes) {
    lines.push(`$color-${theme}: (`);
    for (const token of tokens.color.tokens) lines.push(`    '${token.name}': ${themed(token, theme)},`);
    lines.push(');', '');
}

const plain = { spacing: 'space', radius: 'radius', size: 'size', fontSize: 'text', motion: 'motion', opacity: 'opacity' };
for (const family of Object.keys(plain)) {
    lines.push(`$${family}: (`);
    for (const token of tokens[family].tokens) lines.push(`    '${token.name}': ${quote(web(token))},`);
    lines.push(');', '');
}

lines.push('$breakpoint: (');
for (const token of tokens.breakpoint.tokens) lines.push(`    '${token.name}': ${token.value},`);
lines.push(');', '');

lines.push('$type: (');
for (const group of tokens.type.groups) {
    for (const style of group.styles) {
        const entries = [
            `'size': ${quote(style.web ?? style.fontSize)}`,
            `'line-height': ${style.lineHeight}`,
            `'weight': ${style.fontWeight}`
        ];
        if (style.letterSpacing) entries.push(`'letter-spacing': ${style.letterSpacing}`);
        lines.push(`    '${style.name}': (${entries.join(', ')}),`);
    }
}
lines.push(');', '');

// Propriétés CSS : le premier thème partout, les autres seulement là où ils diffèrent.
lines.push('@mixin base-properties {');
for (const token of tokens.color.tokens) lines.push(`    --client-${token.name}: ${themed(token, base)};`);
for (const token of tokens.shadow.tokens) lines.push(`    --client-${token.name}: ${themed(token, base)};`);
for (const family of Object.keys(plain)) {
    for (const token of tokens[family].tokens) lines.push(`    --client-${token.name}: ${web(token)};`);
}
for (const token of glassEffects) lines.push(`    --client-${token.name}: none;`);
lines.push('}', '');

for (const theme of themes.slice(1)) {
    lines.push(`@mixin ${theme}-properties {`);
    for (const token of tokens.color.tokens) {
        const value = themed(token, theme);
        const sheen = sheens[token.name];
        if (sheen) lines.push(`    --client-${token.name}: ${sheen}, ${value};`);
        else if (value !== themed(token, base)) lines.push(`    --client-${token.name}: ${value};`);
    }
    for (const token of tokens.shadow.tokens) {
        if (themed(token, theme) !== themed(token, base)) lines.push(`    --client-${token.name}: ${themed(token, theme)};`);
    }
    if (theme === 'glass') for (const token of glassEffects) lines.push(`    --client-${token.name}: ${token.value};`);
    lines.push('}', '');
}

const output = `${lines.join('\n').trimEnd()}\n`;
if (process.argv[2] === '--check') {
    let current = '';
    try {
        current = readFileSync(target, 'utf8');
    } catch {
        // Fichier absent : il sera signalé comme périmé.
    }
    if (current !== output) {
        console.error('design/_tokens.scss n’est pas à jour : node scripts/fork/design-tokens.mjs');
        process.exit(1);
    }
} else {
    writeFileSync(target, output);
    console.log('design/_tokens.scss généré');
}
