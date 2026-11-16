// Juge de deploiement : compare ce que le site SERVED contient a ce que le depot contient.
// Ce qui est juge : le nom du bundle reellement pointe par le HTML en ligne, puis la presence des
// identifiants distinctifs de la feature dans ce bundle. Un commit ou une table en base ne prouve
// pas que l'ecran consomme le code.
// Usage :
//   node tools/controle_bundle_serve.cjs                     ;# etat actuel du site en ligne
//   node tools/controle_bundle_serve.cjs work_projects       ;# ajoute des identifiants a compter
// Sortie : une ligne par identifie (PRESENT xN / ABSENT x0), le nom du bundle, et un verdict.
const url = process.env.BELL_URL || 'https://bell-mms.vercel.app';
const distifs = process.argv.slice(2);
const PAR_DEFAUT = [
  'work_projects', 'work_project_steps', 'tender_documents', 'tender_service_orders',
  'agenda_events', 'bell_mms_tasks',
];
const MARQUEURS_PLACEHOLDER = ['Phase 6', 'Phase 7'];

const compte = (src, mot) => src.split(mot).length - 1;

(async () => {
  const html = await (await fetch(url + '/?nocache=' + Date.now(), { cache: 'no-store' })).text();
  const m = html.match(/src="(\/[^"]*assets\/index-[^"]*\.js)"/);
  if (!m) { console.log('ECHEC : aucun <script src="/assets/index-*.js"> dans le HTML servi'); process.exit(1); }
  const bundleUrl = url + m[1] + (process.env.FORCE_BAD_ASSET ? 'x' : '');
  // Hook de mutation : FORCE_BAD_ASSET=1 node tools/controle_bundle_serve.cjs doit SONNER ROUGE sur
  // le rewrite SPA. Sans ce hook, le controle du content-type ne serait jamais vu en defaillance.
  const rep = await fetch(bundleUrl, { cache: 'no-store' });
  const ct = rep.headers.get('content-type') || '';
  // Piege du rewrite SPA (vercel.json) : tout chemin inconnu renvoie 200 avec index.html.
  // Sans ce controle, un nom de bundle errone rendrait « 0 occurrence » comme si la feature etait absente.
  if (!ct.includes('javascript')) {
    console.log('ECHEC : ' + bundleUrl + ' renvoie ' + ct + ' (rewrite SPA), ce n est pas le bundle.');
    process.exit(1);
  }
  const js = await rep.text();
  console.log('bundle servi : ' + m[1] + ' (' + js.length + ' octets, ' + ct + ')');

  const mots = distifs.length ? distifs : PAR_DEFAUT;
  let vus = 0;
  for (const mot of mots) {
    const n = compte(js, mot);
    if (n > 0) vus++;
    console.log((n > 0 ? '  PRESENT' : '  ABSENT ') + ' ' + mot + ' x' + n);
  }
  for (const mot of MARQUEURS_PLACEHOLDER) {
    const n = compte(js, mot);
    console.log((n > 0 ? '  PLACEHOLDER' : '  disparu     ') + ' ' + mot + ' x' + n);
  }
  console.log('verdict : ' + vus + '/' + mots.length + ' identifiants presents dans le bundle servi');
})().catch((e) => { console.log('ECHEC reseau : ' + e.message); process.exit(1); });
