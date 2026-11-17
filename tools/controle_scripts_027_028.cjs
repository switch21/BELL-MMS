'use strict';
// Juge des lots 027 (hierarchie des roles) et 028 (miroir email).
// Il juge des PROPRIETES, pas la presence de mots : chaque controle est ecrite pour echouer sur
// la faute exactement opposee, et le juge rend le compte des controles reels.
//
//   node tools/controle_scripts_027_028.cjs            -> etat du depot
//   node tools/controle_scripts_027_028.cjs --mordre   -> passe les mutations, exige un ROUGE
//
// Lecons integrees ici : une attente de juge se lit dans l'artefact juge (uuid_retour de 022),
// une mutation qui ne change aucun octet ne prouve rien (md5 avant/apres imprimes), et un juge qui
// filtre son entree doit dire ce qu'il retire.
//
// Couverture : une morsure par controle juge (MUTATIONS porte le nom du controle vise). Un controle
// sans morsure serait une attente que personne n'a vue echouer.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const L = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(0, 12);
const sansBlancs = (s) => s.replace(/\s+/g, ' ').trim();
const sansCommentaires = (s) =>
  s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const FIC = {
  mig027: 'supabase/migrations/027_role_access_hierarchy.sql',
  mig028: 'supabase/migrations/028_profile_email_mirror.sql',
  app027: 'supabase/checks/apply_027_confirme.sql',
  app028: 'supabase/checks/apply_028_confirme.sql',
  probe: 'supabase/checks/check_policies_profiles.sql',
  m002: 'supabase/migrations/002_security_rls.sql',
  create: 'supabase/functions/admin-create-user/index.ts',
  update: 'supabase/functions/admin-update-user/index.ts',
  page: 'src/modules/users/UsersPage.tsx',
};

const res = [];
const ok = (nom, propriete, obtenu) => res.push({ nom, ok: true, propriete, obtenu });
const ko = (nom, propriete, obtenu) => res.push({ nom, ok: false, propriete, obtenu });
const saut = (nom, why) => res.push({ nom, ok: null, propriete: why, obtenu: 'NON TESTE' });

// --- outillage -------------------------------------------------------------

// Les instructions d'ecriture d'un script de collage, commence apres la garde.
function zoneEcrites(src, lot) {
  const idx = src.indexOf('$garde$;');
  if (idx < 0) throw new Error('borne $garde$ introuvable pour ' + lot);
  return src.slice(idx + '$garde$;'.length);
}

// Les lignes qui ecrivent reellement (DDL/DML), hors commentaires et hors blocs de controle.
function verbes(src) {
  const s = sansCommentaires(src);
  const motifs = ['ALTER TABLE', 'UPDATE ', 'INSERT INTO', 'CREATE OR REPLACE FUNCTION',
    'CREATE POLICY', 'DROP POLICY', 'CREATE TRIGGER', 'DROP TRIGGER', 'GRANT ', 'REVOKE ',
    'COMMENT ON', 'DELETE FROM'];
  const comptes = {};
  for (const m of motifs) {
    const n = s.split(m).length - 1;
    if (n > 0) comptes[m.trim()] = n;
  }
  return comptes;
}

// Decoupe un script en etats (code nu, commentaire --, chaine '...', identifiant "...") et rend
// la position de chaque octet non ASCII, plus les chaines qui en portent. Un accent dans un
// commentaire ou dans un message RAISE ne casse rien : un accent dans du code nu (nom de colonne,
// alias de certification) casse le presse-papiers, et la DDL ne le rendra jamais en clair.
function scanner(src) {
  const octets = [];
  const chaines = [];
  let etat = 'code';
  let contenu = '';
  let ligne = 1;
  let ligneDebut = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\n') {
      if (etat === 'commentaire') etat = 'code';
      ligne++;
      continue;
    }
    if (etat === 'commentaire') {
      // L'octet n'est pas juge (un accent dans un -- n'a pas d'effet au collage) mais il est
      // compte : rendre « commentaires 0 » pour une classe jamais observee est une fausse mesure.
      if (c.charCodeAt(0) > 127) octets.push({ ligne, etat: 'commentaire' });
      continue;
    }
    if (etat === 'simple' || etat === 'double') {
      if (c === (etat === 'simple' ? "'" : '"')) {
        if (/[^\x00-\x7F]/.test(contenu)) chaines.push({ type: etat, texte: contenu, ligne: ligneDebut });
        etat = 'code';
        continue;
      }
      contenu += c;
      if (c.charCodeAt(0) > 127) octets.push({ ligne, etat });
      continue;
    }
    if (c === '-' && src[i + 1] === '-') { etat = 'commentaire'; i++; continue; }
    if (c === "'") { etat = 'simple'; contenu = ''; ligneDebut = ligne; continue; }
    if (c === '"') { etat = 'double'; contenu = ''; ligneDebut = ligne; continue; }
    if (c.charCodeAt(0) > 127) octets.push({ ligne, etat: 'code' });
  }
  return { octets, chaines, etatFinal: etat };
}

// Juge un script : aucun octet non ASCII en code nu, toute chaine porteuse d'accent cite un nom de
// politique admis ou un message, et les citations restent equilibrees.
function jugerNonAscii(nom, src, nomsAdmis) {
  const r = scanner(src);
  const lignes = src.split('\n');
  const enCodeNu = r.octets.filter((o) => o.etat === 'code');
  const lignesCodeNu = [...new Set(enCodeNu.map((o) => o.ligne))];
  const horsRegle = r.chaines.filter(
    (c) => !nomsAdmis.includes(c.texte) && !/RAISE|COMMENT ON/.test(lignes[c.ligne - 1] || '')
  );
  const compte = (e) => r.octets.filter((o) => o.etat === e).length;
  const rendu =
    r.octets.length + ' octets (commentaires ' + compte('commentaire') + ' non juges, chaines ' +
    compte('simple') + ', identifiants ' + compte('double') + ', code nu ' + enCodeNu.length + ')';
  if (enCodeNu.length === 0 && horsRegle.length === 0 && r.etatFinal === 'code') {
    ok('octets non ASCII ' + nom, 'code nu sans accent, accents restants = noms de 002 ou messages', rendu);
    return true;
  }
  ko('octets non ASCII ' + nom, 'aucun accent en code nu ni dans une chaine non declaree',
    rendu + (lignesCodeNu.length ? ' | code nu lignes ' + lignesCodeNu.join(',') : '') +
    (horsRegle.length ? ' | chaine non declaree ligne ' + horsRegle[0].ligne + ' = ' + horsRegle[0].texte.slice(0, 40) : '') +
    (r.etatFinal !== 'code' ? ' | citation ' + r.etatFinal + ' jamais fermee' : ''));
  return false;
}

// Le bloc de controle avant COMMIT, isolement. Juger sur tout le fichier laisserait la
// certification (qui recopie les memes conditions) tenir lieu de preuve.
function blocControle(src) {
  const i = src.indexOf('DO $controle$');
  const j = i < 0 ? -1 : src.indexOf('$controle$;', i);
  if (j < 0) throw new Error('bloc $controle$ introuvable');
  return src.slice(i, j);
}

// Les politiques CREEES sur public.profiles, sous la forme nom@commande.
function politiquesCrees(src) {
  const re = /CREATE POLICY "([^"]+)"\s*\nON public\.profiles FOR (\w+)/g;
  const out = [];
  let m2;
  while ((m2 = re.exec(src)) !== null) out.push(m2[1] + '@' + m2[2]);
  return out;
}

// Extrait le corps normalise d'une fonction declaree en AS $$.
function corpsFonction(src, nom) {
  const entete = 'FUNCTION public.' + nom;
  const i = src.indexOf(entete);
  if (i < 0) return null;
  const debut = src.indexOf('AS $$', i);
  if (debut < 0) return null;
  const fin = src.indexOf('$$;', debut);
  if (fin < 0) return null;
  return sansBlancs(src.slice(debut + 5, fin));
}

// --- contles ---------------------------------------------------------------

function juger(m) {
  const app027 = L(FIC.app027);
  const app028 = L(FIC.app028);
  const mig027 = L(FIC.mig027);
  const mig028 = L(FIC.mig028);
  const m002 = L(FIC.m002);
  const create = L(FIC.create);
  const update = L(FIC.update);
  const page = L(FIC.page);

  // 1. Garde : le collage refuse decrire tant que bell.confirme_NNN n'est pas 'oui'.
  for (const [lot, src] of [['027', app027], ['028', app028]]) {
    const gardeNon = src.includes("set_config('bell.confirme_" + lot + "', 'non', false)");
    const leve = src.includes("current_setting('bell.confirme_" + lot + "', true), '') <> 'oui'");
    (gardeNon && leve)
      ? ok('garde ' + lot, 'ecrites conditionnees par oui, valeur de depart non', 'les deux ancres presentes')
      : ko('garde ' + lot, 'ecrites conditionnees par oui', 'gardeNon=' + gardeNon + ' leve=' + leve);
  }

  // 2. Parite depot <-> collage : tout corps de fonction du fichier de collage est identique
  //    (a la blancature pres) a celui de la migration. Un corps re-tape est un corps qui derive.
  const paires = [
    ['027', mig027, app027, ['get_auth_access_level', 'can_manage_profile', 'profile_role_as_stored']],
    ['028', mig028, app028, ['sync_profile_email']],
  ];
  for (const [lot, mig, app, noms] of paires) {
    const ecart = [];
    for (const nom of noms) {
      const a = corpsFonction(mig, nom);
      const b = corpsFonction(app, nom);
      if (a === null || b === null) { ecart.push(nom + ': corps introuvable'); continue; }
      if (a !== b) ecart.push(nom + ': corps differents');
    }
    (ecart.length === 0)
      ? ok('parite corps ' + lot, noms.length + ' fonctions identiques migration <-> collage', noms.join(', '))
      : ko('parite corps ' + lot, noms.length + ' fonctions identiques', ecart.join(' | '));
  }

  // 3. Parite des ecritures : le collage porte CHAQUE instance d ecriture de la migration, pas
  //    seulement la famille. Une ligne perdue (un COMMENT ON, un DROP TRIGGER) est une ecriture
  //    que personne ne rejouera.
  for (const [lot, mig, app] of [['027', mig027, app027], ['028', mig028, app028]]) {
    const vm = verbes(mig), va = verbes(app);
    const manquants = Object.keys(vm).filter((k) => (va[k] || 0) < vm[k]);
    manquants.length === 0
      ? ok('ecrites ' + lot, 'le collage porte chaque instance d ecriture de la migration',
          Object.entries(vm).map(([k, v]) => k + ':' + (va[k] || 0) + '/' + v).join(' '))
      : ko('ecrites ' + lot, 'aucune instance d ecriture perdue',
          manquants.map((k) => k + ' ' + (va[k] || 0) + ' sur ' + vm[k]).join(', '));
  }

  // 4. La propriete de 027 : la politique administrateur verrouille la LECTURE et l'ECRITURE.
  //    USING seul laisserait un DG attribuer un role plus haut que le sien.
  const polAdmin = /CREATE POLICY "Gestion des profils par les administrateurs"[\s\S]{0,400}?;/;
  const trouve = app027.match(polAdmin);
  if (!trouve) {
    ko('policy admin 027', 'USING et WITH CHECK sur can_manage_profile', 'bloc introuvable');
  } else {
    const bloc = trouve[0];
    const les2 = /USING \(public\.can_manage_profile\(id, role_id\)\)/.test(bloc)
      && /WITH CHECK \(public\.can_manage_profile\(id, role_id\)\)/.test(bloc);
    les2 ? ok('policy admin 027', 'USING + WITH CHECK = meme verrou de niveau', 'les deux')
         : ko('policy admin 027', 'USING + WITH CHECK', bloc.replace(/\s+/g, ' ').slice(0, 160));
  }

  // 5. La politique personnelle ne peut plus changer un role (auto-promotion).
  const polPerso = /CREATE POLICY "Mise [^"]*personnelle de profil"[\s\S]{0,400}?;/;
  const perso = app027.match(polPerso);
  if (!perso) {
    ko('policy perso 027', 'WITH CHECK verrouille role_id', 'bloc introuvable');
  } else {
    const wc = /WITH CHECK \(id = auth\.uid\(\) AND public\.profile_role_as_stored\(id, role_id\)\)/.test(perso[0]);
    wc ? ok('policy perso 027', 'role personnel verrouille par profil_role_as_stored', 'WITH CHECK complet')
       : ko('policy perso 027', 'WITH CHECK complet', perso[0].replace(/\s+/g, ' ').slice(0, 160));
  }

  // 6. Les noms accents sont ceux de 002, a l octet pres, et juges sur la DECLARATION creee (pas
  //    sur une simple citation : le DROP ASCII et l'ancre citent aussi les noms).
  const Creees002 = politiquesCrees(m002);
  const Creees027 = politiquesCrees(app027);
  const hors002 = Creees027.filter((n) => !Creees002.includes(n));
  Creees027.length === 2 && hors002.length === 0
    ? ok('noms accents 027', 'les 2 politiques creees portent le nom et la commande de 002', Creees027.join(' | '))
    : ko('noms accents 027', 'noms + commandes identiques a 002 (' + Creees002.join(', ') + ')',
        Creees027.length + ' creees, hors 002 : ' + (hors002.join(' | ') || 'aucun'));

  // 7. Canne d'arret du risque de duplication : le controle avant COMMIT exige 3 politiques, le
  //    verrou admin dans qual ET with_check, le verrou personnel, les 4 niveaux, les 3 fonctions.
  const ctrl027 = blocControle(app027);
  const verrous027 = [
    ['3 politiques', /IF v_total <> 3 THEN/],
    ['verrou admin qual+with_check', /pp\.qual LIKE '%can_manage_profile%'[\s\S]{0,80}?pp\.with_check LIKE '%can_manage_profile%'[\s\S]{0,120}?IF v_admin <> 1 THEN/],
    ['verrou role personnel', /IF v_personnel <> 1 THEN/],
    ['4 niveaux', /IF v_niveaux <> 4 THEN/],
    ['3 fonctions definer', /IF v_fonctions <> 3 THEN/],
  ];
  const laches027 = verrous027.filter(([, re]) => !re.test(ctrl027)).map(([n]) => n);
  laches027.length === 0
    ? ok('controle pre-commit 027', 'les 5 verrous sont poses dans le bloc $controle$', '5/5')
    : ko('controle pre-commit 027', '5 verrous dans $controle$', laches027.join(', '));

  // 8. 028 : le declencheur est branche sur auth.users, et le controle avant COMMIT exige un objet
  //    ACTIF et non interne. Juger le fichier entier laisserait la certification (qui recopie la
  //    condition) tenir lieu de verrou : le controle est dans $controle$.
  const ctrl028 = blocControle(app028);
  const trig028 = /CREATE TRIGGER on_auth_user_email\s+AFTER INSERT OR UPDATE OF email ON auth\.users/.test(app028);
  const actif028 = /t\.tgname = 'on_auth_user_email'/.test(ctrl028)
    && /NOT t\.tgisinternal/.test(ctrl028)
    && /t\.tgenabled = 'O'/.test(ctrl028);
  trig028 && actif028
    ? ok('trigger 028', 'branche sur auth.users et juge ACTIF dans $controle$', 'les deux')
    : ko('trigger 028', 'branche + actif dans $controle$', 'create=' + trig028 + ' actif=' + actif028);

  // 9. 028 : les 5 verrous du controle avant COMMIT, dont le rattrapage juge par un compte.
  const verrous028 = [
    ['colonne email', /IF v_colonne <> 1 THEN/],
    ['trigger actif', /IF v_trigger <> 1 THEN/],
    ['fonction definer epinglee', /IF v_fonction <> 1 THEN/],
    ['comptes sans email', /IF v_sans_email <> 0 THEN/],
    ['comptes divergents', /IF v_divergents <> 0 THEN/],
  ];
  const laches028 = verrous028.filter(([, re]) => !re.test(ctrl028)).map(([n]) => n);
  laches028.length === 0
    ? ok('controle pre-commit 028', 'les 5 verrous sont poses dans le bloc $controle$', '5/5')
    : ko('controle pre-commit 028', '5 verrous dans $controle$', laches028.join(', '));

  // 10. Fonctions definer epinglees declarees dans les scripts.
  const pin = (src) => sansCommentaires(src).match(/CREATE OR REPLACE FUNCTION public\.[a-z_]+\([^)]*\)[\s\S]*?AS \$\$/g) || [];
  let epinglees = 0, total = 0;
  for (const src of [app027, app028]) {
    for (const b of pin(src)) {
      total++;
      if (/SECURITY DEFINER/.test(b) && /SET search_path = public, pg_temp/.test(b)) epinglees++;
    }
  }
  epinglees === 4 && total === 4
    ? ok('epinglage definer', 'les 4 nouvelles fonctions sont DEFINER + search_path epingle', '4/4')
    : ko('epinglage definer', '4 sur 4', epinglees + '/' + total);

  // 11. Edge Functions : la hierarchie est aussi dans le code, pas seulement dans la base.
  const regles = [
    ['update: niveau de l appelant lu', /roles\(code, access_level\)/.test(update)],
    ['update: niveau de la cible lu', /roles\(access_level\)/.test(update)],
    ['update: pair refuse depuis 029 (niveau egal interdit), super_admin exemptee (030)', /userId !== guard\.callerId && !guard\.isSuperAdmin && targetLevel >= guard\.level/.test(update)],
    ['update: role sur-eleve refuse', /role\.access_level \?\? 0\) > guard\.level/.test(update)],
    ['update: auto-changement de role refuse', /roleId !== target\.role_id[\s\S]{0,80}votre propre r/.test(update)],
    ['create: niveau de l appelant lu', /roles\(code, access_level\)/.test(create)],
    ['create: role sur-eleve refuse', /\(role\.access_level \?\? 0\) > guard\.level/.test(create)],
    ['create: email dans le profil insere', /\.insert\(\{[\s\S]{0,220}?\n      email,/.test(create)],
    ['update: email valide', /EMAIL_PATTERN\.test\(email\)/.test(update)],
    ['update: email ecrit dans Auth', /updateUserById\(userId, \{\s*email,/.test(update)],
    ['update: unicite lue en liste (miroir sans UNIQUE)', /\.eq\('email', email\)[\s\S]{0,60}?\.limit\(1\)/.test(update)
      && !/\.neq\('id', userId\)\s*\.maybeSingle/.test(update)],
    ['update: email confirme sans delai', /email_confirm: true/.test(update)],
    ['update: retour arriere de l email', /email: previousEmail/.test(update)],
  ];
  const ratees = regles.filter(([, v]) => !v).map(([n]) => n);
  ratees.length === 0
    ? ok('code des fonctions', regles.length + ' regles de hierarchie et d email verifiees', regles.length + '/' + regles.length)
    : ko('code des fonctions', 'toutes les regles', ratees.join(' | '));

  // 12. Client : le champ email n'est plus verrouille et part dans la charge utile.
  const champVerrouille = /disabled=\{isSupabaseConfigured && Boolean\(selectedUser\)\}/.test(page);
  const corpsAvecEmail = /user_id: selectedUser\.id,\s*first_name: firstName,\s*last_name: lastName,\s*email,/.test(page);
  !champVerrouille && corpsAvecEmail
    ? ok('client UsersPage', 'champ editable en connecte et email transmis', 'les deux')
    : ko('client UsersPage', 'champ libre + email transmis', 'verrouille=' + champVerrouille + ' transmis=' + corpsAvecEmail);

  // 13. Octets non ASCII : juges a l'etat lexical, pas a la quantite. Seuls les noms de politiques
  //     de 002 et les messages (RAISE / COMMENT ON) peuvent porter un accent. Un accent en code nu
  //     (nom de colonne, alias de certification) est invisible en base et mortel au collage.
  const nomsAdmis = Creees002.map((s) => s.split('@')[0]);
  jugerNonAscii('027', app027, nomsAdmis);
  jugerNonAscii('028', app028, []);
  jugerNonAscii('sonde', L(FIC.probe), []);

  // 14. La certification est le seul jeu rendu apres COMMIT. Le juge compte des INSTRUCTIONS, pas
  //     des mots SELECT : une certification correcte contient 7 sous-selectifs dans une seule
  //     instruction, et l'editeur ne rend que la derniere. Les litteraux ' ; ' sont aveugles.
  for (const [lot, src] of [['027', app027], ['028', app028]]) {
    const idx = src.lastIndexOf('COMMIT;');
    const queue = sansCommentaires(src.slice(idx + 'COMMIT;'.length)).replace(/'([^']|'')*'/g, "''");
    const instructions = queue.split(';').map(sansBlancs).filter((s) => s.length > 0);
    const uneSeule = instructions.length === 1 && /^SELECT\b/i.test(instructions[0]);
    uneSeule
      ? ok('certification ' + lot, 'une seule instruction apres COMMIT, et c est un SELECT', '1 instruction')
      : ko('certification ' + lot, '1 instruction SELECT apres COMMIT',
          instructions.length + ' instruction(s) : ' + instructions.map((s) => s.slice(0, 24)).join(' / '));
  }

  return res;
}

// --- morsure ---------------------------------------------------------------

// Une morsure par controle juge. Chaque ancre doit etre unique dans son fichier : le juge le
// verifie et declare NON EVALUEE au lieu de compter une mutation qui n'aurait rien change.
const MUTATIONS = [
  { nom: 'garde 027 ouverte (valeur de depart oui)', fichier: FIC.app027, controle: 'garde 027',
    d: "set_config('bell.confirme_027', 'non', false)",
    a: "set_config('bell.confirme_027', 'oui', false)" },
  { nom: 'garde 028 ouverte (valeur de depart oui)', fichier: FIC.app028, controle: 'garde 028',
    d: "set_config('bell.confirme_028', 'non', false)",
    a: "set_config('bell.confirme_028', 'oui', false)" },
  { nom: 'corps de fonction diverge dans la migration 027', fichier: FIC.mig027, controle: 'parite corps 027',
    d: 'WHERE p.id = auth.uid() AND p.is_active = true',
    a: 'WHERE p.id = auth.uid()' },
  { nom: 'corps de fonction diverge dans la migration 028', fichier: FIC.mig028, controle: 'parite corps 028',
    d: '    RETURN NEW;',
    a: '    RETURN OLD;' },
  { nom: 'COMMENT ON perdu au collage (027)', fichier: FIC.app027, controle: 'ecrites 027',
    d: "COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS\n    'Verrou RLS : admin:users:manage + niveau de l appelant >= niveau de la cible et du role attribue.';\n",
    a: '' },
  { nom: 'DROP TRIGGER perdu au collage (028)', fichier: FIC.app028, controle: 'ecrites 028',
    d: 'DROP TRIGGER IF EXISTS on_auth_user_email ON auth.users;\n',
    a: '' },
  { nom: 'WITH CHECK retire de la politique administrateur', fichier: FIC.app027, controle: 'policy admin 027',
    d: 'WITH CHECK (public.can_manage_profile(id, role_id));',
    a: ';' },
  { nom: 'WITH CHECK personnel sans verrou de role', fichier: FIC.app027, controle: 'policy perso 027',
    d: 'WITH CHECK (id = auth.uid() AND public.profile_role_as_stored(id, role_id))',
    a: 'WITH CHECK (id = auth.uid())' },
  { nom: 'nom de politique cree sans accent', fichier: FIC.app027, controle: 'noms accents 027',
    d: 'CREATE POLICY "Mise à jour personnelle de profil"\nON public.profiles FOR UPDATE',
    a: 'CREATE POLICY "Mise a jour personnelle de profil"\nON public.profiles FOR UPDATE' },
  { nom: 'verrou du nombre de politiques relache', fichier: FIC.app027, controle: 'controle pre-commit 027',
    d: "IF v_total <> 3 THEN\n        RAISE EXCEPTION 'Politiques profiles : 3 attendues",
    a: "IF v_total <> 9 THEN\n        RAISE EXCEPTION 'Politiques profiles : 3 attendues" },
  { nom: 'trigger accepte comme suffisant un objet inactif', fichier: FIC.app028, controle: 'trigger 028',
    d: "      AND NOT t.tgisinternal AND t.tgenabled = 'O';",
    a: '      AND NOT t.tgisinternal;' },
  { nom: 'rattrapage du miroir non compte', fichier: FIC.app028, controle: 'controle pre-commit 028',
    d: 'IF v_sans_email <> 0 THEN',
    a: 'IF v_sans_email < 0 THEN' },
  { nom: 'search_path plus epingle dans sync_profile_email', fichier: FIC.app028, controle: 'epinglage definer',
    d: 'SECURITY DEFINER\nSET search_path = public, pg_temp\n',
    a: 'SECURITY DEFINER\n' },
  { nom: 'garde de niveau retiree de admin-create-user', fichier: FIC.create, controle: 'code des fonctions',
    d: '  if ((role.access_level ?? 0) > guard.level) {\n    return json({ error: \'Vous ne pouvez pas attribuer un rôle de niveau supérieur au vôtre.\' }, 403);\n  }\n',
    a: '' },
  { nom: 'lecture de l unicite rendue fragile (maybeSingle sur le miroir)', fichier: FIC.update, controle: 'code des fonctions',
    d: "      .neq('id', userId)\n      .limit(1);",
    a: "      .neq('id', userId)\n      .maybeSingle<{ id: string }>();" },
  { nom: 'email retire de la charge utile du client', fichier: FIC.page, controle: 'client UsersPage',
    d: '              last_name: lastName,\n              email,\n              phone,',
    a: '              last_name: lastName,\n              phone,' },
  { nom: 'accent en code nu dans la certification 027', fichier: FIC.app027, controle: 'octets non ASCII 027',
    d: '= 4 AS niveaux_seedes,',
    a: '= 4 AS niveaux_seedés,' },
  { nom: 'accent en code nu dans la certification 028', fichier: FIC.app028, controle: 'octets non ASCII 028',
    d: '= 0 AS miroir_identique;',
    a: '= 0 AS miroir_identïque;' },
  { nom: 'deuxieme jeu de resultats apres la certification 027', fichier: FIC.app027, controle: 'certification 027',
    d: "AS anon_refuse,\n    (SELECT count(*) FROM public.role_permissions) AS total_matrice;",
    a: "AS anon_refuse,\n    (SELECT count(*) FROM public.role_permissions) AS total_matrice;\nSELECT 1 AS deuxieme_jeu;" },
  { nom: 'deuxieme jeu de resultats apres la certification 028', fichier: FIC.app028, controle: 'certification 028',
    d: 'AS miroir_identique;',
    a: 'AS miroir_identique;\nSELECT 1 AS deuxieme_jeu;' },
  { nom: 'accent en code nu dans la sonde', fichier: FIC.probe, controle: 'octets non ASCII sonde',
    d: ' AS filtre_lu,',
    a: ' AS filtre_lü,',
  },
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
    const cible_absolue = path.join(RACINE, mu.fichier);
    const fsReal = fs.readFileSync;
    res.length = 0;
    let rouge = 0, nom = '';
    try {
      fs.readFileSync = (p, enc) =>
        path.resolve(String(p)) === cible_absolue ? mut : fsReal(p, enc);
      const r = juger();
      const juge = r.find((c) => c.nom === mu.controle);
      rouge = juge && juge.ok === false ? 1 : 0;
      nom = juge ? juge.nom : 'controle absent du juge';
      if (rouge === 0 && juge) console.log('   attendu : ' + juge.obtenu);
    } finally {
      fs.readFileSync = fsReal;
      res.length = 0;
    }
    if (rouge === 1) { vues++; console.log('ROUGE VU   : ' + mu.nom + ' -> ' + nom + ' (md5 ' + md5(original) + ' -> ' + md5(mut) + ')'); }
    else console.log('MORSURE NON VUE : ' + mu.nom + ' (' + nom + ' reste vert)');
  }
  console.log('--- mutations vues : ' + vues + '/' + MUTATIONS.length);
  return vues === MUTATIONS.length;
}

const resolu = process.argv.slice(2).includes('--mordre');
if (resolu) {
  process.exit(mordre() ? 0 : 1);
}
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
