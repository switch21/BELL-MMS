'use strict';
// Juge de H1 : l'attribution d'audit par le jeton de l'appelant.
//
//   node tools/controle_attribution_h1.cjs            -> etat du depot
//   node tools/controle_attribution_h1.cjs --mordre   -> une morsure par controle, exige un ROUGE
//
// La propriete jugee n'est pas « le mot asCaller apparait » : c'est « toute ecrite sur profiles
// est porteuse de l'identite de l'appelant, et rien d'autre n'a change de client ». Le juge compte
// donc des instances par verbe et par client, et verifie la premisse elle-meme (003 prend bien
// l'acteur dans auth.uid(), 027 borne bien l'ecrite par WITH CHECK) : sans elles, H1 ne prouverait
// plus rien et le juge resterait vert.
//
// Choix assumé et juge comme tel : aucune ligne d'audit auto-declaree n'est ecrite par la fonction
// (voie H2). Le journal reste tenu par le trigger seul, donc une seule ligne par ecrite, et cette
// ligne porte des valeurs lues en base et non declarees par l'acteur.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const L = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(0, 12);

const FIC = {
  create: 'supabase/functions/admin-create-user/index.ts',
  update: 'supabase/functions/admin-update-user/index.ts',
  mig027: 'supabase/migrations/027_role_access_hierarchy.sql',
  mig003: 'supabase/migrations/003_audit_triggers.sql',
  page: 'src/modules/users/UsersPage.tsx',
};

const res = [];
const ok = (nom, propriete, obtenu) => res.push({ nom, ok: true, propriete, obtenu });
const ko = (nom, propriete, obtenu) => res.push({ nom, ok: false, propriete, obtenu });

// Les appels .from('table').<verbe>( en (client, table, verbe), hors commentaires.
function sansCommentairesJs(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function appels(src) {
  const s = sansCommentairesJs(src);
  const out = [];
  const re = /\.from\('([a-z_]+)'\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const avant = s.slice(0, m.index);
    const client = (avant.match(/await\s+([A-Za-z_$][\w$]*)\s*$/) || [])[1] || null;
    const apres = s.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const verbe = (apres.match(/\.(update|insert|delete|upsert|select)\(/) || [])[1] || null;
    out.push({ client, table: m[1], verbe });
  }
  return out;
}

const compte = (lst, f) => lst.filter(f).length;
const renduEcrits = (lst) =>
  'asCaller ' + compte(lst, (a) => a.client === 'asCaller' && ['update', 'insert', 'delete', 'upsert'].includes(a.verbe)) +
  ' / admin ' + compte(lst, (a) => a.client === 'admin' && ['update', 'insert', 'delete', 'upsert'].includes(a.verbe)) +
  ' / autre ' + compte(lst, (a) => a.client !== 'asCaller' && a.client !== 'admin');

function juger() {
  res.length = 0;
  const c = L(FIC.create);
  const u = L(FIC.update);
  const m027 = L(FIC.mig027);
  const m003 = L(FIC.mig003);
  const page = L(FIC.page);
  const ac = appels(c);
  const au = appels(u);

  // 1. Premisse 1 : l'acteur du journal vient de auth.uid(), donc une ecrite en service_role ne
  //    peut pas etre attribuee. Si 003 changeait de source d'acteur, tout H1 serait a revoir.
  if (/v_user_id\s*:=\s*auth\.uid\(\);/.test(sansCommentairesJs(m003))) {
    ok('premise acteur = auth.uid()', 'audit_trigger_func tient bien son acteur dans auth.uid()', '003:13 present');
  } else {
    ko('premise acteur = auth.uid()', 'audit_trigger_func tient bien son acteur dans auth.uid()', 'affectation introuvable dans 003');
  }

  // 2. Premisse 2 : la politique 027 borne l'ecrite par WITH CHECK can_manage_profile. C'est la
  //    deuxieme couche que H1 rend opposable ; sans elle, H1 n'apporte que l'attribution.
  if (/CREATE POLICY "Gestion des profils par les administrateurs"[\s\S]{0,400}WITH CHECK \(public\.can_manage_profile\(id, role_id\)\)/.test(m027)) {
    ok('premise with_check 027', 'la politique administrateur porte can_manage_profile dans WITH CHECK', '027: politique FOR ALL avec verrou');
  } else {
    ko('premise with_check 027', 'la politique administrateur porte can_manage_profile dans WITH CHECK', 'WITH CHECK absent ou rebute');
  }

  // 3. Les trois cles sont exigees avant toute construction de client : un anonKey undefined
  //    construirait un client muet, pas une erreur.
  for (const [nom, src] of [['admin-create-user', c], ['admin-update-user', u]]) {
    const exige = /if \(!supabaseUrl \|\| !serviceRoleKey \|\| !anonKey\)/.test(src);
    const lu = /Deno\.env\.get\('SUPABASE_ANON_KEY'\)/.test(src);
    if (exige && lu) {
      ok('cle anon exigee (' + nom + ')', 'SUPABASE_ANON_KEY est lue ET exigee par le garde-fou de configuration', 'les trois variables');
    } else {
      ko('cle anon exigee (' + nom + ')', 'SUPABASE_ANON_KEY est lue ET exigee par le garde-fou de configuration',
        'lue=' + lu + ' exigee=' + exige);
    }
  }

  // 4. Le client d'appelant est bien un client authentifie : cle anon + en-tete Authorization
  //    repris tel quel de la requete. Une cle service dans ce client serait la faille meme.
  for (const [nom, src] of [['admin-create-user', c], ['admin-update-user', u]]) {
    const bloc = (src.match(/const asCaller = createClient\([\s\S]{0,240}?\);/) || [])[0] || '';
    const bon = /createClient\(supabaseUrl, anonKey,/.test(bloc) &&
      /global: \{ headers: \{ Authorization: authorization \} \}/.test(bloc);
    const uneSeuleCleService = compte(src.match(/createClient\(supabaseUrl, serviceRoleKey,/g) || [], () => true) === 1;
    if (bon && uneSeuleCleService) {
      ok('client d appelant (' + nom + ')', 'anonKey + Authorization repris de la requete, une seule client en cle service', 'asCaller conforme');
    } else {
      ko('client d appelant (' + nom + ')', 'anonKey + Authorization repris de la requete, une seule client en cle service',
        'bloc=' + (bloc ? 'trouve' : 'absent') + ' conforme=' + bon + ' cle service x' + (src.match(/createClient\(supabaseUrl, serviceRoleKey,/g) || []).length);
    }
  }

  // 5. Le jeton porte l'identite deux fois : la garde en verifie un, l'ecrite envoie l'autre.
  //    Le juge exige que la garde recoive la MEME valeur que le client d'appelant.
  for (const [nom, src] of [['admin-create-user', c], ['admin-update-user', u]]) {
    const varGarde = (src.match(/checkCallerCanManageUsers\(admin,\s*([A-Za-z_$][\w$]*)\)/) || [])[1];
    const entete = /const authorization = req\.headers\.get\('Authorization'\)/.test(src);
    const reuse = /admin\.auth\.getUser\(token\)/.test(sansCommentairesJs(src));
    if (varGarde === 'authorization' && entete && reuse) {
      ok('jeton unique (' + nom + ')', 'la garde et l ecrite portent la meme valeur d en-tete, lue une seule fois', 'authorization -> garde + asCaller');
    } else {
      ko('jeton unique (' + nom + ')', 'la garde et l ecrite portent la meme valeur d en-tete, lue une seule fois',
        'garde=' + varGarde + ' enteteLu=' + entete);
    }
  }

  // 6. Le compte central : aucune ecrite profiles par la cle service, et le nombre exact
  //    d ecrites par l'appelant (2 dans update : l'ecrite + le retour arriere ; 1 dans create).
  const attendu = { 'admin-update-user': 2, 'admin-create-user': 1 };
  for (const [nom, lst] of [['admin-create-user', ac], ['admin-update-user', au]]) {
    const surAppelant = compte(lst, (a) => a.client === 'asCaller' && ['update', 'insert', 'delete', 'upsert'].includes(a.verbe));
    const surService = compte(lst, (a) => a.client === 'admin' && ['update', 'insert', 'delete', 'upsert'].includes(a.verbe));
    const tableauInconnu = compte(lst, (a) => a.client === 'asCaller' && a.table !== 'profiles');
    if (surService === 0 && surAppelant === attendu[nom] && tableauInconnu === 0) {
      ok('ecrites attribuees (' + nom + ')', 'toute ecrite profiles part du jeton appelant, aucune de la cle service, ' + attendu[nom] + ' attendue(s)', renduEcrits(lst));
    } else {
      ko('ecrites attribuees (' + nom + ')', 'toute ecrite profiles part du jeton appelant, aucune de la cle service, ' + attendu[nom] + ' attendue(s)',
        renduEcrits(lst) + ' | autre table par asCaller x' + tableauInconnu);
    }
  }

  // 7. Le retour arriere est attribue lui aussi : un rollback muet laisserait une ecrite sans
  //    acteur justement quand quelque chose a casse.
  const rollback = (u.match(/const restoreProfile = async \(\) => \{[\s\S]{0,120}?\.(from)/) || [])[1];
  const rollbackClient = (u.match(/const restoreProfile = async \(\) => \{\s*const \{ error: rollbackError \} = await ([A-Za-z_$][\w$]*)/) || [])[1];
  if (rollbackClient === 'asCaller' && rollback === 'from') {
    ok('retour arriere attribue', 'restoreProfile ecrit sous le jeton de l appelant', 'restoreProfile -> asCaller');
  } else {
    ko('retour arriere attribue', 'restoreProfile ecrit sous le jeton de l appelant', 'client observe = ' + rollbackClient);
  }

  // 8. Les lectures de la garde restent en cle service : H1 ne deplace que les ecrites. Le compte
  //    est une mesure du depot, la propriete jugee est « aucune lecture sur le client d appelant ».
  const lecturesService = compte(au.concat(ac), (a) => a.verbe === 'select' && a.client === 'admin');
  const lecturesAppelant = compte(au.concat(ac), (a) => a.verbe === 'select' && a.client === 'asCaller');
  if (lecturesAppelant === 0 && lecturesService > 0) {
    ok('lectures inchangees', 'aucune lecture deplacee sur le client d appelant', 'cle service x' + lecturesService + ', appelant x' + lecturesAppelant);
  } else {
    ko('lectures inchangees', 'aucune lecture deplacee sur le client d appelant', 'cle service x' + lecturesService + ', appelant x' + lecturesAppelant);
  }

  // 9. L'Admin Auth reste en cle service : le jeton d'appelant n'a aucun droit sur auth.admin, et
  //    un appel deplace ferait echouer mot de passe / email / ban.
  const authAdmin = (src) => (sansCommentairesJs(src).match(/([A-Za-z_$][\w$]*)\.auth\.admin\./g) || []).map((s) => s.split('.')[0]);
  const clientsAuthAdmin = authAdmin(c).concat(authAdmin(u));
  const deplaces = clientsAuthAdmin.filter((cli) => cli !== 'admin');
  if (deplaces.length === 0 && clientsAuthAdmin.length > 0) {
    ok('Admin API en service', 'les appels auth.admin.* restent sur le client service_role',
      'x' + clientsAuthAdmin.length + ', aucun deplace');
  } else {
    ko('Admin API en service', 'les appels auth.admin.* restent sur le client service_role',
      'x' + clientsAuthAdmin.length + ' deplaces=[' + deplaces.join(',') + ']');
  }

  // 10. Le message rendu quand 0 ligne bouge nomme la politique : depuis H1, ce cas n'est plus
  //     seulement « profil introuvable » (la cible a ete lue juste avant), c'est un desaccord RLS.
  if (/Aucune ligne modifiée[\s\S]{0,140}(politique de sécurité|RLS)/.test(u) && !/Aucune ligne modifiée : le profil est introuvable/.test(u)) {
    ok('message de 0 ligne', 'le refus muet est explique par la politique, pas par une absence', 'texte cite la politique de securite');
  } else {
    ko('message de 0 ligne', 'le refus muet est explique par la politique, pas par une absence', 'ancien texte ou politique non nommee');
  }

  // 11. Aucun commentaire ne doit continuer a affirmer que la RLS ne sert pas sur ce chemin :
  //     une preuve fausse dans le depot égare le prochain lecteur plus qu'une absence de preuve.
  if (!/la RLS ne sert pas ici|la fonction ecrit avec la cle service_role/.test(c + u)) {
    ok('commentaire pourri retire', 'plus aucun texte n affirme que la RLS est franchie par ces ecrites', 'ancre absente des deux fichiers');
  } else {
    ko('commentaire pourri retire', 'plus aucun texte n affirme que la RLS est franchie par ces ecrites', 'ancienne affirmation encore presente');
  }

  // 12. La garde de niveau en code survit : H1 ajoute une couche, il ne retire pas le message
  //     lisible qui precede l'ecrite (refus 403 avant tout essai).
  const refus = [
    ['admin-update-user', /targetLevel > guard\.level/, 'cible au-dessus'],
    ['admin-update-user', /\(role\.access_level \?\? 0\) > guard\.level/, 'role au-dessus'],
    ['admin-update-user', /userId === guard\.callerId && roleId !== target\.role_id/, 'auto-changement de role'],
    ['admin-create-user', /\(role\.access_level \?\? 0\) > guard\.level/, 'role au-dessus'],
  ];
  const manquants = refus.filter(([nom, re]) => !(nom === 'admin-create-user' ? c : u).match(re)).map(([_, ___, lib]) => lib);
  if (manquants.length === 0) {
    ok('garde de niveau en code', 'les 4 refus de niveau precedent toujours l ecrite', '4/4 presents');
  } else {
    ko('garde de niveau en code', 'les 4 refus de niveau precedent toujours l ecrite', 'manquant(s) : ' + manquants.join(', '));
  }

  // 13. Le journal reste tenu par le trigger seul (voie H2 refusee) : une fonction qui insererait
  //     dans audit_logs declarerait sa propre identite, ce que le juge refuserait comme preuvе.
  if (!/audit_logs/.test(c + u)) {
    ok('pas de ligne auto-declaree', 'aucune insertion dans audit_logs depuis les fonctions', 'audit_logs absent des deux fichiers');
  } else {
    ko('pas de ligne auto-declaree', 'aucune insertion dans audit_logs depuis les fonctions', 'audit_logs cite dans une fonction');
  }

  // 14. Le client appelle la fonction avec sa session : sans en-tete d'autorisation, la garde
  //     refuse tout et l'attribution n'a plus d'objet.
  if (/supabase\.functions\.invoke\(\s*['"]admin-(create|update)-user['"]/.test(page) &&
      !/fetch\(\s*[`'"][^`'"]*functions\/v1\/admin-/.test(page)) {
    ok('appel client avec session', 'UsersPage passe par functions.invoke (le jeton de session est attache)', 'invoke present, fetch brut absent');
  } else {
    ko('appel client avec session', 'UsersPage passe par functions.invoke (le jeton de session est attache)', 'invoke absent ou fetch brut present');
  }

  return res;
}

// Une morsure par controle. L'ancre doit etre unique : une mutation qui ne change aucun octet est
// declaree NON EVALUEE, pas comptee comme vert.
const MUTATIONS = [
  { nom: 'acteur du trigger fige a NULL', fichier: FIC.mig003, controle: 'premise acteur = auth.uid()',
    d: '    v_user_id := auth.uid();', a: '    v_user_id := NULL;' },
  { nom: 'WITH CHECK retire de la politique administrateur', fichier: FIC.mig027, controle: 'premise with_check 027',
    d: 'WITH CHECK (public.can_manage_profile(id, role_id));', a: ';' },
  { nom: 'cle anon plus exigee (create)', fichier: FIC.create, controle: 'cle anon exigee (admin-create-user)',
    d: 'if (!supabaseUrl || !serviceRoleKey || !anonKey) {', a: 'if (!supabaseUrl || !serviceRoleKey) {' },
  { nom: 'cle anon plus exigee (update)', fichier: FIC.update, controle: 'cle anon exigee (admin-update-user)',
    d: 'if (!supabaseUrl || !serviceRoleKey || !anonKey) {', a: 'if (!supabaseUrl || !serviceRoleKey) {' },
  { nom: 'client d appelant construit avec la cle service', fichier: FIC.create, controle: 'client d appelant (admin-create-user)',
    d: 'const asCaller = createClient(supabaseUrl, anonKey, {', a: 'const asCaller = createClient(supabaseUrl, serviceRoleKey, {' },
  { nom: 'en-tete d authorisation perdu (update)', fichier: FIC.update, controle: 'client d appelant (admin-update-user)',
    d: '    global: { headers: { Authorization: authorization } },\n  });', a: '  });' },
  { nom: 'la garde recoit un jeton different de l ecrite', fichier: FIC.update, controle: 'jeton unique (admin-update-user)',
    d: 'const guard = await checkCallerCanManageUsers(admin, authorization);',
    a: "const guard = await checkCallerCanManageUsers(admin, req.headers.get('X-Jeton') ?? '');" },
  { nom: 'ecrite principale rendue a la cle service', fichier: FIC.update, controle: 'ecrites attribuees (admin-update-user)',
    d: "  const { data: updated, error: updateError } = await asCaller\n    .from('profiles')",
    a: "  const { data: updated, error: updateError } = await admin\n    .from('profiles')" },
  { nom: 'insertion de profil rendue a la cle service', fichier: FIC.create, controle: 'ecrites attribuees (admin-create-user)',
    d: "  const { data: profile, error: profileError } = await asCaller\n    .from('profiles')\n    .insert({",
    a: "  const { data: profile, error: profileError } = await admin\n    .from('profiles')\n    .insert({" },
  { nom: 'retour arriere muet (cle service)', fichier: FIC.update, controle: 'retour arriere attribue',
    d: "  const restoreProfile = async () => {\n    const { error: rollbackError } = await asCaller",
    a: "  const restoreProfile = async () => {\n    const { error: rollbackError } = await admin" },
  { nom: 'une lecture deplacee sur le client d appelant', fichier: FIC.update, controle: 'lectures inchangees',
    d: "  const { data: target, error: targetError } = await admin\n    .from('profiles')",
    a: "  const { data: target, error: targetError } = await asCaller\n    .from('profiles')" },
  { nom: 'appel Admin API deplace sur le jeton d appelant', fichier: FIC.update, controle: 'Admin API en service',
    d: "    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });",
    a: "    const { error: passwordError } = await asCaller.auth.admin.updateUserById(userId, { password });" },
  { nom: 'message de 0 ligne revenu a « introuvable »', fichier: FIC.update, controle: 'message de 0 ligne',
    d: "          'Aucune ligne modifiée : la politique de sécurité ne rend pas ce profil inscriptible sous votre niveau, ou le compte a été supprimé pendant l’opération.',",
    a: "          'Aucune ligne modifiée : le profil est introuvable.'," },
  { nom: 'commentaire « la RLS ne sert pas ici » reinsert', fichier: FIC.update, controle: 'commentaire pourri retire',
    d: '  const restoreProfile = async () => {',
    a: '  // Hierarchie (027) : la RLS ne sert pas ici, la fonction ecrit avec la cle service_role.\n  const restoreProfile = async () => {' },
  { nom: 'refus de role au-dessus retire (create)', fichier: FIC.create, controle: 'garde de niveau en code',
    d: "  if ((role.access_level ?? 0) > guard.level) {\n    return json({ error: 'Vous ne pouvez pas attribuer un rôle de niveau supérieur au vôtre.' }, 403);\n  }\n",
    a: '' },
  { nom: 'ligne d audit auto-declaree ajoutee', fichier: FIC.create, controle: 'pas de ligne auto-declaree',
    d: "  return json({ profile }, 200);",
    a: "  await admin.from('audit_logs').insert({ action: 'CREATE', module: 'PUBLIC', entity_name: 'profiles' });\n  return json({ profile }, 200);" },
  { nom: 'appel client remplace par un fetch sans session', fichier: FIC.page, controle: 'appel client avec session',
    d: "          const { data, error } = await supabase.functions.invoke('admin-update-user', {",
    a: "          const { data, error } = await fetch('/functions/v1/admin-update-user', {" },
];

function mordre() {
  let vues = 0;
  for (const mu of MUTATIONS) {
    const original = L(mu.fichier);
    const n = original.split(mu.d).length - 1;
    if (n !== 1) {
      console.log('MORSURE NON EVALUEE : ' + mu.nom + ' (ancre trouvee ' + n + ' fois, la mutation n aurait rien change)');
      continue;
    }
    const mut = original.replace(mu.d, mu.a);
    if (md5(mut) === md5(original)) {
      console.log('MORSURE NON EVALUEE : ' + mu.nom + ' (md5 identique ' + md5(original) + ')');
      continue;
    }
    const cible = path.join(RACINE, mu.fichier);
    const fsReal = fs.readFileSync;
    res.length = 0;
    let rouge = 0, nom = '';
    try {
      fs.readFileSync = (p, enc) => (path.resolve(String(p)) === cible ? mut : fsReal(p, enc));
      const r = juger();
      const juge = r.find((c2) => c2.nom === mu.controle);
      rouge = juge && juge.ok === false ? 1 : 0;
      nom = juge ? juge.nom : 'controle absent du juge';
      if (rouge === 0 && juge) console.log('   attendu : ' + juge.obtenu);
    } finally {
      fs.readFileSync = fsReal;
      res.length = 0;
    }
    if (rouge === 1) {
      vues++;
      console.log('ROUGE VU   : ' + mu.nom + ' -> ' + nom + ' (md5 ' + md5(original) + ' -> ' + md5(mut) + ')');
    } else {
      console.log('MORSURE NON VUE : ' + mu.nom + ' (' + nom + ' reste vert)');
    }
  }
  console.log('--- mutations vues : ' + vues + '/' + MUTATIONS.length);
  return vues === MUTATIONS.length;
}

if (process.argv.slice(2).includes('--mordre')) {
  process.exit(mordre() ? 0 : 1);
}
const grille = juger();
const verts = grille.filter((x) => x.ok === true).length;
const rouges = grille.filter((x) => x.ok === false);
for (const x of grille) {
  console.log((x.ok ? 'VERT  ' : 'ROUGE ') + x.nom + ' :: ' + x.propriete + ' :: ' + x.obtenu);
}
console.log('--- ' + verts + '/' + grille.length + ' controles passes, ' + rouges.length + ' rouge(s)');
process.exit(rouges.length === 0 ? 0 : 1);
