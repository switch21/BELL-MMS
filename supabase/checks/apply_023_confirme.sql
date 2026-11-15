-- Application de la migration 023 : accord de admin:users:manage au Directeur General.
-- Meme ecriture que supabase/migrations/023_grant_admin_users_manage_dg.sql, avec le garde-fou de
-- confirmation pour un collage dans l'editeur SQL du tableau de bord. Ne jamais coller les deux :
-- celui-ci est la voie unique. Les ecrites ne partent que si bell.confirme_023 vaut 'oui'.

-- ETAT AVANT (lecture seule, 1 ligne) : attendu dg_holds_users = false avant application.
SELECT
    (count(*) FILTER (WHERE r.code = 'directeur_general' AND p.code = 'admin:users:manage') = 1) AS dg_holds_users,
    (count(*) FILTER (WHERE r.code = 'super_admin' AND p.code = 'admin:users:manage') = 1)       AS sa_holds_users,
    count(DISTINCT r.id) FILTER (WHERE p.code = 'admin:users:manage')                            AS nb_roles_graces,
    count(*)                                                                                     AS total_lignes_matrice
FROM public.roles AS r
JOIN public.role_permissions AS rp ON rp.role_id = r.id
JOIN public.permissions AS p ON p.id = rp.permission_id;

SELECT set_config('bell.confirme_023', 'non', false);

DO $guard$
BEGIN
    IF coalesce(current_setting('bell.confirme_023', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application 023 non confirmee : remplacer bell.confirme_023 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$guard$;

BEGIN;

-- Ancre jugee avant toute ecriture : exactement une ligne (directeur_general, admin:users:manage).
DO $ancre$
DECLARE
    v_nb INT;
BEGIN
    SELECT count(*) INTO v_nb
    FROM public.roles r
    JOIN public.permissions p ON p.code = 'admin:users:manage'
    WHERE r.code = 'directeur_general';

    IF v_nb <> 1 THEN
        RAISE EXCEPTION 'Ancre 023 : % ligne(s) pour directeur_general / admin:users:manage, 1 attendue. Transaction annulee.', v_nb;
    END IF;
END
$ancre$;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles AS r
JOIN public.permissions AS p ON p.code = 'admin:users:manage'
WHERE r.code = 'directeur_general'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

-- CERTIFICATION (lecture seule, 1 ligne attendue) :
--   dg_holds_users         = le grant demande est present
--   sa_holds_users         = super_admin n'a rien perdu
--   seuls_deux_roles_graces = personne d'autre n'a recu le grant (2 roles : super_admin + DG)
--   dg_pas_de_derive       = le perimetre n'a pas deborde sur admin:roles:manage / admin:settings:write
--   total_lignes_matrice   = nombre de lignes reellement jugees par les comptes ci-dessus
-- Attendu : true, true, true, true, et un total_lignes_matrice strictement superieur a 24.
SELECT
    (count(*) FILTER (WHERE r.code = 'directeur_general' AND p.code = 'admin:users:manage') = 1) AS dg_holds_users,
    (count(*) FILTER (WHERE r.code = 'super_admin' AND p.code = 'admin:users:manage') = 1)       AS sa_holds_users,
    (count(DISTINCT r.id) FILTER (WHERE p.code = 'admin:users:manage') = 2)                      AS seuls_deux_roles_graces,
    (count(*) FILTER (WHERE r.code = 'directeur_general'
                         AND p.code IN ('admin:roles:manage', 'admin:settings:write')) = 0)       AS dg_pas_de_derive,
    count(*)                                                                                      AS total_lignes_matrice
FROM public.roles AS r
JOIN public.role_permissions AS rp ON rp.role_id = r.id
JOIN public.permissions AS p ON p.id = rp.permission_id;
