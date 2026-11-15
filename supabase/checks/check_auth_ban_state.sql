/*
Etat de depart AVANT le rejeu activation / mot de passe (GO 1).
LECTURE SEULE : un seul SELECT, aucune ecriture, aucun set_config, aucune CTE.
Colonne cible lue par admin-update-user : auth.users.banned_until (NULL = compte non banni).

Attendu pour l'etat de depart (avant toute experience) :
  - 1 ligne par compte auth.users, profil_present = true sur toutes les lignes.
  - banni = false partout (aucun compte n'a encore ete suspendu par la fonction).
  - actif_sans_ban = true pour chaque compte actif.
  - incoherent = false partout : is_active et banned_until ne se contredisent pas.
  - total_comptes = nombre de lignes rendues, a re-citer dans le compte rendu.
Apres GO 3 (suspension) : la ligne du compte teste doit passer a banni = true, inactif_banni = true,
is_active = false. Apres GO 4 : retour banni = false.

Deux colonnes de temps, deux preuves distinctes :
  last_sign_in_at  ne bouge que sur une connexion reussie (c'est la preuve du mot de passe qui marche).
  auth_updated_at  = derniere ECRITURE sur la ligne auth, sans distinction de cause (mot de passe,
                     ban, confirmation d'email, refresh de session). C'est un temoin d'activite, pas
                     un temoin de mot de passe : seul last_sign_in_at prouve une connexion reussie.
                     Un compte fraichement cree par l'Edge Function a auth_updated_at a quelques
                     millisecondes de created_at : c'est l'empreinte de la creation, pas une modif.
Aucune de ces deux colonnes ne remplace l'autre : un changement de mot de passe sans reconnexion
deplace auth_updated_at et laisse last_sign_in_at a NULL.

Si la requete rend une erreur de droit sur le schema auth (permission denied for table users),
le compte rendu doit le dire tel quel : la baseline viendra alors de l'UI + du rejeu, pas de ici.

Une amorce ou une fin de commentaire recopiee dans ce bloc ouvrirait un second niveau : PostgreSQL
imbrique les blocs, et l'envoi entier echouerait en 42601. Le bloc doit rester a un seul niveau.
*/
SELECT u.email, p.id AS profile_id, (p.id IS NOT NULL) AS profil_present, p.is_active, p.first_name, p.last_name, r.code AS role_code, u.banned_until, (u.banned_until IS NOT NULL) AS banni, (p.is_active = true AND u.banned_until IS NULL) AS actif_sans_ban, (p.is_active = false AND u.banned_until IS NOT NULL) AS inactif_banni, NOT ((p.is_active = true AND u.banned_until IS NULL) OR (p.is_active = false AND u.banned_until IS NOT NULL)) AS incoherent, u.last_sign_in_at, u.updated_at AS auth_updated_at, u.created_at, count(*) OVER () AS total_comptes FROM auth.users AS u LEFT JOIN public.profiles AS p ON p.id = u.id LEFT JOIN public.roles AS r ON r.id = p.role_id ORDER BY u.email;
