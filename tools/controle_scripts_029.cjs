'use strict';
// Juge du lot 029 (hierarchie stricte + compte racine protege).
// Il juge des PROPRIETES, pas la presence de mots : chaque controle est ecrit pour echouer sur la
// faute exactement opposee, et le juge rend le compte des controles reels.
//
//   node tools/controle_scripts_029.cjs            -> etat du depot
//   node tools/controle_scripts_029.cjs --mordre   -> passe les mutations, exige un ROUGE
//
// Lecons integrees de 027/028 : juger l'operateur dans la DEFINITION et non dans le texte de la
// politique (pg_policies.ne rend qu'un appel de fonction), juger le bloc $controle$ seul et non le
// fichier entier (la certification recopie les memes conditions), declarer NON EVALUEE quand une
// ancre de mutation n'est pas unique, et imprimer le md5 avant/apres : une mutation qui ne change
// aucun octet ne prouve rien.
//
// Couverture : une morsure par controle. Un controle sans morsure est une attente que personne
// n'a vue echouer.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const L = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(0, 12);
const sansBlancs = (s) => s.replace(/\s+/g, ' ').trim();
const sansCommentaires = (s) =>
  s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
// Code TypeScript sans ses commentaires : une regle jugee sur « le drapeau n'apparait nulle part »
// doit porter sur le code reellement ecrit, pas sur une phrase qui en parle.
const codeTs = (s) => sansCommentaires(s.replace(/\/\/[^\n]*/g, ''));
const compteOcc = (s, motif) => s.split(motif).length - 1;

const FIC = {
  mig: 'supabase/migrations/029_strict_hierarchy_and_system_account.sql',
  app: 'supabase/checks/apply_029_confirme.sql',
  create: 'supabase/functions/admin-create-user/index.ts',
  update: 'supabase/functions/admin-update-user/index.ts',
};

const res = [];
const ok = (nom, propriete, obtenu) => res.push({ nom, ok: true, propriete, obtenu });
const ko = (nom, propriete, obtenu) => res.push({ nom, ok: false, propriete, obtenu });
const saut = (nom, why, obtenu) => res.push({ nom, ok: null, propriete: why, obtenu: 'NON TESTE :: ' + obtenu });

// --- outillage -------------------------------------------------------------

// Le corps partage : de l'ALTER TABLE a la fin des declarations, avant le controle avant COMMIT.
// C'est la zone qui doit etre octet pour octet la meme dans la migration et dans le collage.
const DEBUT_CORPS = 'ALTER TABLE public.profiles';
function corps(src, borneFin) {
  const a = src.indexOf(DEBUT_CORPS);
  const b = src.indexOf(borneFin, a);
  if (a < 0 || b < 0) return null;
  return src.slice(a, b).trim();
}

function blocControle(src) {
  const i = src.indexOf('DO $controle$');
  const j = i < 0 ? -1 : src.indexOf('$controle$;', i);
  if (j < 0) throw new Error('bloc $controle$ introuvable');
  return src.slice(i, j);
}

function corpsFonction(src, nom) {
  const i = src.indexOf('FUNCTION public.' + nom);
  if (i < 0) return null;
  const m = src.slice(i).match(/AS (\$\w*\$)([\s\S]*?)\1\s*;/);
  return m ? sansBlancs(m[2]) : null;
}

// Les instructions d'ecriture reellement presentes (DDL/DML), hors commentaires.
function verbes(src) {
  const s = sansCommentaires(src);
  const motifs = ['ALTER TABLE', 'UPDATE ', 'CREATE OR REPLACE FUNCTION', 'CREATE POLICY',
    'DROP POLICY', 'GRANT ', 'REVOKE ', 'COMMENT ON'];
  const comptes = {};
  for (const m of motifs) {
    const n = s.split(m).length - 1;
    if (n > 0) comptes[m.trim()] = n;
  }
  return comptes;
}

// Un bloc CREATE POLICY "nom" ... ; isole, pour ne pas juger une politique sur la citation d'une
// autre (le texte de la migration cite « Gestion des profils » dans un commentaire).
function politique(src, nom) {
  const re = new RegExp('CREATE POLICY "' + nom + '"[\\s\\S]{0,900}?;', 'm');
  const m = src.match(re);
  return m ? m[0] : null;
}

// Les 4 noms attendus : <, >, >=, et l'operateur compare a COALESCE.
function operateursNiveau(corpsFn) {
  if (!corpsFn) return null;
  return {
    strict: compteOcc(corpsFn, '> COALESCE'),
    egal: compteOcc(corpsFn, '>= COALESCE'),
  };
}

// --- controles -------------------------------------------------------------

function juger() {
  const mig = L(FIC.mig);
  const app = L(FIC.app);
  const create = L(FIC.create);
  const update = L(FIC.update);

  const cm = corps(mig, 'COMMIT;');
  const ca = corps(app, '-- 5. CONTROLE AVANT COMMIT');

  // 1. Garde : le collage refuse d'ecrire tant que bell.confirme_029 ne vaut pas 'oui'.
  const gardeNon = app.includes("set_config('bell.confirme_029', 'non', false)");
  const leve = app.includes("current_setting('bell.confirme_029', true), '') <> 'oui'");
  (gardeNon && leve)
    ? ok('garde 029', 'ecrites conditionnees par oui, valeur de depart non', 'les deux ancres presentes')
    : ko('garde 029', 'ecrites conditionnees par oui', 'gardeNon=' + gardeNon + ' leve=' + leve);

  // 2. Parite du corps : le collage rejoue LA MEME serie d'instructions que la migration, octet
  //    pour octet. Un corps re-tape est un corps qui derive.
  if (cm === null || ca === null) {
    ko('corps 029 identique', 'corps partage entre migration et collage', 'borne introuvable');
  } else if (cm === ca) {
    ok('corps 029 identique', 'collage = migration sur tout le corps', cm.length + ' octets, md5 ' + md5(cm));
  } else {
    let i = 0;
    while (i < Math.min(cm.length, ca.length) && cm[i] === ca[i]) i++;
    ko('corps 029 identique', 'aucun octet de difference',
      'ecart a l offset ' + i + ' :: migration ' + JSON.stringify(cm.slice(i, i + 60)) +
      ' :: collage ' + JSON.stringify(ca.slice(i, i + 60)));
  }

  // 3. Parite fonction par fonction (controle redondant assume : il nomme la fonction fautive la
  //    ou le controle 2 ne rend qu'un offset).
  const nomsFn = ['can_manage_profile', 'profile_is_system_as_stored'];
  const ecarts = [];
  for (const nom of nomsFn) {
    const a = corpsFonction(mig, nom);
    const b = corpsFonction(app, nom);
    if (a === null || b === null) { ecarts.push(nom + ': corps introuvable'); continue; }
    if (a !== b) ecarts.push(nom + ': corps differents');
  }
  ecarts.length === 0
    ? ok('parite fonctions 029', nomsFn.length + ' verrous identiques migration <-> collage', nomsFn.join(', '))
    : ko('parite fonctions 029', nomsFn.length + ' verrous identiques', ecarts.join(' | '));

  // 4. Le collage porte CHAQUE instance d'ecriture de la migration.
  const vm = verbes(mig), va = verbes(app);
  const manquants = Object.keys(vm).filter((k) => (va[k] || 0) < vm[k]);
  manquants.length === 0
    ? ok('ecrites 029', 'le collage porte chaque instance d ecriture de la migration',
        Object.entries(vm).map(([k, v]) => k + ':' + (va[k] || 0) + '/' + v).join(' '))
    : ko('ecrites 029', 'aucune instance d ecriture perdue',
        manquants.map((k) => k + ' ' + (va[k] || 0) + ' sur ' + vm[k]).join(', '));

  // 5. LA propriete du lot : un pair n'est plus une cible. Dans la definition, le test de la cible
  //    est '>' et celui du role attribue '>=' : un seul de chaque. Deux '>' = la regle d'attribution
  //    aurait ete durcie aussi, et le compte racine ne pourrait plus creer un second super_admin.
  //    Zero '>' = l'operateur strict n'est pas la, c'est-a-dire 027.
  const op = operateursNiveau(corpsFonction(app, 'can_manage_profile'));
  if (!op) {
    ko('verrou de niveau 029', 'un test strict sur la cible, un test egal sur le role attribue', 'corps introuvable');
  } else if (op.strict === 1 && op.egal === 1) {
    ok('verrou de niveau 029', 'cible en > et role attribue en >=, un de chaque', 'strict=1 egal=1');
  } else {
    ko('verrou de niveau 029', 'strict=1 et egal=1', 'strict=' + op.strict + ' egal=' + op.egal);
  }

  // 6. La meme fonction refuse la ligne racine : le verrou est dans le predicat, pas dans un
  //    commentaire de politique.
  const corpsAdmin = corpsFonction(app, 'can_manage_profile') || '';
  const refusRacine =
    /NOT COALESCE\(\( SELECT p\.is_system FROM public\.profiles AS p WHERE p\.id = p_profile_id \), false\)/.test(corpsAdmin);
  refusRacine
    ? ok('refus racine dans le verrou', 'can_manage_profile lit is_system de la cible et le refuse', 'NOT COALESCE(... is_system ...)')
    : ko('refus racine dans le verrou', 'is_system lu dans le corps de can_manage_profile',
        corpsAdmin.slice(0, 120) || 'corps introuvable');

  // 7. Politique administrateur : le verrou en USING ET en WITH CHECK, et le WITH CHECK interdit
  //    de PROPOSER is_system = true (sinon inserer une ligne invisible suffirait a se proteger).
  const polAdmin = politique(app, 'Gestion des profils par les administrateurs');
  if (!polAdmin) {
    ko('policy admin 029', 'USING + WITH CHECK sur can_manage_profile, WITH CHECK sans is_system vrai', 'bloc introuvable');
  } else {
    const les2 = /USING \(public\.can_manage_profile\(id, role_id\)\)/.test(polAdmin)
      && /WITH CHECK \(public\.can_manage_profile\(id, role_id\) AND is_system IS NOT TRUE\)/.test(polAdmin);
    les2
      ? ok('policy admin 029', 'USING verrou + WITH CHECK verrou et is_system interdit', 'les deux')
      : ko('policy admin 029', 'USING = verrou, WITH CHECK = verrou AND is_system IS NOT TRUE',
          polAdmin.replace(/\s+/g, ' ').slice(0, 200));
  }

  // 8. Politique SELECT : c'est elle qui rend la liste. Une politique d'ecriture ne masque rien,
  //    et les politiques permissives s'ajoutent par OU : masquer la ligne racine exige de la lire
  //    dans la politique SELECT, pour son seul titulaire.
  const polSel = politique(app, 'Lecture des profils selon hierarchie');
  if (!polSel) {
    ko('policy select 029', 'SELECT masque is_system sauf pour id = auth.uid()', 'bloc introuvable');
  } else {
    const masque = /id = auth\.uid\(\)/.test(polSel) && /NOT is_system/.test(polSel)
      && /has_permission\('admin:users:manage'\)/.test(polSel);
    masque
      ? ok('policy select 029', 'ligne racine reservee a son titulaire, reste du champ inchange', 'auth.uid + NOT is_system + permission')
      : ko('policy select 029', 'auth.uid() OU (NOT is_system ET droits)', polSel.replace(/\s+/g, ' ').slice(0, 200));
  }

  // 9. Politique personnelle : ni le role ni le drapeau ne bougent par cette voie. Sans la garde du
  //    drapeau, un compte de niveau 3 se marque lui-meme racine et devient invisible + intouchable.
  const polPerso = politique(app, 'Mise a jour personnelle de profil');
  if (!polPerso) {
    ko('policy perso 029', 'WITH CHECK verrouille role_id ET is_system', 'bloc introuvable');
  } else {
    const wc = /WITH CHECK \( id = auth\.uid\(\) AND public\.profile_role_as_stored\(id, role_id\) AND public\.profile_is_system_as_stored\(id, is_system\) \)/
      .test(sansBlancs(polPerso));
    wc
      ? ok('policy perso 029', 'auto-promotion de role ET auto-promotion racine refusees', 'WITH CHECK complet')
      : ko('policy perso 029', 'WITH CHECK = auth.uid + les deux gardes as_stored', polPerso.replace(/\s+/g, ' ').slice(0, 200));
  }

  // 10. Ancrage du compte racine : la ligne la plus ancienne portee par super_admin, et la
  //     migration s'arrete plutot que de deviner (zero ou plusieurs candidats).
  const ancrage = [
    ['un seul super_admin exige', /IF v_nb <> 1 THEN/],
    ['deja-drapeau multiple refuse', /IF v_deja > 1 THEN/],
    ['le plus ancien choisi', /ORDER BY p\.created_at NULLS LAST, p\.id/],
    ['ecrit par uuid lu', /UPDATE public\.profiles SET is_system = true WHERE id = v_racine/],
  ];
  const lachesAncrage = ancrage.filter(([, re]) => !re.test(app)).map(([n]) => n);
  lachesAncrage.length === 0
    ? ok('ancrage racine 029', 'choix unique, arret sur ambiguite, ordre explicite', '4/4')
    : ko('ancrage racine 029', '4 ancres de choix du compte racine', lachesAncrage.join(', '));

  // 11. Retrait des anciennes politiques : par le catalogue, jamais par un nom retape (les noms en
  //     base portent des accents, et le presse-papiers est l'endroit ou ils se corrompent).
  const dropLitteral = /DROP POLICY (IF EXISTS )?"/.test(sansCommentaires(app));
  const retrait = [
    ['compte de politiques verrouille', /IF v_pol <> 3 THEN/],
    ['nom lu depuis pg_policies', /FOR r IN SELECT policyname FROM pg_policies/],
    ['quotation par format(%I)', /EXECUTE format\('DROP POLICY %I ON public.profiles', r\.policyname\)/],
  ];
  const lachesRetrait = retrait.filter(([, re]) => !re.test(app)).map(([n]) => n);
  (!dropLitteral && lachesRetrait.length === 0)
    ? ok('retrait catalogue 029', 'aucun nom de politique tape, retrait par %I sur un compte verrouille', '3/3, 0 drop litteral')
    : ko('retrait catalogue 029', '0 DROP POLICY litteral + 3 ancres catalogue',
        (dropLitteral ? 'un DROP POLICY nomme en clair ; ' : '') + lachesRetrait.join(', '));

  // 12. Le bloc $controle$ avant COMMIT porte les 8 verrous, juges DANS le bloc (la certification
  //     recopie les memes conditions et ne prouverait rien).
  const ctrl = blocControle(app);
  const verrous = [
    ['drapeau unique', /IF v_drapeau <> 1 THEN/],
    ['racine portee par super_admin', /IF v_racine <> 1 THEN/],
    ['strict + egal comptes', /IF v_strict <> 1 OR v_egal <> 1 THEN/],
    ['is_system dans la definition', /IF v_def NOT LIKE '%is_system%' THEN/],
    ['3 politiques apres 029', /IF v_pol <> 3 THEN/],
    ['SELECT masquant', /IF v_select <> 1 THEN/],
    ['ecrites verrouillees', /IF v_ecrites <> 0 THEN/],
    ['insertion verrouillee', /IF v_orphelin <> 0 THEN/],
  ];
  const lachesCtrl = verrous.filter(([, re]) => !re.test(ctrl)).map(([n]) => n);
  lachesCtrl.length === 0
    ? ok('controle pre-commit 029', verrous.length + ' verrous poses dans le bloc $controle$', verrous.length + '/' + verrous.length)
    : ko('controle pre-commit 029', verrous.length + ' verrous dans $controle$', lachesCtrl.join(', '));

  // 13. Une seule instruction apres COMMIT, et c'est la certification : l'editeur ne rend que le
  //     dernier jeu, un jeu de plus masquerait la grille attendue.
  const idx = app.lastIndexOf('COMMIT;');
  const queue = sansCommentaires(app.slice(idx + 'COMMIT;'.length)).replace(/'([^']|'')*'/g, "''");
  const instructions = queue.split(';').map(sansBlancs).filter((s) => s.length > 0);
  const uneSeule = instructions.length === 1 && /^WITH\b/i.test(instructions[0]);
  uneSeule
    ? ok('certification 029', 'une seule instruction apres COMMIT, la grille de certification', '1 instruction')
    : ko('certification 029', '1 instruction de certification apres COMMIT',
        instructions.length + ' instruction(s) : ' + instructions.map((s) => s.slice(0, 24)).join(' / '));

  // 14. Le collage et la migration sont en ASCII pur, commentaires compris : un script ou aucun
  //     octet ne peut etre mute par le presse-papiers.
  const hors = { mig: [...mig].filter((c) => c.charCodeAt(0) > 127).length, app: [...app].filter((c) => c.charCodeAt(0) > 127).length };
  hors.mig === 0 && hors.app === 0
    ? ok('octets non ASCII 029', 'migration et collage en ASCII pur', 'mig 0, app 0')
    : ko('octets non ASCII 029', '0 octet non ASCII dans les deux fichiers', 'mig ' + hors.mig + ', app ' + hors.app);

  // 15. Fonctions definer epinglees.
  const def = (src, nom) => {
    const i = src.indexOf('FUNCTION public.' + nom);
    return i < 0 ? null : src.slice(i, src.indexOf('AS $', i));
  };
  const epinglage = ['can_manage_profile', 'profile_is_system_as_stored'].filter((nom) => {
    const entete = def(app, nom);
    return entete && /SECURITY DEFINER/.test(entete) && /SET search_path = public, pg_temp/.test(entete);
  });
  epinglage.length === 2
    ? ok('epinglage definer 029', 'les 2 verrous sont DEFINER + search_path epingle', '2/2')
    : ko('epinglage definer 029', '2 sur 2', epinglage.join(', ') || 'aucun');

  // 16. Edge Functions : la meme regle que la base, cote code. Un pair refuse, la cible racine
  //     repond « introuvable » (et non « protege », qui la rendrait visible par devinette d'uuid),
  //     l'attribution d'un role de niveau egal reste permise, et aucune des deux fonctions n'ecrit
  //     le drapeau.
  const regles = [
    ['update: is_system lu sur la cible', /\.select\('[^']*is_system[^']*'\)[\s\S]{0,120}?\.eq\('id', userId\)/.test(update)],
    ['update: pair refuse', /userId !== guard\.callerId && targetLevel >= guard\.level/.test(update)],
    ['update: ligne racine repond introuvable', /target\.is_system === true && userId !== guard\.callerId[\s\S]{0,160}Profil utilisateur introuvable\.' \}, 404/.test(update)],
    ['update: attribution d un pair permise', /\(role\.access_level \?\? 0\) > guard\.level/.test(update)],
    ['update: role personnel verrouille dans le code', /userId === guard\.callerId && roleId !== target\.role_id/.test(update)],
    ['create: attribution d un pair permise', /\(role\.access_level \?\? 0\) > guard\.level/.test(create)],
    ['create: ne pose jamais le drapeau', !/is_system/.test(codeTs(create))],
    ['update: retour arriere sans drapeau', /restoreProfile[\s\S]{0,600}?\.update\(\{(?:(?!\.eq)[\s\S])*?\}\)/.test(update)
      && !/restoreProfile[\s\S]{0,600}?is_system/.test(codeTs(update))],
  ];
  const ratees = regles.filter(([, v]) => !v).map(([n]) => n);
  ratees.length === 0
    ? ok('code des fonctions 029', regles.length + ' regles de hierarchie stricte verifiees', regles.length + '/' + regles.length)
    : ko('code des fonctions 029', 'toutes les regles', ratees.join(' | '));

  // 17. Compte rendu de la morsure : l'agregat ci-dessus porte 8 regles, 4 d'entre elles n'ont pas
  //     de mutation atterrie dans ce fichier. Elles sont declarees NON TESTEES au lieu d'etre
  //     comptees comme prouvees : une regle que personne n'a vue echouer n'est pas une attente.
  const nonMordues = [
    'update: attribution d un pair permise',
    'update: role personnel verrouille dans le code',
    'create: attribution d un pair permise',
    'update: retour arriere sans drapeau',
  ];
  saut('regles de fonction non mordues', 'ces 4 regles de l agregat n ont aucune mutation atterrie ici',
    nonMordues.join(' | '));

  return res;
}

// --- morsure ---------------------------------------------------------------

// Une morsure par controle. Chaque ancre doit etre unique dans son fichier : le juge le verifie et
// declare NON EVALUEE au lieu de compter une mutation qui n'aurait rien change.
const MUTATIONS = [
  { nom: 'garde ouverte des le depart (valeur oui)', fichier: FIC.app, controle: 'garde 029',
    d: "set_config('bell.confirme_029', 'non', false)",
    a: "set_config('bell.confirme_029', 'oui', false)" },
  { nom: 'collage derive d un octet (DEFAULT true)', fichier: FIC.app, controle: 'corps 029 identique',
    d: 'ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;',
    a: 'ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT true;' },
  { nom: 'corps de can_manage_profile re-tape dans la migration', fichier: FIC.mig, controle: 'parite fonctions 029',
    d: '              WHERE p.id = p_profile_id\n          ), 0::SMALLINT)\n      AND public.get_auth_access_level() >=',
    a: '              WHERE p.id = p_profile_id AND p.is_active\n          ), 0::SMALLINT)\n      AND public.get_auth_access_level() >=' },
  { nom: 'COMMENT ON du verrou perdu au collage', fichier: FIC.app, controle: 'ecrites 029',
    d: "COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS\n    'Verrou RLS : admin:users:manage + niveau de l appelant STRICTEMENT superieur a celui de la cible, superieur ou egal a celui du role attribue, et cible non marquee is_system.';\n",
    a: '' },
  { nom: 'retour a la regle de 027 (pair accepté comme cible)', fichier: FIC.app, controle: 'verrou de niveau 029',
    d: '      AND public.get_auth_access_level() > COALESCE((\n              SELECT r.access_level\n              FROM public.profiles AS p',
    a: '      AND public.get_auth_access_level() >= COALESCE((\n              SELECT r.access_level\n              FROM public.profiles AS p' },
  { nom: 'attribution durcie par erreur (le racine ne peut plus creer un pair)', fichier: FIC.app, controle: 'verrou de niveau 029',
    d: '      AND public.get_auth_access_level() >= COALESCE((\n              SELECT r.access_level\n              FROM public.roles AS r',
    a: '      AND public.get_auth_access_level() > COALESCE((\n              SELECT r.access_level\n              FROM public.roles AS r' },
  { nom: 'refus du drapeau retire du verrou', fichier: FIC.app, controle: 'refus racine dans le verrou',
    d: '      AND NOT COALESCE((\n              SELECT p.is_system\n              FROM public.profiles AS p\n              WHERE p.id = p_profile_id\n          ), false);',
    a: '      AND true;' },
  { nom: 'WITH CHECK de la politique administrateur sans is_system', fichier: FIC.app, controle: 'policy admin 029',
    d: 'WITH CHECK (public.can_manage_profile(id, role_id) AND is_system IS NOT TRUE);',
    a: 'WITH CHECK (public.can_manage_profile(id, role_id));' },
  { nom: 'politique SELECT sans masque (002 recopiee)', fichier: FIC.app, controle: 'policy select 029',
    d: 'USING (\n    id = auth.uid()\n    OR (\n        NOT is_system\n',
    a: 'USING (\n    id = auth.uid()\n    OR (\n        is_system IS NOT NULL\n' },
  { nom: 'garde du drapeau retiree de la politique personnelle', fichier: FIC.app, controle: 'policy perso 029',
    d: '    AND public.profile_is_system_as_stored(id, is_system)\n);',
    a: ');' },
  { nom: 'ambiguite du compte racine ignoree (zero candidat accepte)', fichier: FIC.app, controle: 'ancrage racine 029',
    d: 'IF v_nb <> 1 THEN',
    a: 'IF v_nb > 1 THEN' },
  { nom: 'nom de politique retape en clair au lieu du catalogue', fichier: FIC.app, controle: 'retrait catalogue 029',
    d: "        EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);",
    a: "        EXECUTE 'DROP POLICY \"Gestion des profils par les administrateurs\" ON public.profiles';" },
  { nom: 'verrou des ecrites sans verrou relache', fichier: FIC.app, controle: 'controle pre-commit 029',
    d: 'IF v_ecrites <> 0 THEN',
    a: 'IF v_ecrites < 0 THEN' },
  { nom: 'deuxieme jeu de resultats apres la certification', fichier: FIC.app, controle: 'certification 029',
    d: '= 0 AS insertion_verrouillee;',
    a: '= 0 AS insertion_verrouillee;\nSELECT 1 AS deuxieme_jeu;' },
  { nom: 'accent en code nu dans la certification', fichier: FIC.app, controle: 'octets non ASCII 029',
    d: '= 0 AS insertion_verrouillee;',
    a: '= 0 AS insertion_vérrouillee;' },
  { nom: 'search_path plus epingle sur la garde du drapeau', fichier: FIC.app, controle: 'epinglage definer 029',
    d: 'profile_is_system_as_stored(p_profile_id UUID, p_is_system BOOLEAN)\nRETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public, pg_temp',
    a: 'profile_is_system_as_stored(p_profile_id UUID, p_is_system BOOLEAN)\nRETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER' },
  { nom: 'la politique personnelle retrouve le droit de changer le role', fichier: FIC.app, controle: 'policy perso 029',
    d: '    id = auth.uid()\n    AND public.profile_role_as_stored(id, role_id)',
    a: '    id = auth.uid()' },
  { nom: 'la fonction garde la regle de 027 (pair autorise)', fichier: FIC.update, controle: 'code des fonctions 029',
    d: '  if (userId !== guard.callerId && targetLevel >= guard.level) {',
    a: '  if (targetLevel > guard.level) {' },
  { nom: 'la fonction rend la ligne racine visible par son message', fichier: FIC.update, controle: 'code des fonctions 029',
    d: "  if (target.is_system === true && userId !== guard.callerId) {\n    return json({ error: 'Profil utilisateur introuvable.' }, 404);\n  }",
    a: '' },
  { nom: 'admin-create-user ecrit le drapeau', fichier: FIC.create, controle: 'code des fonctions 029',
    d: '      is_active: isActive,',
    a: '      is_active: isActive,\n      is_system: false,' },
  { nom: 'is_system retire de la lecture de la cible', fichier: FIC.update, controle: 'code des fonctions 029',
    d: "role_id, is_active, is_system, updated_at",
    a: "role_id, is_active, updated_at" },
];

// Le juge relit les fichiers par L() -> fs.readFileSync. La morsure remplace cette lecture par la
// copie mutee en memoire, uniquement pour le fichier vise, sans jamais toucher le disque.
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
      fs.readFileSync = (p, enc) =>
        path.resolve(String(p)) === cible ? mut : fsReal(p, enc);
      const r = juger();
      const juge = r.find((c) => c.nom === mu.controle);
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
    } else console.log('MORSURE NON VUE : ' + mu.nom + ' (' + nom + ' reste vert)');
  }
  console.log('--- mutations vues : ' + vues + '/' + MUTATIONS.length);
  return vues === MUTATIONS.length;
}

const resolu = process.argv.slice(2).includes('--mordre');
if (resolu) process.exit(mordre() ? 0 : 1);

const grille = juger();
const verts = grille.filter((c) => c.ok === true).length;
const rouges = grille.filter((c) => c.ok === false);
const sauts = grille.filter((c) => c.ok === null);
for (const c of grille) {
  console.log((c.ok === true ? 'VERT  ' : c.ok === false ? 'ROUGE ' : 'NON TESTE ') +
    c.nom + ' :: ' + c.propriete + ' :: ' + c.obtenu);
}
console.log('--- ' + verts + '/' + grille.length + ' controles passes, ' + rouges.length +
  ' rouge(s), ' + sauts.length + ' non teste(s)');
process.exit(rouges.length === 0 ? 0 : 1);
