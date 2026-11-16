// Preuve de non-vacuite du juge de parite types/colonnes : chaque mutation attendue rend au
// moins un controle ROUGE. Chaque mutation part du fichier d'origine (aucun cumul) et le
// sha de depart et d'arrivee est compare pour prouver la restauration a l'octet pres.
// Usage: node tools/mutation_types_sql.cjs
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JUDGE = path.join(__dirname, 'controle_types_sql.cjs');
const FILES = {
  project: path.join(ROOT, 'src/types/project.types.ts'),
  tender: path.join(ROOT, 'src/types/tender.types.ts'),
};

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12).toUpperCase();
const originals = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p)]));
const reset = () => { for (const [k, p] of Object.entries(FILES)) fs.writeFileSync(p, originals[k]); };

const mutations = [
  ['champ TS hors colonne', 'project', (s) => s.replace('export interface WorkProject {\n',
    'export interface WorkProject {\n  champ_inexistant: string;\n')],
  ['colonne SQL non lue (id)', 'project', (s) => s.replace('export interface WorkProjectStep {\n  id: string;',
    'export interface WorkProjectStep {\n  identifiant: string;')],
  ['champ imbrique renomme', 'project', (s) => s.replace('  steps?: WorkProjectStep[];', '  stepz?: WorkProjectStep[];')],
  ['interface introuvable', 'tender', (s) => s.replace('export interface TenderDocument {', 'export interface TenderPiece {')],
];

const report = [];
try {
  for (const [label, key, fn] of mutations) {
    reset();
    const base = originals[key].toString('utf8');
    const mutated = fn(base);
    if (mutated === base) {
      report.push({ label, status: 'MUTATION NON APPLIQUEE', rouges: [] });
      continue;
    }
    fs.writeFileSync(FILES[key], mutated, 'utf8');
    let out = '';
    try {
      out = execFileSync('node', [JUDGE], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      out = String(e.stdout || '') + String(e.stderr || '');
    }
    const rouges = [...out.matchAll(/^ROUGE\s+(.+?) ::/gm)].map((m) => m[1]);
    report.push({ label, status: rouges.length > 0 ? 'ROUGE' : 'INAPERCU (vert malgre la mutation)', rouges });
  }
} finally {
  reset();
}

const keys = Object.keys(FILES);
const depart = keys.map((k) => `${k} ${sha(originals[k])}`).join(' / ');
const arrivee = keys.map((k) => `${k} ${sha(fs.readFileSync(FILES[k]))}`).join(' / ');

console.log(`sha depart  ${depart}`);
for (const r of report) {
  console.log(`${r.status.padEnd(34)} ${r.label}`);
  for (const name of r.rouges) console.log(`    -> ${name}`);
}
console.log(`sha arrivee ${arrivee}`);
const restored = depart === arrivee;
const missed = report.filter((r) => r.status !== 'ROUGE');
console.log(`--- ${report.length - missed.length}/${report.length} mutations vues par le juge, restauration ${restored ? 'identique' : 'PERTEE'}`);
if (missed.length || !restored) process.exitCode = 1;
