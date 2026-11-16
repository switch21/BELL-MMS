// Presse-papiers d un script de collage : la donne doit survivre a la fermeture de son auteur.
// --copier ecrit les octets UTF-8 du fichier dans le presse-papiers depuis un processus PowerShell
// enfant qui se referme ; --verifier le relit depuis UN AUTRE processus et juge ce qui est la
// maintenant. Les deux roles sont separees parce qu un outil qui ecrit puis se relit lui-meme
// atteste son intention, pas la donne recoltee par l'editeur de production.
// Usage : node tools/presse_papiers.cjs --copier   supabase/checks/apply_027_confirme.sql
//         node tools/presse_papiers.cjs --verifier supabase/checks/apply_027_confirme.sql
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const mode = process.argv[2];
const cible = process.argv[3];
if (!['--copier', '--verifier'].includes(mode) || !cible) {
    console.error('Usage: node tools/presse_papiers.cjs --copier|--verifier <fichier.sql>');
    process.exit(2);
}
const fichier = path.resolve(cible);
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex').slice(0, 12);
const horsAscii = (s) => [...s].filter((c) => c.codePointAt(0) > 126);
const compteHorsAscii = (s) => horsAscii(s)
    .map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .reduce((acc, k) => (acc.set(k, (acc.get(k) || 0) + 1), acc), new Map());
// Signature canonique : Map.toString() rend "[object Map]" quel que soit son contenu, une
// comparaison sur cette forme ne peut pas echouer.
const signatureHorsAscii = (s) => [...compteHorsAscii(s).entries()].sort()
    .map(([k, v]) => k + ' x' + v).join(' | ');
const rendHorsAscii = (s) => {
    const m = compteHorsAscii(s);
    return m.size === 0 ? 'aucun' : [...m.entries()].map(([k, v]) => k + ' x' + v).join(', ');
};

const ECRIRE = '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false);'
    + ' $s = [Console]::In.ReadToEnd(); Set-Clipboard -Value $s';
const LIRE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);'
    + ' Get-Clipboard -Raw';

function ps(cmd, input) {
    const r = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
        { input, maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0) {
        throw new Error('powershell status ' + r.status + ' : ' + r.stderr.toString('utf8').trim());
    }
    return r;
}

if (mode === '--copier') {
    const octets = fs.readFileSync(fichier);
    const avant = ps(LIRE).stdout.toString('utf8');
    const avantLignes = avant.length ? avant.split(/\r?\n/).length : 0;
    ps(ECRIRE, octets);
    console.log('COPIEUR  fichier :: ' + path.basename(fichier));
    console.log('COPIEUR  octets a copier :: ' + octets.length + ', md5 ' + md5(octets));
    console.log('COPIEUR  presse-papiers avant :: ' + avant.length + ' octets / ' + avantLignes
        + ' lignes, premiere ligne « ' + avant.split(/\r?\n/)[0].slice(0, 48) + ' »');
    console.log('COPIEUR  processus auteur ferme, statut 0');
    process.exit(0);
}

const attendu = fs.readFileSync(fichier);
const renduBuf = ps(LIRE).stdout;
const rendu = renduBuf.toString('utf8');
const a = attendu.toString('utf8');
const nu = (s) => s.replace(/(\r\n|\n|\r)+$/, '');
const repli = (s) => nu(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lignes = (s) => repli(s).split('\n');

const controles = [
    ['presse-papiers non vide', rendu.length > 0],
    ['contenu identique a l artefact, fins de ligne repliees', repli(rendu) === repli(a)],
    ['compte de lignes identique', lignes(rendu).length === lignes(a).length],
    ['octets non ASCII conserves', rendu.length > 0
        && signatureHorsAscii(rendu) === signatureHorsAscii(a)],
    ['garde lisible dans ce qui est colle', /set_config\('bell\.confirme_\d{3}', '(oui|non)', false\);/.test(rendu)],
    ['derniere ligne est une fin d instruction', /;\s*$/.test(nu(rendu))],
    ['aucune balise XML (presse-papiers souille)', !/^\s*<\?xml|<HTML>/i.test(rendu)],
];
let echecs = 0;
for (const [nom, ok] of controles) {
    if (!ok) echecs++;
    console.log((ok ? 'VERT   ' : 'ROUGE  ') + nom);
}
const ligneGarde = lignes(rendu).find((l) => l.includes("set_config('bell.confirme_"));
console.log('--- md5 fichier ' + md5(attendu) + ' | md5 presse-papiers brut ' + md5(renduBuf)
    + ' | octets fichier ' + attendu.length + ' | octets lus ' + renduBuf.length);
console.log('--- ligne de garde lue :: ' + (ligneGarde ? ligneGarde.trim() : 'ABSENTE'));
console.log('--- hors-ASCII attendu :: ' + rendHorsAscii(a));
console.log('--- hors-ASCII lu     :: ' + rendHorsAscii(rendu));
console.log('--- tete lue  :: ' + lignes(rendu)[0]);
console.log('--- fin lue   :: ' + lignes(rendu).slice(-2).join(' ⏎ '));
console.log('--- ' + (controles.length - echecs) + '/' + controles.length
    + ' controles passes, ' + echecs + ' rouge(s), source = presse-papiers relu dans un second processus');
process.exit(echecs ? 1 : 0);
