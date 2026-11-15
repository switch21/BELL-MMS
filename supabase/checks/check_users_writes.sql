/*
Sonde LECTURE SEULE du journal d'audit des comptes : ce que la modale Utilisateurs a reellement
ecrit, ligne par ligne. Une seule instruction, aucune ecriture, aucun set_config.

Pour quoi faire : admin-update-user ecrit dans public.profiles, et la table profiles porte le
trigger trg_audit_profiles (migration 003). Donc toute modification reussie d'un compte laisse ici
une trace horodatee, avec l'acteur, et les valeurs avant/apres de is_active et role_id.
Le mot de passe n'apparait pas : il ne vit que dans auth.users, et le journal ne connait que profiles.

Ce que chaque colonne decide :
  sans_acteur = true  -> l'ecriture vient d'un contexte sans JWT utilisateur (Edge Function :
                         auth.uid() y est NULL), c'est la signature "Systeme" connue du lot A.
  actif_avant / actif_apres     -> une bascule actif/inactif reellement enregistree.
  role_avant / role_apres       -> un changement de role reellement enregistre.
  total_lignes_journal          -> nombre de lignes du journal jugees par la selection.

Attendu : 0 ligne UPDATE sur profiles depuis 2026-11-15 19:57 (heure du deploiement de
admin-update-user). Si ce total est nul, aucune tentative de modification n'a atteint la base, et
l'ecran n'a donc jamais pu reussir. Si des lignes existent, entity_id dit lequel des comptes a ete
touche, et sans_acteur dit par quelle voie.

La requete tient sur UNE ligne et le fichier est en ASCII strict : si le presse-papiers perd ses
sauts de ligne, le texte coller reste une instruction valide. Verifier avant d'executer que la 1ere
ligne de l'editeur est bien l'amorce du bloc de commentaire et que la sortie porte la colonne
sonde = check_users_writes. Ce fichier ne doit jamais contenir d'amorce ni de fin de commentaire a
l'interieur du bloc : PostgreSQL imbrique les blocs, un second niveau non referme fait echouer
l'envoi entier.
*/
SELECT 'check_users_writes' AS sonde, created_at, action, entity_id, user_email, (user_id IS NULL) AS sans_acteur, old_values ->> 'is_active' AS actif_avant, new_values ->> 'is_active' AS actif_apres, old_values ->> 'role_id' AS role_avant, new_values ->> 'role_id' AS role_apres, old_values ->> 'first_name' AS prenom_avant, new_values ->> 'first_name' AS prenom_apres, count(*) OVER () AS total_lignes_journal FROM public.audit_logs WHERE entity_name = 'profiles' ORDER BY created_at DESC LIMIT 15;
