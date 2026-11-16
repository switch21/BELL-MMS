// Juge structurel de la voie de collage 026 (Marches Publics).
// Il juge la voie unique que l'owner colle dans l'editeur SQL du tableau de bord :
// supabase/checks/apply_026_confirme.sql, et sa parite avec supabase/migrations/026_tenders_schema.sql.
// Usage : node tools/controle_apply_026.cjs [chemin du script de collage a juger]
const fs = require('fs');
const crypto = require('crypto');

const ROOT = __dirname + '/..';
const APPLY = process.argv[2] || `${ROOT}/supabase/checks/apply_026_confirme.sql`;
const MIG = `${ROOT}/supabase/migrations/026_tenders_schema.sql`;

const src = fs.readFileSync(APPLY, 'utf8');
const mig = fs.readFileSync(MIG, 'utf8');
const bytes = fs.readFileSync(APPLY);

const results = [];
const control = (name, ok, detail) => results.push({ name, ok, detail });

const TABLES = ['tenders', 'tender_documents', 'tender_service_orders'];
const CHILDREN = ['tender_documents', 'tender_service_orders'];
const RIGHTS = 'tenders:manage';
const sha = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12).toUpperCase();

// Extrait le corps d une CREATE TABLE (jusqu a la ligne `);` qui la ferme).
const blockOf = (text, table) => {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i');
  return (text.match(re) || [])[1] || '';
};

// 1. Le fichier existe et n'est pas vide.
control('fichier non vide', bytes.length > 4000, `${bytes.length} octets, sha ${sha}`);

// 2. Pur ASCII : la voie de collage est le presse-papiers, les octets non ASCII se corrompent.
const nonAscii = [];
for (let i = 0; i < src.length; i += 1) {
  if (src.charCodeAt(i) > 127) nonAscii.push({ i, ch: src[i] });
}
control('script de collage en ASCII strict', nonAscii.length === 0,
  nonAscii.length === 0 ? 'aucun octet > 127' : `${nonAscii.length} octets non ASCII, premier a l index ${nonAscii[0].i}`);

// 3. Le garde-fou de confirmation existe et refuse par defaut, au numero de cette migration.
const guardSet = new RegExp(`SELECT\\s+set_config\\('bell\\.confirme_026',\\s*'non',\\s*false\\);`).test(src);
const guardRaise = new RegExp(`current_setting\\('bell\\.confirme_026', true\\)[^\\n]*<>\\s*'oui'[\\s\\S]{0,200}RAISE EXCEPTION`).test(src);
const staleGuardNames = [...new Set([...src.matchAll(/confirme_(\d{3})/g)].map((m) => m[1]))].filter((n) => n !== '026');
control('garde-fou present, refusant par defaut, propre a 026', guardSet && guardRaise && staleGuardNames.length === 0,
  `set_config=${guardSet} raise=${guardRaise} autres numeros cites=[${staleGuardNames.join(',')}]`);

// 4. Aucune ecriture avant le garde-fou.
const guardIndex = src.search(/DO \$garde\$/);
const beforeGuard = src.slice(0, guardIndex);
const writeBefore = /\b(INSERT INTO|CREATE TABLE|CREATE POLICY|CREATE TRIGGER|ALTER TABLE|DROP POLICY|DROP TRIGGER|DELETE FROM|UPDATE )\b/i
  .exec(beforeGuard);
control('aucune ecriture avant le garde-fou', guardIndex > 0 && !writeBefore,
  writeBefore ? `trouve : ${writeBefore[1].trim()}` : 'seules des lectures precedent');

// 5. BEGIN / COMMIT encadrent les ecritures, et le controle de coherence est avant le COMMIT.
const begins = (src.match(/^BEGIN;$/gm) || []).length;
const commits = (src.match(/^COMMIT;$/gm) || []).length;
const commitIndex = src.lastIndexOf('COMMIT;');
const controleIndex = src.indexOf('$controle$;');
const lastWriteBeforeCommit = Math.max(
  src.lastIndexOf('CREATE TRIGGER trg_audit_tender_service_orders'),
  src.lastIndexOf('CREATE POLICY tender_service_orders_suppression')
);
control('BEGIN et COMMIT uniques et ordonnes', begins === 1 && commits === 1
  && lastWriteBeforeCommit > 0 && lastWriteBeforeCommit < controleIndex && controleIndex < commitIndex,
  `BEGIN=${begins} COMMIT=${commits} derniere_ecriture=${lastWriteBeforeCommit} controle=${controleIndex} commit=${commitIndex}`);

// 6. Les tags dollar sont apparies et nommes (aucun $$ nu).
const tags = ['garde', 'ancre', 'controle'];
const tagPairs = tags.every((t) => (src.match(new RegExp('\\$' + t + '\\$', 'g')) || []).length === 2);
const bareDollar = /\$\$/.test(src);
control('tags dollar apparies et nommes', tagPairs && !bareDollar, `apparies=${tagPairs} $$ nu=${bareDollar}`);

// 7. Les trois tables sont creees avec IF NOT EXISTS, aucune n'est detruite.
const created = TABLES.filter((t) => new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(`, 'i').test(src));
const destructive = /\b(DROP TABLE|DROP SCHEMA|TRUNCATE)\b/i.exec(src);
control('les trois tables creees sans ecrasement, aucune destruction',
  created.length === 3 && !destructive,
  `creees: ${created.join(', ')}${destructive ? ` | destruction: ${destructive[1]}` : ''}`);

// 8. Parite des colonnes entre le script de collage et la migration du depot.
const columnsOf = (text, table) => blockOf(text, table).split('\n')
  .map((line) => line.replace(/--.*$/, '').trim())
  .filter((line) => /^[a-z_]+ (UUID|VARCHAR|TEXT|DATE|TIMESTAMPTZ|INTEGER|NUMERIC|BOOLEAN)/i.test(line))
  .map((line) => line.split(/\s+/)[0])
  .sort();
const parity = TABLES.every((t) => {
  const a = columnsOf(src, t).join(',');
  const b = columnsOf(mig, t).join(',');
  return a.length > 0 && a === b;
});
const colCount = TABLES.reduce((sum, t) => sum + columnsOf(src, t).length, 0);
control('colonnes identiques entre collage et depot', parity, `${colCount} colonnes comparees sur 3 tables`);

// 9. Toute table public.X citee existe : creee ici ou declaree dans les migrations 001-025.
const migrationDir = `${ROOT}/supabase/migrations`;
const knownTables = new Set();
for (const file of fs.readdirSync(migrationDir)) {
  if (!/^\d{3}_/.test(file) || file.startsWith('026')) continue;
  const text = fs.readFileSync(`${migrationDir}/${file}`, 'utf8');
  for (const m of text.matchAll(/CREATE TABLE IF NOT EXISTS (?:public|auth)\.([a-z_]+)/gi)) knownTables.add(m[1]);
}
const beforeCount = knownTables.size;
for (const t of TABLES) knownTables.add(t);
const citedTables = [...new Set([...src.matchAll(/\b(?:FROM|JOIN|INTO|TABLE(?: IF NOT EXISTS)?)\s+public\.([a-z_]+)/gi)].map((m) => m[1]))];
const unknownCitations = citedTables.filter((name) => !knownTables.has(name));
control('aucune table publique inconnue citee', unknownCitations.length === 0 && citedTables.length >= 4,
  `${beforeCount} tables du depot connues, ${citedTables.length} citees, inconnues: ${unknownCitations.length ? unknownCitations.join(', ') : 'aucune'}`);

// Modele commun : chaque politique est extraite jusqu a son `);` final, ce qui rend le juge
// independent de la mise en forme (une politique peut tenir sur une ligne ou sur dix).
const statementFrom = (index) => {
  const end = src.indexOf(');', index);
  return end < 0 ? '' : src.slice(index, end + 2);
};
const policies = [...src.matchAll(/CREATE POLICY (\w+) ON public\.(\w+) FOR (\w+) TO authenticated/gi)]
  .map((m) => ({ name: m[1], table: m[2], command: m[3].toUpperCase(), body: statementFrom(m.index) }));

// 10. Douze policies, quatre par table, chacune precedee de son DROP du meme nom.
const perTable = {};
for (const p of policies) {
  perTable[p.table] = (perTable[p.table] || []).concat(`${p.name}:${p.command}`);
}
const dropped = [...src.matchAll(/^DROP POLICY IF EXISTS ([a-z_]+) ON public\.(\w+);/gmi)]
  .map((m) => `${m[2]}.${m[1]}`);
const createdList = policies.map((p) => `${p.table}.${p.name}`);
const paired = createdList.every((name) => dropped.includes(name));
control('policies parees avec leur DROP', createdList.length === 12 && paired,
  `${createdList.length} policies, DROP apparies=${paired}`);

// 10b. Chaque politique extraite est bien fermee : sans `);` trouve, le corps est tronque et
// les controles suivants jugeraient un objet incomplet.
const truncated = policies.filter((p) => p.body.length === 0 || !p.body.trimEnd().endsWith(');'));
control('aucune politique tronquee dans le collage', truncated.length === 0 && policies.length === 12,
  `${policies.length} politiques, corps de ${Math.min(...policies.map((p) => p.body.length))}-${Math.max(...policies.map((p) => p.body.length))} octets, tronquees: ${truncated.length}`);

// 10c. Les quatre commandes sont couvertes par table : SELECT, INSERT, UPDATE, DELETE.
const commandGaps = TABLES.flatMap((t) => {
  const cmds = (perTable[t] || []).map((x) => x.split(':')[1]).sort().join(',');
  return cmds === 'DELETE,INSERT,SELECT,UPDATE' ? [] : [`${t}: [${cmds}]`];
});
control('quatre commandes par table', commandGaps.length === 0,
  commandGaps.length ? commandGaps.join(' | ') : 'SELECT/INSERT/UPDATE/DELETE sur les 3 tables');

// 11. Toute politique d'ecriture est gardee par tenders:manage, et par rien d'autre.
const writePolicies = policies.filter((p) => p.command === 'INSERT' || p.command === 'UPDATE');
const misplaced = [];
for (const p of writePolicies) {
  const codes = [...new Set([...p.body.matchAll(/has_permission\('([a-z:]+)'\)/g)].map((c) => c[1]))];
  if (!codes.includes(RIGHTS)) misplaced.push(`${p.name} (${p.table}) -> [${codes.join(',')}]`);
  for (const code of codes) {
    if (code !== RIGHTS) misplaced.push(`${p.name} cite ${code} hors de son domaine`);
  }
}
control('chaque ecritee gardee par tenders:manage seul',
  writePolicies.length === 6 && misplaced.length === 0,
  `${writePolicies.length} policies d ecriture testees, ecarts: ${misplaced.length ? misplaced.join(' | ') : 'aucun'}`);

// 11b. WITH CHECK cite le droit du domaine ; les UPDATE portent aussi un USING.
const clauseGaps = [];
for (const p of writePolicies) {
  const checkMatch = /WITH CHECK\s*\(\s*public\.has_permission\('([a-z:]+)'\)/.exec(p.body);
  if (!checkMatch) {
    clauseGaps.push(`${p.name} sans WITH CHECK cible`);
  } else if (checkMatch[1] !== RIGHTS) {
    clauseGaps.push(`${p.name} (${p.table}) WITH CHECK sur ${checkMatch[1]}, attendu ${RIGHTS}`);
  }
  if (p.command === 'UPDATE' && !/USING\s*\(/.test(p.body)) clauseGaps.push(`${p.name} sans USING`);
}
control('WITH CHECK present et cible sur chaque ecritee',
  clauseGaps.length === 0 && writePolicies.length === 6,
  clauseGaps.length ? clauseGaps.join(' | ') : '6/6 policies conformes');

// 12. Les UPDATE ont USING et WITH CHECK (sinon l'ancienne ligne echappe au controle).
const updatePolicies = policies.filter((p) => p.command === 'UPDATE');
const updateOk = updatePolicies.length === 3
  && updatePolicies.every((p) => /USING\s*\(/.test(p.body) && /WITH CHECK\s*\(/.test(p.body));
control('UPDATE encadre en USING et WITH CHECK', updateOk, `${updatePolicies.length} policies UPDATE testees`);

// 12b. Le DELETE du marche reste reserve a la direction ; celui des enfants garde le domaine.
const deletePolicies = policies.filter((p) => p.command === 'DELETE');
const deleteGaps = [];
for (const p of deletePolicies) {
  if (p.table === 'tenders' && !/get_auth_role\(\) IN \('directeur_general', 'super_admin'\)/.test(p.body)) {
    deleteGaps.push(`${p.name}: suppression du marche non reservee a la direction`);
  }
  if (CHILDREN.includes(p.table) && !new RegExp(`has_permission\\('${RIGHTS}'\\)`).test(p.body)) {
    deleteGaps.push(`${p.name}: suppression enfant sans droit domaine`);
  }
}
control('suppressions cadrees (direction / domaine)',
  deletePolicies.length === 3 && deleteGaps.length === 0,
  deleteGaps.length ? deleteGaps.join(' | ') : `${deletePolicies.length}/3 policies DELETE conformes`);

// 12c. Les lecture SELECT sont ouvertes aux authentifies : le suivi des marches est commun.
const selectPolicies = policies.filter((p) => p.command === 'SELECT');
const selectOk = selectPolicies.length === 3
  && selectPolicies.every((p) => /USING \(true\)/.test(p.body));
control('lecture ouverte aux authentifies (USING true)', selectOk,
  `${selectPolicies.length} policies SELECT: ${selectPolicies.map((p) => p.name).join(', ')}`);

// 12d. Pieces et ordres se jugent par leur marche parent : sans EXISTS sur tenders, un charge
// de marche ne peut ni monter son dossier ni enregistrer ses ordres de service.
const childWritePolicies = policies.filter((p) => CHILDREN.includes(p.table) && p.command !== 'SELECT');
const parentBranch = /EXISTS \(\s*SELECT 1 FROM public\.tenders AS t\s*WHERE t\.id = tender_id AND \(t\.assigned_to = auth\.uid\(\) OR t\.created_by = auth\.uid\(\)\)\s*\)/;
const parentGaps = childWritePolicies.filter((p) => !parentBranch.test(p.body)).map((p) => `${p.name} (${p.command})`);
control('enfants juges par leur marche parent',
  parentGaps.length === 0 && childWritePolicies.length === 6,
  `${childWritePolicies.length} policies enfant testees, sans EXISTS: ${parentGaps.length ? parentGaps.join(', ') : 'aucun'}`);

// 12e. Le marche lui-meme laisse le charge ou le createur corriger sa ligne.
const tenderUpdate = (updatePolicies.find((p) => p.table === 'tenders') || {}).body || '';
const tenderSelfOk = /assigned_to = auth\.uid\(\)/.test(tenderUpdate) && /created_by = auth\.uid\(\)/.test(tenderUpdate);
control('marche modifiable par son charge ou son createur', tenderSelfOk,
  `corps UPDATE de ${tenderUpdate.length} octets`);

// 13. Trois triggers d'audit, couple COMPLETE, sur la fonction d'audit du depot.
const triggers = [...src.matchAll(/CREATE TRIGGER (trg_audit_\w+) AFTER INSERT OR UPDATE OR DELETE ON public\.(\w+)\s*\nFOR EACH ROW EXECUTE FUNCTION public\.audit_trigger_func\(\);/gi)];
control('triggers d audit branches', triggers.length === 3
  && triggers.map((m) => m[2]).sort().join(',') === 'tender_documents,tender_service_orders,tenders',
  `${triggers.length} triggers: ${triggers.map((m) => m[2]).join(', ')}`);

// 14. RLS activee sur les trois tables uniquement par ENABLE ROW LEVEL SECURITY.
const rls = TABLES.filter((t) => new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`, 'i').test(src));
control('RLS activee sur les trois tables', rls.length === 3, `activee: ${rls.join(', ')}`);

// 15. Neuf contraintes de domaine nommees, et le controle les attend toutes.
const chkNames = ['chk_tender_method', 'chk_tender_status', 'chk_tender_deadline', 'chk_tender_advance',
  'chk_tender_execution_delay', 'chk_tender_doc_category', 'chk_tender_doc_status',
  'chk_tender_so_type', 'chk_tender_so_status'];
const declared = chkNames.filter((n) => new RegExp(`CONSTRAINT ${n} CHECK`, 'i').test(src));
const expectedInControl = chkNames.every((n) => src.includes(`'${n}'`));
control('contraintes de domaine declarees et attendues', declared.length === 9 && expectedInControl,
  `${declared.length}/9 declarees, attendues du controle=${expectedInControl}`);

// 15b. Ni deux pieces identiques dans un meme dossier, ni deux ordres a la meme reference.
const uniqueNames = ['uq_tender_document', 'uq_tender_service_order'];
const uniqueGaps = uniqueNames.filter((n) => !new RegExp(`CONSTRAINT ${n} UNIQUE`, 'i').test(src));
const uniqueInMigration = uniqueNames.filter((n) => new RegExp(`CONSTRAINT ${n} UNIQUE`, 'i').test(mig));
control('unicites nommees declarees des deux cotes',
  uniqueGaps.length === 0 && uniqueInMigration.length === 2,
  `collage=${2 - uniqueGaps.length}/2, depot=${uniqueInMigration.length}/2`);

// 15c. Chaque enfant doit sa propre ligne tender_id en ON DELETE CASCADE : juge table par table,
// un CASCADE absent ou remplace par RESTRICT/SET NULL ne peut pas se cacher derriere l'autre table.
const childFkLine = (text, table) => {
  const line = blockOf(text, table).split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .find((l) => /^tender_id UUID NOT NULL REFERENCES/.test(l));
  return line || '';
};
const cascadeGaps = CHILDREN.flatMap((t) => {
  const paste = childFkLine(src, t);
  const migration = childFkLine(mig, t);
  const gaps = [];
  if (!/ON DELETE CASCADE,$/.test(paste)) gaps.push(`${t} (collage): ${paste || 'ligne tender_id absente'}`);
  if (!/ON DELETE CASCADE,$/.test(migration)) gaps.push(`${t} (depot): ${migration || 'ligne tender_id absente'}`);
  return gaps;
});
control('cles etrangeres enfants en ON DELETE CASCADE, table par table',
  cascadeGaps.length === 0,
  cascadeGaps.length ? cascadeGaps.join(' | ') : '2/2 enfants en CASCADE des deux cotes');

// 15d. Les cles vers auth.users ne cassent pas le marche quand un compte part : SET NULL.
const ownerColumns = [];
for (const t of TABLES) {
  for (const line of blockOf(src, t).split('\n').map((l) => l.replace(/--.*$/, '').trim())) {
    const m = /^((?:assigned_to|created_by) UUID REFERENCES auth\.users\(id\) [A-Z ]+ NULL)/.exec(line);
    if (m) ownerColumns.push(m[1]);
    else if (/^(assigned_to|created_by) UUID/.test(line)) ownerColumns.push(`INCONNU: ${line}`);
  }
}
const ownersOk = ownerColumns.length === 4
  && ownerColumns.every((c) => c === 'assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL'
    || c === 'created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL');
control('references auth.users en SET NULL (charge et createur)', ownersOk,
  `${ownerColumns.length} colonnes attachees: ${ownerColumns.join(' / ')}`);

// 15e. La reference du marche est unique : deux avis ne peuvent porter la meme reference.
const refUnique = /reference VARCHAR\(50\) UNIQUE NOT NULL/.test(src) && /reference VARCHAR\(50\) UNIQUE NOT NULL/.test(mig);
control('reference marche unique declaree des deux cotes', refUnique, `collage=${refUnique}`);

// 16. 026 ne touche pas la matrice des droits : aucun INSERT/UPDATE/DELETE de permissions.
const matrixWrites = /\b(INSERT INTO public\.permissions|INSERT INTO public\.role_permissions|DELETE FROM public\.role_permissions|DELETE FROM public\.permissions|UPDATE public\.permissions|UPDATE public\.role_permissions)\b/i.exec(src);
const policyCodes = [...new Set([...src.matchAll(/has_permission\('([a-z:]+)'\)/g)].map((m) => m[1]))].sort();
control('aucune ecriture dans la matrice des droits', !matrixWrites && policyCodes.join(',') === RIGHTS,
  matrixWrites ? `trouve : ${matrixWrites[1]}` : `codes cites par les policies: [${policyCodes.join(',')}]`);

// 17. Les cinq index attendus sont declares des les deux cotes.
const indexNames = ['idx_tenders_status', 'idx_tenders_deadline', 'idx_tenders_assigned',
  'idx_tender_documents_tender', 'idx_tender_service_orders_tender'];
const idxDeclared = indexNames.filter((n) => new RegExp(`CREATE INDEX IF NOT EXISTS ${n} ON public\\.`, 'i').test(src));
const idxInMigration = indexNames.filter((n) => new RegExp(`CREATE INDEX IF NOT EXISTS ${n} ON public\\.`, 'i').test(mig));
const idxInControl = indexNames.every((n) => src.includes(`'${n}'`));
control('index declares des les deux cotes et attendus du controle',
  idxDeclared.length === 5 && idxInMigration.length === 5 && idxInControl,
  `collage=${idxDeclared.length}/5, depot=${idxInMigration.length}/5, controle=${idxInControl}`);

// 18. Le controle avant COMMIT attend exactement les memes nombres que la realite du script.
const wants = {
  policies_tenders: /v_policies_tenders <> (\d+)/.exec(src),
  policies_documents: /v_policies_documents <> (\d+)/.exec(src),
  policies_orders: /v_policies_orders <> (\d+)/.exec(src),
  triggers: /v_triggers <> (\d+)/.exec(src),
  checks: /v_checks <> (\d+)/.exec(src),
  indexes: /v_indexes <> (\d+)/.exec(src),
  uniques: /v_uniques <> (\d+)/.exec(src),
  cascades: /v_cascades <> (\d+)/.exec(src),
};
const reality = {
  policies_tenders: (perTable.tenders || []).length,
  policies_documents: (perTable.tender_documents || []).length,
  policies_orders: (perTable.tender_service_orders || []).length,
  triggers: triggers.length,
  checks: declared.length,
  indexes: idxDeclared.length,
  uniques: uniqueNames.length - uniqueGaps.length,
  cascades: CHILDREN.length - cascadeGaps.filter((g) => g.includes('(collage)')).length,
};
const wantsList = Object.fromEntries(Object.entries(wants).map(([k, m]) => [k, m ? Number(m[1]) : -1]));
const coherent = Object.keys(reality).every((k) => wantsList[k] === reality[k]);
control('controle avant COMMIT coherent avec le script', coherent && Object.keys(wants).length === 8,
  `attendu ${JSON.stringify(wantsList)} vs reel ${JSON.stringify(reality)}`);

// 18b. La certification rend les memes compteurs que le controle : pas de chiffre decoche.
const after = src.slice(commitIndex);
const certCounts = {
  marche_policies: /tablename = 'tenders'\) = (\d+)/.exec(after),
  piece_policies: /tablename = 'tender_documents'\) = (\d+)/.exec(after),
  ordre_policies: /tablename = 'tender_service_orders'\) = (\d+)/.exec(after),
  rls: /c\.relname IN \('tenders', 'tender_documents', 'tender_service_orders'\)[\s\S]{0,140}?\) = (\d+) AS rls_active/.exec(after),
  audit: /'trg_audit_tender_service_orders'\)\) = (\d+) AS audit_branche/.exec(after),
  domaine: /'chk_tender_so_status'\)\) = (\d+) AS domaine_cadre/.exec(after),
  unique: /'uq_tender_service_order'\)\) = (\d+) AS unique_cadre/.exec(after),
  cascade: /confdeltype = 'c'\) = (\d+) AS cascade_ok/.exec(after),
  matrice: /= (\d+) AS matrice_inchangee/.exec(after),
};
const certReality = {
  marche_policies: String((perTable.tenders || []).length),
  piece_policies: String((perTable.tender_documents || []).length),
  ordre_policies: String((perTable.tender_service_orders || []).length),
  rls: String(rls.length),
  audit: String(triggers.length),
  domaine: String(declared.length),
  unique: String(uniqueNames.length - uniqueGaps.length),
  cascade: String(reality.cascades),
  matrice: '2',
};
const certGaps = Object.entries(certReality).filter(([k, v]) => certCounts[k]?.[1] !== v)
  .map(([k, v]) => `${k}: certifie ${certCounts[k] ? certCounts[k][1] : 'absente'}, script ${v}`);
control('certification alignee sur les compteurs du script', certGaps.length === 0,
  certGaps.length ? certGaps.join(' | ') : JSON.stringify(certReality));

// 19. Apres le COMMIT, plus aucune ecriture : la certification est en lecture seule.
const writesAfter = /\b(INSERT INTO|CREATE TABLE|CREATE POLICY|CREATE TRIGGER|ALTER TABLE|DROP POLICY|DROP TRIGGER|DELETE FROM|UPDATE )\b/i
  .exec(after);
control('certification en lecture seule', !writesAfter,
  writesAfter ? `ecriture trouvee apres COMMIT : ${writesAfter[1].trim()}` : 'aucune ecriture apres COMMIT');

// 19b. La certification tient sur une seule requete SELECT.
const selectAfterCommit = (after.match(/^\s*SELECT/gim) || []).length;
control('certification = une seule requete', selectAfterCommit === 1, `${selectAfterCommit} SELECT apres COMMIT`);

// 20. Parite des noms d'objets entre le script colle et la migration du depot.
const policyNamesIn = (text) => [...new Set([...text.matchAll(/CREATE POLICY (\w+)/g)].map((m) => m[1]))].sort();
const constraintNamesIn = (text) => [...new Set([...text.matchAll(/CONSTRAINT (\w+)/g)].map((m) => m[1]))]
  .filter((n) => /^(chk_|uq_)/.test(n)).sort();
const triggerNamesIn = (text) => [...new Set([...text.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]))].sort();
const indexNamesIn = (text) => [...new Set([...text.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]))].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const paritySets = {
  policies: [policyNamesIn(src), policyNamesIn(mig)],
  constraints: [constraintNamesIn(src), constraintNamesIn(mig)],
  triggers: [triggerNamesIn(src), triggerNamesIn(mig)],
  indexes: [indexNamesIn(src), indexNamesIn(mig)],
};
const parityGaps = Object.entries(paritySets)
  .filter(([, [a, b]]) => !same(a, b))
  .map(([k, [a, b]]) => `${k}: [${a.join(',')}] vs [${b.join(',')}]`);
control('objets nommes identiques entre collage et depot',
  parityGaps.length === 0
  && paritySets.policies[0].length === 12
  && paritySets.constraints[0].length === 11
  && paritySets.triggers[0].length === 3
  && paritySets.indexes[0].length === 5,
  `policies=${paritySets.policies[0].length} contraintes=${paritySets.constraints[0].length} triggers=${paritySets.triggers[0].length} index=${paritySets.indexes[0].length} ecarts: ${parityGaps.length ? parityGaps.join(' | ') : 'aucun'}`);

// 21. Les branches citees par les CHECK existent dans les listes du client.
const valuesOf = (text, constraint) => {
  const re = new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\s*[a-z_]+ IN \\(([^)]*)\\)`, 'gi');
  const m = re.exec(text);
  return m ? [...new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((v) => v[1]))].sort() : [];
};
const client = fs.readFileSync(`${ROOT}/src/types/tender.types.ts`, 'utf8');
const clientLists = {
  TenderStatus: (client.match(/export type TenderStatus =([\s\S]*?);/) || [])[1],
  TenderMethod: (client.match(/export type TenderMethod =([\s\S]*?);/) || [])[1],
  TenderDocStatus: (client.match(/export type TenderDocStatus =([\s\S]*?);/) || [])[1],
  TenderDocCategory: (client.match(/export type TenderDocCategory =([\s\S]*?);/) || [])[1],
  ServiceOrderType: (client.match(/export type ServiceOrderType =([\s\S]*?);/) || [])[1],
  ServiceOrderStatus: (client.match(/export type ServiceOrderStatus =([\s\S]*?);/) || [])[1],
};
const domainChecks = [
  ['status', valuesOf(src, 'chk_tender_status'), clientLists.TenderStatus, 8],
  ['method', valuesOf(src, 'chk_tender_method'), clientLists.TenderMethod, 4],
  ['piece status', valuesOf(src, 'chk_tender_doc_status'), clientLists.TenderDocStatus, 5],
  ['piece categorie', valuesOf(src, 'chk_tender_doc_category'), clientLists.TenderDocCategory, 3],
  ['ordre type', valuesOf(src, 'chk_tender_so_type'), clientLists.ServiceOrderType, 3],
  ['ordre status', valuesOf(src, 'chk_tender_so_status'), clientLists.ServiceOrderStatus, 5],
];
const domainGaps = [];
for (const [label, values, blob, expected] of domainChecks) {
  if (!blob || values.length !== expected) domainGaps.push(`${label}: ${values.length} valeurs, attendues ${expected}`);
  else if (!values.every((v) => blob.includes(`'${v}'`))) domainGaps.push(`${label}: valeurs absentes du client`);
}
control('domaines SQL == types du client', domainGaps.length === 0,
  domainGaps.length ? domainGaps.join(' | ') : domainChecks.map((d) => `${d[0]}=${d[1].length}`).join(', '));

// 22. Le garde-fou d'ancre refuse le collage si le droit ou les fonctions de security manquent.
const ancreBlock = (src.match(/DO \$ancre\$([\s\S]*?)\$ancre\$;/) || [])[1] || '';
const ancreOk = /tenders:manage/.test(ancreBlock)
  && /has_permission/.test(ancreBlock)
  && /audit_trigger_func/.test(ancreBlock)
  && (ancreBlock.match(/RAISE EXCEPTION/g) || []).length === 3;
control('ancres du droit et des fonctions avant toute ecriture', ancreOk && ancreBlock.length > 200,
  `corps $ancre$ de ${ancreBlock.length} octets, exceptions ${(ancreBlock.match(/RAISE EXCEPTION/g) || []).length}`);

const passed = results.filter((r) => r.ok); const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'VERT  ' : 'ROUGE '} ${r.name} :: ${r.detail}`);
console.log(`--- ${passed.length}/${results.length} controles passes (${APPLY})`);
if (failed.length) process.exitCode = 1;
