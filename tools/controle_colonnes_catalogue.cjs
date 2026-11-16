// Juge des colonnes de catalogue utilisees par les scripts de collage (apply_NNN_confirme.sql).
// Classe de defaut : une colonne inventee dans le bloc de controle AVANT COMMIT annule tout le
// collage en 42703 ; dans la certification APRES COMMIT, elle laisse les ecritures appliquees sans
// preuve. Constate le 2026-11-16 sur apply_024 (t.relid au lieu de t.tgrelid, t.tginternal au lieu
// de t.tgisinternal), et le meme defaut reporte sur 025 et 026 ; apply_022 avait p.proargn.
// Resolution d'alias : la reference alias.colonne est jugee contre le dernier binding FROM/JOIN de
// cet alias AVANT elle dans le fichier. Un alias global (t = pg_trigger dans le controle, t =
// public.tenders dans une policy) ne peut donc pas etre juge fichier par fichier.
// Non juge : les comparaisons sans alias (DECLARE de PL/pgSQL, colonnes d information_schema non
// qualifiees) et les fonctions de catalogue (c.relispartition = fausse, qui est du rendu de fonction,
// pas une colonne absente). Le volume de references aliees est contourle par un controle dedie.
// Usage: node tools/controle_colonnes_catalogue.cjs [fichier.sql ...]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_FILE = path.join(__dirname, 'catalogue-pg17.txt');

const FILES = process.argv.slice(2).length
  ? process.argv.slice(2).map((a) => path.resolve(a))
  : fs.readdirSync(path.join(ROOT, 'supabase/checks'))
      .filter((f) => /^apply_\d{3}_confirme\.sql$/.test(f))
      .sort()
      .map((f) => path.join(ROOT, 'supabase/checks', f));

const catalog = {};
for (const line of fs.readFileSync(CATALOG_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const sep = t.indexOf('=');
  const name = t.slice(0, sep).trim().toLowerCase();
  const cols = t.slice(sep + 1);
  if (!name || !cols) continue;
  catalog[name] = new Set(cols.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean));
}

const KEYWORDS = new Set(['where', 'on', 'using', 'join', 'inner', 'left', 'right', 'full', 'cross',
  'group', 'order', 'by', 'and', 'or', 'not', 'select', 'from', 'limit', 'as', 'having', 'in',
  'exists', 'is', 'null', 'true', 'false', 'into', 'union', 'all', 'natural', 'lateral', 'for',
  'values', 'set', 'when', 'then', 'case', 'else', 'end', 'returning']);

const BINDING = /\b(?:from|join)\s+(?:(public|pg_catalog|information_schema|extensions|auth)\.)?([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z][a-z0-9_]*))?/gi;
const REF = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/g;

const results = [];
const control = (name, ok, detail) => results.push({ name, ok, detail });

let totalJudged = 0;
let totalTriggerJudged = 0;

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  const bindings = [];
  for (const m of src.matchAll(BINDING)) {
    const schema = (m[1] || '').toLowerCase();
    const table = m[2].toLowerCase();
    const aliasToken = (m[3] || '').toLowerCase();
    if (aliasToken && KEYWORDS.has(aliasToken)) continue;
    const alias = aliasToken || table;
    const key = catalog[`${schema}.${table}`] ? `${schema}.${table}` : table;
    bindings.push({ pos: m.index, alias, table: key });
  }
  const bindingFor = (alias, pos) => {
    let best = null;
    for (const b of bindings) if (b.alias === alias && b.pos < pos && (!best || b.pos > best.pos)) best = b;
    return best;
  };

  const gaps = [];
  let judged = 0;
  let triggerJudged = 0;
  for (const m of src.matchAll(REF)) {
    const alias = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    if (['public', 'auth', 'pg_temp', 'pg_catalog', 'information_schema', 'extensions'].includes(alias)) continue;
    const b = bindingFor(alias, m.index);
    if (!b || !catalog[b.table]) continue;
    judged += 1;
    if (b.table === 'pg_trigger') triggerJudged += 1;
    if (!catalog[b.table].has(col)) gaps.push(`${m[1]}.${m[2]} (${b.table})`);
  }

  totalJudged += judged;
  totalTriggerJudged += triggerJudged;
  control(`${rel}: colonnes de catalogue aliees connues`, gaps.length === 0,
    `${judged} references aliees jugees${gaps.length ? ` | ${[...new Set(gaps)].join(', ')}` : ''}`);
}

control('fichiers de collage passes', FILES.length >= 3, `${FILES.length} fichier(s) examines`);
control('juges non creux: volume de references', totalJudged >= 100,
  `${totalJudged} references aliees jugees au total`);
control('la classe pg_trigger est reellement jugee', totalTriggerJudged >= 12,
  `${totalTriggerJudged} references a pg_trigger jugees (le defaut constate portait dessus)`);

const passed = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'VERT  ' : 'ROUGE '} ${r.name} :: ${r.detail}`);
console.log(`--- ${passed.length}/${results.length} controles passes, ${failed.length} rouge(s)`);
if (failed.length) process.exitCode = 1;
