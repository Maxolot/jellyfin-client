#!/usr/bin/env node
// Génère les jetons Compose de l'application Android TV depuis design/tokens.json, la source unique.
//
//   node scripts/fork/design-tokens-kotlin.mjs <MediathequeTokens.kt>          écrit le fichier
//   node scripts/fork/design-tokens-kotlin.mjs <MediathequeTokens.kt> --check  échoue s'il n'est plus à jour
//
// Règle d'échelle : la TV montre le client web comme un écran de 1280 px de large. Un écran TV 1080p
// fait 960 dp, donc un pixel web vaut 0,75 dp, et les valeurs fluides (clamp avec vw) sont prises à 1280 px.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWPORT = 1280;
const DP_PER_PX = 960 / VIEWPORT;

const root = join(fileURLToPath(import.meta.url), '../../..');
const tokens = JSON.parse(readFileSync(join(root, 'src/apps/modern/features/client/design/tokens.json'), 'utf8'));
const [target, flag] = process.argv.slice(2);
if (!target) {
    console.error('Chemin du fichier Kotlin manquant.');
    process.exit(2);
}

const camel = name => name.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
const number = value => Number(String(value).replace(/px$/, ''));

/** A web length at the TV viewport: plain pixels, or a clamp(min, Nvw, max) evaluated at 1280 px. */
function webPixels(token) {
    const fluid = /^clamp\(\s*([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\s*\)$/.exec(token.web || '');
    if (fluid) return Math.min(Number(fluid[3]), Math.max(Number(fluid[1]), Number(fluid[2]) * VIEWPORT / 100));
    return number(token.value);
}

const round = value => Math.round(value * 100) / 100;
const dp = px => `${round(px * DP_PER_PX)}.dp`;
const sp = px => `${round(px * DP_PER_PX)}.sp`;

function argb(hex) {
    const digits = hex.replace('#', '');
    const [rgb, alpha] = digits.length === 8 ? [digits.slice(0, 6), digits.slice(6)] : [digits, 'ff'];
    return `Color(0x${(alpha + rgb).toUpperCase()})`;
}

const themes = tokens.color.themes.map(theme => theme.id);
const themed = (token, theme) => (typeof token.value === 'object' ? token.value[theme] ?? token.value[themes[0]] : token.value);
const doc = text => `\t/** ${String(text).replace(/\*\//g, '* /').replace(/\s+/g, ' ').trim()} */`;

const lines = [
    '// Généré par scripts/fork/design-tokens-kotlin.mjs (dépôt jellyfin-client) depuis tokens.json.',
    '// Ne pas modifier à la main : changer le jeton dans tokens.json, puis relancer le générateur.',
    'package org.jellyfin.androidtv.ui.mediatheque',
    '',
    'import androidx.compose.animation.core.CubicBezierEasing',
    'import androidx.compose.ui.graphics.Color',
    'import androidx.compose.ui.text.TextStyle',
    'import androidx.compose.ui.text.font.FontWeight',
    'import androidx.compose.ui.unit.dp',
    'import androidx.compose.ui.unit.em',
    'import androidx.compose.ui.unit.sp',
    '',
    `/** Jetons de la charte Médiathèque. La TV montre le client web comme un écran de ${VIEWPORT} px : 1 px web = ${DP_PER_PX} dp. */`,
    'object MediathequeTokens {',
    `\tconst val WEB_VIEWPORT = ${VIEWPORT}`,
    '',
    '\t/** Couleurs d’un thème : Classique (opaque) ou Liquid Glass (translucide). */',
    '\tclass Palette(',
    ...tokens.color.tokens.map(token => `\t\tval ${camel(token.name)}: Color,`),
    '\t)',
    ''
];

for (const theme of themes) {
    const name = tokens.color.themes.find(entry => entry.id === theme).name;
    lines.push(`\t/** ${name}. */`, `\tval ${camel(theme)} = Palette(`);
    for (const token of tokens.color.tokens) lines.push(`\t\t${camel(token.name)} = ${argb(themed(token, theme))},`);
    lines.push('\t)', '');
}

const families = [['spacing', 'Space'], ['radius', 'Radius'], ['size', 'Size']];
for (const [family, object] of families) {
    lines.push(`\tobject ${object} {`);
    for (const token of tokens[family].tokens) {
        if (token.usage) lines.push(`\t${doc(token.usage)}`);
        const px = token.name === 'radius-pill' ? 999 : webPixels(token);
        // « space-page-margin » becomes Space.pageMargin; a number keeps its prefix (Space.space4).
        const short = token.name.replace(/^(space|radius|size)-/, '');
        lines.push(`\t\tval ${camel(/^\d/.test(short) ? token.name : short)} = ${dp(px)}`);
    }
    lines.push('\t}', '');
}

lines.push('\tobject Text {');
for (const token of tokens.fontSize.tokens) lines.push(`\t\tval ${camel(token.name.replace(/^text-/, 'size-'))} = ${sp(webPixels(token))}`);
lines.push('\t}', '');

lines.push('\t/** Styles de texte de la charte, aux tailles web prises à la largeur TV. */', '\tobject Type {');
for (const group of tokens.type.groups) {
    for (const style of group.styles) {
        const px = webPixels({ value: style.fontSize, web: style.web });
        const parts = [`fontSize = ${sp(px)}`, `lineHeight = ${style.lineHeight}.em`, `fontWeight = FontWeight(${style.fontWeight})`];
        if (style.letterSpacing) {
            const em = /^(-?[\d.]+)em$/.exec(style.letterSpacing);
            if (em) parts.push(`letterSpacing = ${em[1]}.em`);
        }
        lines.push(`\t\tval ${camel(style.name)} = TextStyle(${parts.join(', ')})`);
    }
}
lines.push('\t}', '');

lines.push('\tobject Motion {');
for (const token of tokens.motion.tokens) {
    const bezier = /^cubic-bezier\(([^)]+)\)$/.exec(token.value);
    if (bezier) lines.push(`\t\tval ${camel(token.name)} = CubicBezierEasing(${bezier[1].split(',').map(part => `${Number(part)}f`).join(', ')})`);
    else lines.push(`\t\tconst val ${camel(token.name)} = ${Number(String(token.value).replace(/ms$/, ''))}`);
}
lines.push('\t}', '');

lines.push('\tobject Opacity {');
for (const token of tokens.opacity.tokens) lines.push(`\t\tconst val ${camel(token.name.replace(/^opacity-/, ''))} = ${Number(token.value)}f`);
lines.push('\t}', '}', '');

const output = lines.join('\n');
if (flag === '--check') {
    let current = '';
    try {
        current = readFileSync(target, 'utf8');
    } catch {
        // Missing file: reported below.
    }
    if (current !== output) {
        console.error(`${target} n'est plus à jour : node scripts/fork/design-tokens-kotlin.mjs ${target}`);
        process.exit(1);
    }
    console.log('Jetons Kotlin à jour.');
} else {
    writeFileSync(target, output);
    console.log(`Écrit : ${target}`);
}
