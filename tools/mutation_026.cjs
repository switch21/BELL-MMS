// Preuve de non-vacuite du juge 026 : chaque mutation attendue rend au moins un controle ROUGE.
// Usage : node tools/mutation_026.cjs
// Le script de collage est mutate puis restaure a l'octet pres ; les sha de depart et d'arrivee
// sont affiches pour prouver la restauration.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const APPLY = `${__dirname}/../supabase/checks/apply_026_confirme.sql`;
const JUDGE = `${__dirname}/controle_apply_026.cjs`;

const original = fs.readFileSync(APPLY);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12).toUpperCase();

const mutations = [
  ['garde-fou retire', (s) => s.replace(/SELECT set_config\('bell\.confirme_026', 'non', false\);/, '-- garde retire')],
  ['enfant sans EXISTS parent', (s) => s.replace(
    /CREATE POLICY tender_documents_creation ON public\.tender_documents FOR INSERT TO authenticated\nWITH CHECK \(\n[\s\S]*?\n\);/,
    'CREATE POLICY tender_documents_creation ON public.tender_documents FOR INSERT TO authenticated\nWITH CHECK (public.has_permission(\'tenders:manage\'));'
  )],
  ['CASCADE transformee en RESTRICT', (s) => s.replace(
    'tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,\n    title VARCHAR(200) NOT NULL,\n    category',
    'tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE RESTRICT,\n    title VARCHAR(200) NOT NULL,\n    category'
  )],
  ['lecture sans TO authenticated', (s) => s.replace(
    'CREATE POLICY tenders_lecture ON public.tenders FOR SELECT TO authenticated USING (true);',
    'CREATE POLICY tenders_lecture ON public.tenders FOR SELECT USING (true);'
  )],
  ['certification decochee', (s) => s.replace("'chk_tender_so_status')) = 9 AS domaine_cadre", "'chk_tender_so_status')) = 8 AS domaine_cadre")],
  ['ecritee ajoutee en certification', (s) => s.replace('COMMIT;\n', 'COMMIT;\nUPDATE public.permissions SET description = NULL;\n')],
  ['contrainte renommee hors depot', (s) => s.replace('CONSTRAINT chk_tender_so_type CHECK', 'CONSTRAINT chk_tender_so_nature CHECK')],
  ['accent introduit', (s) => s.replace('-- 4. TABLE DES APPELS', `-- 4. TABLE DES APPELS D\u00C9`)],
  ['trigger deformate', (s) => s.replace(
    'CREATE TRIGGER trg_audit_tenders AFTER INSERT OR UPDATE OR DELETE ON public.tenders\nFOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();',
    'CREATE TRIGGER trg_audit_tenders AFTER INSERT ON public.tenders FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();'
  )],
  ['ancre amputee de la fonction d audit', (s) => s.replace(/audit_trigger_func'\) INTO v_audit_function;[\s\S]{0,200}?END IF;\nEND/, 'END;')],
  ['index retire', (s) => s.replace('CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON public.tenders(deadline);\n', '')],
  ['policies du marche supprimees (rls muette)', (s) => s.replace(
    /DROP POLICY IF EXISTS tenders_modification ON public\.tenders;\nCREATE POLICY tenders_modification[\s\S]*?created_by = auth\.uid\(\)\);\n/,
    ''
  )],
  ['created_by en RESTRICT au lieu de SET NULL', (s) => s.replace(
    'created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,',
    'created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,'
  )],
];

const report = [];
try {
  for (const [label, fn] of mutations) {
    const base = original.toString('utf8');
    const mutated = fn(base);
    if (mutated === base) {
      report.push({ label, status: 'MUTATION NON APPLIQUEE', rouges: [] });
      continue;
    }
    fs.writeFileSync(APPLY, mutated, 'utf8');
    let out = '';
    try {
      out = execFileSync('node', [JUDGE], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      out = String(e.stdout || '') + String(e.stderr || '');
    }
    const rouges = [...out.matchAll(/^ROUGE\s+(.+?) ::/gm)].map((m) => m[1]);
    report.push({
      label,
      status: rouges.length > 0 ? 'ROUGE' : 'INAPERCU (vert malgre la mutation)',
      rouges,
    });
  }
} finally {
  fs.writeFileSync(APPLY, original);
}

console.log(`sha depart ${sha(original)} / sha arrivee ${sha(fs.readFileSync(APPLY))}`);
for (const r of report) {
  console.log(`${r.status.padEnd(34)} ${r.label}`);
  for (const name of r.rouges) console.log(`    -> ${name}`);
}
const missed = report.filter((r) => r.status !== 'ROUGE');
console.log(`--- ${report.length - missed.length}/${report.length} mutations vues par le juge`);
if (missed.length) process.exitCode = 1;
