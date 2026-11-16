// Parite entre les champs TS payses au client et les colonnes SQL des tables 025 et 026.
// Un champ absent de la table part en INSERT/UPDATE et casse au premier clic (42703) ; une
// colonne absente du type est une donnee que le client ne relit jamais.
// Usage: node tools/controle_types_sql.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const results = [];
const control = (name, ok, detail) => results.push({ name, ok, detail });

const TYPES = read('src/types/project.types.ts') + '\n' + read('src/types/tender.types.ts');
const SQL = read('supabase/migrations/025_work_projects_schema.sql')
  + '\n' + read('supabase/migrations/026_tenders_schema.sql');

const columnsOf = (table) => {
  const start = SQL.indexOf(`CREATE TABLE IF NOT EXISTS public.${table} (`);
  if (start < 0) return null;
  const end = SQL.indexOf('\n);', start);
  const body = SQL.slice(start, end);
  return [...new Set([...body.matchAll(/^ {4}([a-z_]+)\s+[A-Za-z]/gm)].map((m) => m[1]))];
};

const fieldsOf = (iface) => {
  const start = TYPES.indexOf(`export interface ${iface} {`);
  if (start < 0) return null;
  const end = TYPES.indexOf('\n}', start);
  const body = TYPES.slice(start, end);
  return [...new Set([...body.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((m) => m[1]))];
};

// Les trois champs imbriques sont portees par une table enfante, pas par la ligne parente.
const NESTED = { WorkProject: ['steps'], Tender: ['documents', 'service_orders'] };

const PAIRS = [
  ['WorkProject', 'work_projects'],
  ['WorkProjectStep', 'work_project_steps'],
  ['Tender', 'tenders'],
  ['TenderDocument', 'tender_documents'],
  ['TenderServiceOrder', 'tender_service_orders'],
];

let compared = 0;
for (const [iface, table] of PAIRS) {
  const cols = columnsOf(table);
  const fields = fieldsOf(iface);
  const label = `${iface} vs ${table}`;
  if (!cols || !cols.length || !fields || !fields.length) {
    control(`${label}: extracteurs`, false,
      `colonnes=${cols ? cols.length : 'introuvables'}, champs=${fields ? fields.length : 'introuvables'}`);
    continue;
  }
  const allowed = (NESTED[iface] || []);
  const unknownFields = fields.filter((f) => !cols.includes(f) && !allowed.includes(f));
  const missingFields = cols.filter((c) => !fields.includes(c));
  compared += 2;
  control(`${label}: chaque champ TS est une colonne`, unknownFields.length === 0,
    `${fields.length} champs, ${allowed.length} imbrique(s) [${allowed.join(', ')}], hors colonne: [${unknownFields.join(', ')}]`);
  control(`${label}: chaque colonne SQL est lue`, missingFields.length === 0,
    `${cols.length} colonnes, absentes du type: [${missingFields.join(', ')}]`);
}

control('cinq couples type/table compares', compared === 10, `${compared}/10 comparaisons effectuees`);

const passed = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'VERT  ' : 'ROUGE '} ${r.name} :: ${r.detail}`);
console.log(`--- ${passed.length}/${results.length} controles passes`);
if (failed.length) process.exitCode = 1;
