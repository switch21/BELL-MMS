'use strict';
// Juge du lot 030 (le super_admin modifie tous les comptes visibles) et des deux textes de
// connexion exiges le meme jour.
// Il juge des PROPRIETES, pas la presence de mots : chaque controle est ecrit pour echouer sur la
// faute exactement opposee, et le juge rend le compte des controles reels.
//
//   node tools/controle_scripts_030.cjs            -> etat du depot
//   node tools/controle_scripts_030.cjs --mordre   -> passe les mutations, exige un ROUGE
//
// Lecons integrees des lots precedents, appliquees ici :
//   - l'attendu de juge se lit dans l'artefacte juge : les colonnes promises par le commentaire de
//     certification sont recensees dans la declaration SELECT elle-meme (022, 028) ;
//   - une clause recopiee deux fois est un faux vert : les clauses de niveau sont comptees par
//     occurrences, pas testees par LIKE ;
//   - un retour de garde qui oublie le drapeau super_admin rendrait le code plus strict que la
//     base : chaque retour de checkCallerCanManageUsers est vérifié individuellement ;
//   - une mutation dont l'ancre n'est pas unique est declaree NON EVALUEE, et le md5 avant/apres
//     est imprime : une mutation qui ne change aucun octet ne prouve rien.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const L = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(0, 12);
const sansBlancs = (s) => s.replace(/\s+/g, ' ').trim();
const sansCommentaires = (s) =>
  s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const codeTs = (s) => sansCommentaires(s.replace(/\/\/[^\n]*/g, ''));
const compteOcc = (s, motif) => s.split(motif).length - 1;

const FIC = {
  mig: 'supabase/migrations/030_super_admin_edite_tous_les_comptes.sql',
  app: 'supabase/checks/apply_030_confirme.sql',
  mig029: 'supabase/migrations/029_strict_hierarchy_and_system_account.sql',
  update: 'supabase/functions/admin-update-user/index.ts',
  create: 'supabase/functions/admin-create-user/index.ts',
  login: 'src/modules/auth/LoginPage.tsx',
};

const COLONNES_CERTIF = [
  'colonne_is_system', 'signature_inchangee', 'security_definer', 'search_path_epingle',
  'exemption_super_admin_une_fois', 'cible_stricte_pour_les_autres', 'attribution_egal_conservee',
  'refus_racine_conserve', 'politiques_profiles', 'select_masque_racine', 'insertion_verrouillee',
  'drapeau_racine_unique', 'commentaire_verrou_a_jour',
];

const res = [];
const ok = (nom, propriete, obtenu) => res.push({ nom, ok: true, propriete, obtenu });
const ko = (nom, propriete, obtenu) => res.push({ nom, ok: false, propriete, obtenu });
const saut = (nom, why, obtenu) => res.push({ nom, ok: null, propriete: why, obtenu: 'NON TESTE :: ' + obtenu });

// --- outillage -------------------------------------------------------------

// Le corps partage : de l'ancre 029 (DO $$) a la fin du COMMENT ON, avant le controle avant COMMIT.
// C'est la zone qui doit etre octet pour octet la meme dans la migration et dans le collage.
const DEBUT_CORPS = '-- ANCHRES';
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

function blocAncre(src) {
  const i = src.indexOf(DEBUT_CORPS);
  const j = i < 0 ? -1 : src.indexOf('$$;', i);
  if (j < 0) return null;
  return src.slice(i, j);
}

// Le corps de la fonction de verrou, normalise, tel que declare dans un fichier.
function corpsFonction(src, nom) {
  const i = src.indexOf('FUNCTION public.' + nom);
  if (i < 0) return null;
  const m = src.slice(i).match(/AS (\$\w*\$)([\s\S]*?)\1\s*;/);
  return m ? sansBlancs(m[2]) : null;
}

// La declaration complete (en-tete + clauses) de la fonction de verrou.
function declaration(src, nom) {
  const i = src.indexOf('CREATE OR REPLACE FUNCTION public.' + nom);
  if (i < 0) return null;
  const j = src.indexOf('$fn$;', i);
  return j < 0 ? null : src.slice(i, j + 5);
}

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

// Decoupe en etats (code nu, commentaire --, chaine '...', identifiant "...") et rend la position
// de chaque octet non ASCII. Un accent dans un commentaire ne casse rien ; dans du code nu ou dans
// une chaine de certification, il casse le presse-papiers et la DDL ne le rendra jamais en clair.
function scanner(src) {
  const octets = [];
  let etat = 'code';
  let ligne = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\n') { if (etat === 'commentaire') etat = 'code'; ligne++; continue; }
    if (etat === 'commentaire') { if (c.charCodeAt(0) > 127) octets.push({ ligne, etat }); continue; }
    if (etat === 'simple' || etat === 'double') {
      if (c === (etat === 'simple' ? "'" : '"')) { etat = 'code'; continue; }
      if (c.charCodeAt(0) > 127) octets.push({ ligne, etat });
      continue;
    }
    if (c === '-' && src[i + 1] === '-') { etat = 'commentaire'; i++; continue; }
    if (c === "'") { etat = 'simple'; continue; }
    if (c === '"') { etat = 'double'; continue; }
    if (c.charCodeAt(0) > 127) octets.push({ ligne, etat: 'code' });
  }
  return { octets, etatFinal: etat };
}

// Les alias rendus par la certification (derniere instruction du fichier), dans l'ordre.
function colonnesCertif(src) {
  const idx = src.lastIndexOf('COMMIT;');
  const queue = sansCommentaires(src.slice(idx + 'COMMIT;'.length));
  return [...queue.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)\b/g)].map((m) => m[1]);
}

// --- controles -------------------------------------------------------------

function juger() {
  const mig = L(FIC.mig);
  const app = L(FIC.app);
  const mig029 = L(FIC.mig029);
  const update = L(FIC.update);
  const create = L(FIC.create);
  const login = L(FIC.login);

  const cm = corps(mig, 'COMMIT;');
  const ca = corps(app, '-- 5. CONTROLE AVANT COMMIT');
  const fnM = corpsFonction(mig, 'can_manage_profile');
  const fnA = corpsFonction(app, 'can_manage_profile');

  // 1. Garde : le collage refuse d'ecrire tant que bell.confirme_030 ne vaut pas 'oui'.
  const gardeNon = app.includes("set_config('bell.confirme_030', 'non', false)");
  const leve = app.includes("current_setting('bell.confirme_030', true), '') <> 'oui'");
  (gardeNon && leve)
    ? ok('garde 030', 'ecrites conditionnees par oui, valeur de depart non', 'les deux ancres presentes')
    : ko('garde 030', 'ecrites conditionnees par oui', 'gardeNon=' + gardeNon + ' leve=' + leve);

  // 2. Parite du corps partage : le collage rejoue la meme serie d'instructions que la migration.
  if (cm === null || ca === null) {
    ko('corps 030 identique', 'zone partagee retrouvee dans les deux fichiers',
      'migration=' + (cm === null ? 'absent' : 'ok') + ' collage=' + (ca === null ? 'absent' : 'ok'));
  } else {
    const m1 = md5(sansBlancs(cm)), m2 = md5(sansBlancs(ca));
    m1 === m2
      ? ok('corps 030 identique', 'migration et collage rendent la meme zone d ecriture',
          cm.length + ' octets, md5 ' + m1)
      : ko('corps 030 identique', 'zone d ecriture identique', 'md5 ' + m1 + ' vs ' + m2);
  }

  // 3. Le collage porte chaque instance d'ecriture de la migration : une ligne perdue est une
  //    ecriture que personne ne rejouera (ici le COMMENT ON du verrou).
  const vm = verbes(mig), va = verbes(app);
  const manquants = Object.keys(vm).filter((k) => (va[k] || 0) < vm[k]);
  manquants.length === 0
    ? ok('ecrites 030', 'le collage porte chaque verbe d ecriture de la migration',
        Object.entries(vm).map(([k, v]) => k + ':' + (va[k] || 0) + '/' + v).join(' '))
    : ko('ecrites 030', 'aucune instance d ecriture perdue',
        manquants.map((k) => k + ' ' + (va[k] || 0) + ' sur ' + vm[k]).join(', '));

  // 4. La propriete de 030 : l'exemption est DANS le verrou, une seule fois, et elle est portee
  //    par un OR sur la comparaison de cible (pas sur le droit, ni sur le drapeau).
  const exM = fnM === null ? -1 : compteOcc(fnM, "get_auth_role() = 'super_admin'");
  const exA = fnA === null ? -1 : compteOcc(fnA, "get_auth_role() = 'super_admin'");
  const formeM = fnM !== null && /OR public\.get_auth_access_level\(\) > COALESCE/.test(fnM);
  const formeA = fnA !== null && /OR public\.get_auth_access_level\(\) > COALESCE/.test(fnA);
  exM === 1 && exA === 1 && formeM && formeA
    ? ok('exemption super_admin', 'la clause est declaree une fois, en OR sur la comparaison de cible',
        'mig ' + exM + ', app ' + exA + ', forme OR sur niveau: ' + (formeM && formeA))
    : ko('exemption super_admin', 'une clause d exemption, en OR sur le niveau de la cible',
        'mig ' + exM + ', app ' + exA + ', forme OR ' + formeM + '/' + formeA);

  // 5. Les deux comparaisons de niveau survivent a la reecriture, une occurrence chacune : le
  //    strict sur la cible pour les non super_admin, l'egal sur le role attribue pour tout le monde.
  const opM = fnM === null ? null : { strict: compteOcc(fnM, '> COALESCE'), egal: compteOcc(fnM, '>= COALESCE') };
  const opA = fnA === null ? null : { strict: compteOcc(fnA, '> COALESCE'), egal: compteOcc(fnA, '>= COALESCE') };
  const okOp = (o) => o && o.strict === 1 && o.egal === 1;
  okOp(opM) && okOp(opA)
    ? ok('compte des operateurs de niveau', '1 comparaison stricte de cible et 1 comparaison d attribution',
        'mig ' + opM.strict + '/' + opM.egal + ', app ' + opA.strict + '/' + opA.egal)
    : ko('compte des operateurs de niveau', 'strict:1, egal:1 dans chaque fichier',
        'mig ' + JSON.stringify(opM) + ', app ' + JSON.stringify(opA));

  // 6. Le refus du compte racine n'a pas disparu avec l'exemption : la clause is_system est toujours
  //    la derniere conjonction du verrou, dans les deux fichiers.
  const refusM = fnM !== null && /AND NOT COALESCE\(\( SELECT p\.is_system FROM public\.profiles AS p WHERE p\.id = p_profile_id \), false\);?$/.test(fnM);
  const refusA = fnA !== null && /AND NOT COALESCE\(\( SELECT p\.is_system FROM public\.profiles AS p WHERE p\.id = p_profile_id \), false\);?$/.test(fnA);
  refusM && refusA
    ? ok('racine toujours refusee', 'la clause NOT COALESCE(is_system) clot le verrou', 'les deux fichiers')
    : ko('racine toujours refusee', 'clause is_system presente et finale', 'mig=' + refusM + ' app=' + refusA);

  // 7. La recreation garde SECURITY DEFINER et le search_path epingle (020/021 : un DEFINER sans
  //    epinglage est une surface de resolution d'identifiants).
  const declM = declaration(mig, 'can_manage_profile');
  const declA = declaration(app, 'can_manage_profile');
  const epingle = (d) => d !== null && /SECURITY DEFINER/.test(d) && /SET search_path = public, pg_temp/.test(d)
    && /LANGUAGE sql/.test(d) && /STABLE/.test(d);
  epingle(declM) && epingle(declA)
    ? ok('epinglage 030', 'la fonction recreee reste sql, STABLE, DEFINER, search_path public+pg_temp', 'les deux fichiers')
    : ko('epinglage 030', 'sql + STABLE + DEFINER + search_path epingle', 'mig=' + epingle(declM) + ' app=' + epingle(declA));

  // 8. Les trois ancres de depart, jugees dans le bloc d ancre (pas dans le controle final, qui
  //    recopie les memes conditions).
  const anM = blocAncre(mig), anA = blocAncre(app);
  const ancres = [
    ['colonne 029 exigee', /IF v_att <> 1 THEN/],
    ['3 politiques attendues', /IF v_pol <> 3 THEN/],
    ['signature 2 arguments', /IF v_sig <> 1 THEN/],
  ];
  const lacheAncre = ancres.filter(([, re]) => !(anM && anA && re.test(anM) && re.test(anA))).map(([n]) => n);
  lacheAncre.length === 0
    ? ok('ancres 030', 'les 3 conditions de depart sont posees dans les deux fichiers', '3/3')
    : ko('ancres 030', '3 conditions de depart dans le bloc d ancre', lacheAncre.join(', '));

  // 9. Les dix verrous du controle avant COMMIT, juges dans $controle$ seul.
  const ctrl = blocControle(app);
  const verrous = [
    ['exemption comptee', /IF n <> 1 THEN/],
    ['strict conserve', /replace\(v_def, '> COALESCE', ''\)/],
    ['attribution conservee', /replace\(v_def, '>= COALESCE', ''\)/],
    ['is_system dans la definition', /v_def NOT LIKE '%is_system%'/],
    ['DEFINER et search_path', /v_def NOT LIKE '%SECURITY DEFINER%'[\s\S]{0,90}SET search_path = public, pg_temp/],
    ['3 politiques apres coup', /IF v_pol <> 3 THEN/],
    ['policy admin USING+WITH CHECK', /pp\.with_check LIKE '%is_system IS NOT TRUE%'/],
    ['masque SELECT', /pp\.qual LIKE '%NOT is_system%'/],
    ['drapeau unique', /IF v_dr <> 1 THEN/],
    ['racine portee par super_admin', /WHERE p\.is_system = true AND r\.code = 'super_admin'/],
  ];
  const laches = verrous.filter(([, re]) => !re.test(ctrl)).map(([n]) => n);
  laches.length === 0
    ? ok('controle pre-commit 030', 'les 10 verrous sont poses dans le bloc $controle$', '10/10')
    : ko('controle pre-commit 030', '10 verrous dans $controle$', laches.join(', '));

  // 10. La certification est le seul jeu rendu apres COMMIT : une instruction, et c'est une lecture
  //     (SELECT, ou WITH...SELECT : une seule instruction rend un seul jeu).
  const idxC = app.lastIndexOf('COMMIT;');
  const queue = sansCommentaires(app.slice(idxC + 'COMMIT;'.length)).replace(/'([^']|'')*'/g, "''");
  const instructions = queue.split(';').map(sansBlancs).filter((s) => s.length > 0);
  instructions.length === 1 && /^(SELECT|WITH)\b/i.test(instructions[0])
    ? ok('certification 030', 'une seule instruction apres COMMIT, et c est une lecture', '1 instruction')
    : ko('certification 030', '1 instruction SELECT ou WITH apres COMMIT',
        instructions.length + ' instruction(s) : ' + instructions.map((s) => s.slice(0, 24)).join(' / '));

  // 11. Ce que la certification promet = ce qu'elle rend. Le commentaire annonce treize juges : le
  //     compte est pris dans la declaration SELECT elle-meme, pas dans le commentaire.
  const cols = colonnesCertif(app);
  const horsListe = cols.filter((c) => !COLONNES_CERTIF.includes(c));
  const manquantes = COLONNES_CERTIF.filter((c) => !cols.includes(c));
  const MOTS = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14 };
  const annoncees = [...app.toLowerCase().matchAll(/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze) (juges|colonnes)\b/g)];
  const fausses = annoncees.filter((m) => MOTS[m[1]] !== cols.length).map((m) => m[0]);
  cols.length === 13 && horsListe.length === 0 && manquantes.length === 0
    && annoncees.length >= 2 && fausses.length === 0
    ? ok('colonnes promises 030', '13 alias declares, 13 attendus, et chaque annonce en toutes lettres vaut 13',
        annoncees.map((m) => m[1] + '=' + MOTS[m[1]]).join(', '))
    : ko('colonnes promises 030', 'autant d alias declares que promis (13), et les annonces valent ce compte',
        cols.length + ' alias | hors liste : ' + (horsListe.join(',') || 'aucun') +
        ' | manquantes : ' + (manquantes.join(',') || 'aucune') +
        ' | annonces : ' + (annoncees.map((m) => m[0]).join(', ') || 'aucune') +
        ' | fausses : ' + (fausses.join(', ') || 'aucune'));

  // 12. 030 ne reecrit pas 029 : la colonne, le drapeau et les politiques restent declarés dans la
  //     migration 029, et 030 ne contient aucune instruction qui les touche.
  const ecritures030 = sansCommentaires(corps(mig, 'COMMIT;'));
  const empietement = [
    'ALTER TABLE public.profiles', 'CREATE POLICY', 'DROP POLICY', 'profile_is_system_as_stored',
  ].filter((m) => ecritures030.includes(m));
  const porte029 = /profile_is_system_as_stored/.test(mig029) && /CREATE POLICY/.test(mig029);
  empietement.length === 0 && porte029
    ? ok('perimetre 030', 'aucune ecriture de 029 n est re-tapee par 030', '0 chevauchement, 029 intacte')
    : ko('perimetre 030', '030 ne recopie ni colonne, ni politique, ni garde du drapeau',
        'chevauchement : ' + (empietement.join(', ') || 'aucun') + ' | 029 porte ses declarations : ' + porte029);

  // 13. Le code de la fonction miroir : chaque chemin du garde d'appel declare le drapeau
  //     super_admin (soit littéralement, soit par la constance GUARD_FAIL, qui le porte). Un seul
  //     chemin oublie et un super_admin se retrouve traite comme un pair par le code, alors que la
  //     base l'autorise : l'ecran refuserait avant meme de tenter l'ecriture.
  const gA = update.indexOf('async function checkCallerCanManageUsers');
  const gB = update.indexOf('Deno.serve');
  const spanGarde = gA >= 0 && gB > gA ? codeTs(update.slice(gA, gB)) : null;
  const retours = spanGarde === null ? [] : [...spanGarde.matchAll(/return \{[^}]*\}/g)].map((m) => m[0]);
  const porteDrapeau = retours.filter((r) => /isSuperAdmin/.test(r) || /\.\.\.GUARD_FAIL/.test(r));
  const passeParConstance = retours.filter((r) => /\.\.\.GUARD_FAIL/.test(r));
  const vraiDrapeau = retours.filter((r) => /isSuperAdmin: true/.test(r));
  const constanceDeclaree = /const GUARD_FAIL = \{[^}]*isSuperAdmin: false/.test(codeTs(update));
  retours.length === 8 && porteDrapeau.length === retours.length && vraiDrapeau.length === 1 && constanceDeclaree
    ? ok('garde d appelant', 'les 8 chemins declarent le drapeau, un seul le pose a vrai',
        retours.length + ' retours, ' + porteDrapeau.length + ' declares (' + passeParConstance.length +
        ' par GUARD_FAIL), ' + vraiDrapeau.length + ' a vrai')
    : ko('garde d appelant', '8 retours, 0 sans drapeau, 1 a vrai, constance declarée',
        retours.length + ' retours, sans drapeau : ' + (retours.length - porteDrapeau.length) +
        ', a vrai : ' + vraiDrapeau.length + ', constance : ' + constanceDeclaree);

  // 14. Les trois regles du code qui doivent rester d'accord avec la base.
  const reglesCode = [
    ['cible refusee seulement aux non exemptes', /userId !== guard\.callerId && !guard\.isSuperAdmin && targetLevel >= guard\.level/],
    ['attribution d un role plus haut toujours refusee', /\(role\.access_level \?\? 0\) > guard\.level/],
    ['ligne racine rendue introuvable', /target\.is_system === true && userId !== guard\.callerId/],
  ];
  const ratees = reglesCode.filter(([, re]) => !re.test(update)).map(([n]) => n);
  ratees.length === 0
    ? ok('code miroir 030', 'les 3 regles de garde rendent la meme hierarchie que la base', '3/3')
    : ko('code miroir 030', '3 regles de garde coherentes avec 030', ratees.join(' | '));

  // 15. Le journal reste tenu par le trigger seul : aucune des deux fonctions n'ecrit dans
  //     audit_logs (voie H2 refusee, elle declarerait sa propre identite).
  !/audit_logs/.test(codeTs(update) + codeTs(create))
    ? ok('pas de ligne auto-declaree', 'aucune insertion dans audit_logs depuis les fonctions', 'audit_logs absent du code des deux fonctions')
    : ko('pas de ligne auto-declaree', 'audit_logs absent des fonctions', 'audit_logs cite dans du code');

  // 16. Ecran de connexion : le badge « Supabase connecté » a disparu, la pilule de demo reste et
  //     n'est rendue qu'en demo (sinon le mode sans Supabase redeviendrait silencieux).
  const badgeConnecte = /Supabase connecté/.test(login);
  const iPilule = login.indexOf('Mode démo — authentification locale');
  const avantPilule = iPilule >= 0 ? login.slice(0, iPilule) : '';
  const iOuverture = avantPilule.lastIndexOf('&& (');
  const ligneGarde = iOuverture >= 0
    ? avantPilule.slice(avantPilule.lastIndexOf('\n', iOuverture) + 1, iOuverture + 4).trim()
    : '';
  const piluleDemo = ligneGarde === '{!isSupabaseConfigured && (';
  !badgeConnecte && piluleDemo
    ? ok('badge de connexion', 'aucun etat affiche en connecté, la pilule démo a sa propre garde',
        'badge absent, garde : ' + ligneGarde)
    : ko('badge de connexion', 'rien en connecté + pilule sous sa propre garde',
        'badge=' + badgeConnecte + ' garde de la pilule : ' + (ligneGarde || 'introuvable'));

  // 17. Le pied de page rend le copyright demande, et rien d'autre a cette place.
  const ancienPied = /Environnement de production|BELL ENTERPRISE — Douala/.test(login);
  const nouveauPied = /© \{new Date\(\)\.getFullYear\(\)\} JENGU SOLUTIONS/.test(login);
  !ancienPied && nouveauPied
    ? ok('pied de page', 'copyright JENGU SOLUTIONS a la place de la ligne de production', 'remplace')
    : ko('pied de page', 'ancienne ligne absente, copyright present',
        'ancien=' + ancienPied + ' nouveau=' + nouveauPied);

  // 18. Aucun import mort dans la page : les deux retraits de texte laissaient CheckCircle2 et
  //     Database importes sans usage (un import inutilise est un signal faux pour le lecteur).
  const imports = (login.match(/\{([^}]*)\} from 'lucide-react'/) || [, ''])[1]
    .split(',').map((s) => s.trim()).filter(Boolean);
  const horsImport = login.replace(/\{[^}]*\} from 'lucide-react'/, '');
  const unused = imports.filter((nom) => !new RegExp('<' + nom + '[\\s/>]').test(horsImport));
  unused.length === 0
    ? ok('imports utilises', 'les ' + imports.length + ' icones importees sont toutes utilisees', imports.join(', '))
    : ko('imports utilises', 'aucune icone importee sans usage', 'unused : ' + unused.join(', '));

  // 19. Octets non ASCII : les deux fichiers de collage sont juges a zero, et la migration aussi
  //     (029 l'avait ete ; un accent en code nu est invisible en base et mortel au collage).
  for (const [nom, src] of [['030 migration', mig], ['030 collage', app]]) {
    const r = scanner(src);
    r.octets.length === 0 && r.etatFinal === 'code'
      ? ok('octets non ASCII ' + nom, 'aucun octet hors ASCII, citations equilibrees', '0')
      : ko('octets non ASCII ' + nom, '0 octet hors ASCII',
          r.octets.length + ' octets lignes ' + [...new Set(r.octets.map((o) => o.ligne))].join(',') +
          (r.etatFinal !== 'code' ? ' | citation ' + r.etatFinal + ' jamais fermee' : ''));
  }

  return res;
}

// --- morsure ---------------------------------------------------------------

// Une morsure par controle : chaque ancre doit etre unique dans son fichier, sinon la mutation est
// declaree NON EVALUEE au lieu d'etre comptee.
const MUTATIONS = [
  { nom: 'garde 030 ouverte des le depart', fichier: FIC.app, controle: 'garde 030',
    d: "set_config('bell.confirme_030', 'non', false)",
    a: "set_config('bell.confirme_030', 'oui', false)" },
  { nom: 'collage derive d un octet (0::SMALLINT -> 0)', fichier: FIC.app, controle: 'corps 030 identique',
    d: '                  ), 0::SMALLINT)\n          )\n      AND public.get_auth_access_level() >=',
    a: '                  ), 0)\n          )\n      AND public.get_auth_access_level() >=',
  },
  { nom: 'COMMENT ON du verrou perdu au collage', fichier: FIC.app, controle: 'ecrites 030',
    d: "COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS\n    'Verrou RLS : admin:users:manage, niveau STRICTEMENT",
    a: "'' COMMENT SUR_UNE_AUTRE_FONCTION FUNCTION public.can_manage_profile(UUID, UUID) IS\n    'Verrou RLS : admin:users:manage, niveau STRICTEMENT" },
  { nom: 'exemption declaree deux fois (le lecteur ne sait plus laquelle gagne)', fichier: FIC.app, controle: 'exemption super_admin',
    d: "              public.get_auth_role() = 'super_admin'\n              OR public.get_auth_access_level() >",
    a: "              public.get_auth_role() = 'super_admin' OR public.get_auth_role() = 'super_admin'\n              OR public.get_auth_access_level() >" },
  { nom: 'comparaison de cible relachee en >= (027 revient)', fichier: FIC.app, controle: 'compte des operateurs de niveau',
    d: '              OR public.get_auth_access_level() > COALESCE((',
    a: '              OR public.get_auth_access_level() >= COALESCE((' },
  { nom: 'attribution durcie en > (le sommet ne peut plus se dupliquer)', fichier: FIC.mig, controle: 'compte des operateurs de niveau',
    d: '      AND public.get_auth_access_level() >= COALESCE((',
    a: '      AND public.get_auth_access_level() > COALESCE((' },
  { nom: 'refus du compte racine retire du verrou', fichier: FIC.app, controle: 'racine toujours refusee',
    d: '      AND NOT COALESCE((\n              SELECT p.is_system',
    a: '      AND COALESCE((\n              SELECT p.is_active' },
  { nom: 'search_path plus epingle sur le verrou recree', fichier: FIC.app, controle: 'epinglage 030',
    d: 'SECURITY DEFINER\nSET search_path = public, pg_temp\nAS $fn$',
    a: 'SECURITY DEFINER\nAS $fn$' },
  { nom: 'ancre de colonne 029 abandonnee (0 ou 2 acceptes)', fichier: FIC.app, controle: 'ancres 030',
    d: 'IF v_att <> 1 THEN',
    a: 'IF v_att > 1 THEN' },
  { nom: 'verrou du drapeau unique saute dans $controle$', fichier: FIC.app, controle: 'controle pre-commit 030',
    d: 'IF v_dr <> 1 THEN',
    a: 'IF v_dr < 0 THEN' },
  { nom: 'deuxieme jeu de resultats apres la certification', fichier: FIC.app, controle: 'certification 030',
    d: 'AS commentaire_verrou_a_jour;',
    a: 'AS commentaire_verrou_a_jour;\nSELECT 1 AS deuxieme_jeu;' },
  { nom: 'le commentaire ne dit plus le compte rendu', fichier: FIC.app, controle: 'colonnes promises 030',
    d: 'Treize juges, tous booleens',
    a: 'Douze juges, tous booleens' },
  { nom: "l'attendu de fin change le compte sans changer la certification", fichier: FIC.app, controle: 'colonnes promises 030',
    d: 'ATTENDU : les treize colonnes a true',
    a: 'ATTENDU : les douze colonnes a true' },
  { nom: 'la certification ajoute un juge que la liste attendue ne connait pas', fichier: FIC.app, controle: 'colonnes promises 030',
    d: 'AS commentaire_verrou_a_jour;',
    a: 'AS commentaire_verrou_a_jour,\n    (SELECT true) AS hierarchie_parfaite;' },
  { nom: '030 se met a recopier une politique de 029', fichier: FIC.mig, controle: 'perimetre 030',
    d: '-- LE VERROU : exemption de niveau pour le super_admin, tout le reste de 029 conserve.',
    a: '-- LE VERROU : exemption de niveau pour le super_admin, tout le reste de 029 conserve.\nCREATE POLICY placeholder ON public.profiles FOR SELECT TO authenticated USING (true);' },
  { nom: 'un chemin du garde oublie le drapeau super_admin', fichier: FIC.update, controle: 'garde d appelant',
    d: 'return { callerId, level, isSuperAdmin: false, error: allowed ? null : ',
    a: 'return { callerId, level, error: allowed ? null : ' },
  { nom: 'le code rend la cible egalite autorisee pour tout le monde', fichier: FIC.update, controle: 'code miroir 030',
    d: 'userId !== guard.callerId && !guard.isSuperAdmin && targetLevel >= guard.level',
    a: 'userId !== guard.callerId && targetLevel > guard.level' },
  { nom: 'la ligne racine redevient visible par son message', fichier: FIC.update, controle: 'code miroir 030',
    d: "  if (target.is_system === true && userId !== guard.callerId) {\n    return json({ error: 'Profil utilisateur introuvable.' }, 404);\n  }",
    a: '' },
  { nom: 'une fonction se met a ecrire audit_logs', fichier: FIC.update, controle: 'pas de ligne auto-declaree',
    d: "  if (roleError) return json({ error: 'Impossible de vérifier le rôle.' }, 500);",
    a: "  await asCaller.from('audit_logs').insert({ action: 'X' });\n  if (roleError) return json({ error: 'role KO' }, 500);" },
  { nom: 'le badge connecte revient sur l ecran', fichier: FIC.login, controle: 'badge de connexion',
    d: '              Mode démo — authentification locale',
    a: '              Mode démo — authentification locale</span><span>Supabase connecté — authentification réelle' },
  { nom: 'la pilule demo sort de sa garde et parait dans tous les modes', fichier: FIC.login, controle: 'badge de connexion',
    d: '        {!isSupabaseConfigured && (\n          <div className="mt-3 inline-flex',
    a: '        {(isSupabaseConfigured || true) && (\n          <div className="mt-3 inline-flex' },
  { nom: 'l ancienne ligne de production revient', fichier: FIC.login, controle: 'pied de page',
    d: '          © {new Date().getFullYear()} JENGU SOLUTIONS — Tous droits réservés',
    a: '          Environnement de production BELL ENTERPRISE — Douala' },
  { nom: 'une icone importee sans usage', fichier: FIC.login, controle: 'imports utilises',
    d: "import { Shield, ArrowRight, Lock, Layers } from 'lucide-react';",
    a: "import { Shield, ArrowRight, Lock, Layers, Database } from 'lucide-react';" },
  { nom: 'accent en code nu dans le collage', fichier: FIC.app, controle: 'octets non ASCII 030 collage',
    d: "    'Verrou RLS : admin:users:manage, niveau STRICTEMENT superieur",
    a: "    'Verrou RLS : admin:users:manage, niveau STRICTEMENT supérieur" },
  { nom: 'accent en code nu dans la migration', fichier: FIC.mig, controle: 'octets non ASCII 030 migration',
    d: "-- Une seule ecriture de schema : la fonction de verrou can_manage_profile",
    a: "-- Une seule écriture de schema : la fonction de verrou can_manage_profile" },
];

function mordre() {
  let vues = 0, nonEvaluees = 0;
  for (const mu of MUTATIONS) {
    const original = L(mu.fichier);
    const n = original.split(mu.d).length - 1;
    if (n !== 1) {
      nonEvaluees++;
      console.log('MORSURE NON EVALUEE : ' + mu.nom + ' (ancre trouvee ' + n + ' fois, la mutation n aurait rien change)');
      continue;
    }
    const mut = mu.d === mu.a ? original.slice(0, 2) + ' ' + original.slice(2) : original.replace(mu.d, mu.a);
    if (md5(mut) === md5(original)) {
      nonEvaluees++;
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
  console.log('--- mutations vues : ' + vues + '/' + MUTATIONS.length +
    ', non evaluees : ' + nonEvaluees);
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
