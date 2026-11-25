#!/usr/bin/env node
// Mesure la dette de style du client (features/client) et applique le cliquet.
//
//   node scripts/fork/style-metrics.mjs           affiche les mesures (JSON)
//   node scripts/fork/style-metrics.mjs --check   échoue si une valeur en dur a augmenté
//   node scripts/fork/style-metrics.mjs --update  enregistre les mesures actuelles comme plafond
//
// Les fichiers de jetons (design/) peuvent contenir des valeurs ; ailleurs, chaque couleur,
// taille de texte, rayon ou durée écrit en dur compte contre le plafond de style-budget.json.
/* eslint-disable sonarjs/slow-regex, compat/compat -- Script Node de mesure : expressions bornées par ligne, aucun navigateur visé. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../..');
const client = join(root, 'src/apps/modern/features/client');
const budgetPath = join(root, 'scripts/fork/style-budget.json');
const tokenDir = join(client, 'design');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
}

const files = walk(client);
const styles = files.filter(f => f.endsWith('.scss'));
const scripts = files.filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const read = f => readFileSync(f, 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function count(re, text) {
    return (text.match(re) || []).length;
}

function values(re, texts) {
    const all = texts.flatMap(t => [...t.matchAll(re)].map(m => m[1].trim()));
    return { uses: all.length, distinct: new Set(all).size };
}

function isCool(hex) {
    const h = hex.slice(1);
    const full = h.length <= 4 ? [...h.slice(0, 3)].map(c => c + c).join('') : h.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    return b - r > 12 && b >= g;
}

const styleTexts = styles.map(f => ({ file: f, text: stripComments(read(f)), token: f.startsWith(tokenDir) }));
const outside = styleTexts.filter(s => !s.token).map(s => s.text);
const everything = styleTexts.map(s => s.text);

const hex = /#[0-9a-fA-F]{3,8}\b/g;
const hexes = outside.flatMap(t => t.match(hex) || []).map(h => h.toLowerCase());

const metrics = {
    files: { scss: styles.length, tsx: scripts.length },
    lines: {
        scss: everything.reduce((n, t) => n + t.split('\n').filter(l => l.trim()).length, 0),
        tsx: scripts.reduce((n, f) => n + read(f).split('\n').filter(l => l.trim()).length, 0)
    },
    bytes: { scss: styles.reduce((n, f) => n + statSync(f).size, 0) },
    hardcoded: {
        colors: hexes.length + outside.reduce((n, t) => n + count(/rgba?\(\s*\d/g, t), 0),
        coolGreys: hexes.filter(isCool).length,
        fontSizes: outside.reduce((n, t) => n + count(/font-size:\s*[\d.]+(px|rem|em)/g, t), 0),
        fontWeights: outside.reduce((n, t) => n + count(/font-weight:\s*\d+/g, t), 0),
        radii: outside.reduce((n, t) => n + count(/border-radius:\s*[\d.]+(px|%)/g, t), 0),
        durations: outside.reduce((n, t) => n + count(/(transition|animation)(-duration)?:[^;]*\b[\d.]+m?s\b/g, t), 0)
    },
    distinct: {
        colors: new Set(hexes).size,
        fontSizes: values(/font-size:\s*([^;]+);/g, everything).distinct,
        fontWeights: values(/font-weight:\s*([^;]+);/g, everything).distinct,
        radii: values(/border-radius:\s*([^;]+);/g, everything).distinct,
        durations: new Set(everything.flatMap(t => t.match(/\b[\d.]+m?s\b/g) || []).map(d => d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000)).size,
        breakpoints: values(/@media\s*([^{]+)\{/g, everything).distinct
    },
    tokenUses: everything.reduce((n, t) => n + count(/var\(--client-/g, t), 0),
    important: everything.reduce((n, t) => n + count(/!important/g, t), 0),
    stylelintDisables: styles.reduce((n, f) => n + count(/stylelint-disable/g, read(f)), 0),
    rawButtons: scripts.reduce((n, f) => n + count(/<button\b/g, read(f)), 0),
    inlineStyles: scripts.reduce((n, f) => n + count(/style=\{\{/g, read(f)), 0)
};

const mode = process.argv[2];
if (mode === '--update') {
    writeFileSync(budgetPath, JSON.stringify({ note: 'Plafonds des valeurs en dur hors de design/. Ne jamais les relever : node scripts/fork/style-metrics.mjs --update après une baisse.', hardcoded: metrics.hardcoded }, null, 4) + '\n');
    console.log(`Plafonds enregistrés dans ${relative(root, budgetPath)}`);
} else if (mode === '--check') {
    const budget = JSON.parse(read(budgetPath)).hardcoded;
    const over = Object.entries(metrics.hardcoded).filter(([key, value]) => value > (budget[key] ?? 0));
    for (const [key, value] of over) console.error(`Valeurs en dur (${key}) : ${value}, plafond ${budget[key]}. Utiliser un jeton de design/.`);
    const under = Object.entries(metrics.hardcoded).filter(([key, value]) => value < budget[key]);
    const lowered = under.map(([key, value]) => key + ' ' + budget[key] + ' → ' + value).join(', ');
    if (!over.length && under.length) console.log(`En baisse : ${lowered}. Abaisser les plafonds avec --update.`);
    process.exit(over.length ? 1 : 0);
} else {
    console.log(JSON.stringify(metrics, null, 2));
}
/* eslint-enable sonarjs/slow-regex, compat/compat */
