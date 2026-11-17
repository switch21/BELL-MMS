-- BELL-MMS : Migration 030 - Le super_admin modifie tous les comptes visibles
--
-- Exigence posee par l'owner le 2026-11-17, immediatement apres l'ecran 5 de 029 (la ligne racine
-- a disparu de /users) : " super admin doit pouvoir modifier tous les utilisateurs ".
-- 029 rend la comparaison de niveau STRICTE sur la cible, donc un compte de niveau 4 ne peut ecrire
-- AUCUNE ligne de niveau 4 : au sommet de la hierarchie, la regle " egal refuse " interdit au
-- super_admin d'ecrire le deuxieme super_admin. L'exigence n'est pas " egal autorise pour tout le
-- monde ", elle est " le sommet n'a pas de pair ".
--
-- Regle posee ici :
--   1. un appelant qui porte le role super_admin ecrit toute ligne de profil qui n'est pas marquee
--      is_system, quel que soit le niveau de la cible ;
--   2. pour les autres roles, 029 reste la regle : niveau STRICTEMENT superieur a celui de la
--      cible, sinon deux pairs se touchent (DG sur DG, secretaire sur secretaire) ;
--   3. l'attribution d'un role garde " superieur ou egal " : personne n'attribue un role plus haut
--      que le sien ;
--   4. le compte racine echappe a la regle 1 : is_system bloque sa ligne pour tout le monde,
--      super_admin compris. " Tous les utilisateurs " porte sur la liste que l'ecran rend, pas sur
--      la ligne que 029 en a retiree a la demande de l'owner.
--
-- Une seule ecriture de schema : la fonction de verrou can_manage_profile, recreee a la clause de
-- niveau pres. Les trois politiques, la colonne is_system et le masque SELECT ne bougent pas.
--
-- Attention lue dans 002:39 : has_permission('admin:users:manage') est DEJA vraie pour un
-- super_admin (clause " OR get_auth_role() = 'super_admin' "). Ce n'est donc pas le droit qui
-- bloquait le pair, c'est la comparaison de niveau ; 030 ne touche pas has_permission.

BEGIN;

-- ANCHRES : 030 s'appuie sur 029 (la colonne is_system, citee par le corps) et ne concoit le
--    depart que dans l'etat mesure le 2026-11-17 (3 politiques sur profiles). Un autre compte
--    arrete le script plutot que de laisser une ecriture partielle derriere elle.
DO $$
DECLARE
    v_att INTEGER;
    v_pol INTEGER;
    v_sig INTEGER;
BEGIN
    SELECT count(*) INTO v_att
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.profiles'::regclass
      AND a.attname = 'is_system' AND NOT a.attisdropped;

    IF v_att <> 1 THEN
        RAISE EXCEPTION '030 exige la colonne profiles.is_system de 029 : % trouvee, 1 attendue', v_att
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_pol
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';

    IF v_pol <> 3 THEN
        RAISE EXCEPTION '030 ne touche pas les politiques : 3 attendues sur profiles, % trouvees', v_pol
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_sig
    FROM pg_proc AS f
    JOIN pg_namespace AS n ON n.oid = f.pronamespace
    WHERE n.nspname = 'public' AND f.proname = 'can_manage_profile' AND f.pronargs = 2;

    IF v_sig <> 1 THEN
        RAISE EXCEPTION 'can_manage_profile(UUID, UUID) introuvable (027/029) : % fonction(s)', v_sig
            USING ERRCODE = '23514';
    END IF;
END
$$;

-- LE VERROU : exemption de niveau pour le super_admin, tout le reste de 029 conserve.
CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT public.has_permission('admin:users:manage')
      AND (
              public.get_auth_role() = 'super_admin'
              OR public.get_auth_access_level() > COALESCE((
                      SELECT r.access_level
                      FROM public.profiles AS p
                      JOIN public.roles AS r ON r.id = p.role_id
                      WHERE p.id = p_profile_id
                  ), 0::SMALLINT)
          )
      AND public.get_auth_access_level() >= COALESCE((
              SELECT r.access_level
              FROM public.roles AS r
              WHERE r.id = p_role_id
          ), 0::SMALLINT)
      AND NOT COALESCE((
              SELECT p.is_system
              FROM public.profiles AS p
              WHERE p.id = p_profile_id
          ), false);
$fn$;

COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS
    'Verrou RLS : admin:users:manage, niveau STRICTEMENT superieur a la cible SAUF pour le role super_admin (exempte de comparaison), niveau superieur ou egal au role attribue, et cible non marquee is_system.';

COMMIT;
