-- BELL-MMS : Migration 029 - Hierarchie stricte et compte racine protege
--
-- Defaut constate le 2026-11-17, mesure en production (check_comptes_et_hierarchie.sql) :
--   (a) 027:79 et 027:85 comparent avec '>=' : un appelant de niveau 4 peut ecrire une ligne de
--       niveau 4. Deux comptes super_admin se touchent donc l'un l'autre, et un DG (3) peut
--       renommer un autre DG (3). La regle retenue par l'owner est " niveau superieur ou egal
--       refuse " : le depot rendait l'inverse.
--   (b) politique SELECT de 002 (002:72-79) : USING rend TOUTES les lignes a quiconque porte
--       admin:users:manage ou un role directeur_general / super_admin / secretaire. Le compte
--       admin principal est donc visible depuis n'importe quel compte admin, ce que l'owner refuse.
--   (c) mesure : 4 comptes, 1 seul super_admin, 0 compte Auth sans profil, nb_policies_profiles=3.
--       La protection demandee ne peut pas reposer sur l'existence d'un second super_admin : elle
--       doit tenir AVANT qu'un second super_admin soit cree.
--
-- Regle posee ici :
--   1. un compte n'ecrit une ligne de profil que si son niveau est STRICTEMENT SUPERIEUR au niveau
--      actuel de la cible ; deux pairs ne se touchent plus ;
--   2. un compte n'attribue que des roles de niveau inferieur ou egal au sien : sinon le compte
--      racine ne pourrait plus jamais creer un second super_admin, et la protection exclurait la
--      voie menant a ce qu'elle protege ;
--   3. toute ligne marquee is_system = true est retiree de la vue de tous, sauf de son propre
--      titulaire, et refusee a toute ecriture d'un autre compte ;
--   4. le drapeau racine n'est accessible en ecriture par AUCUNE voie RLS : ni par la politique
--      d'administration (WITH CHECK exige is_system non vrai, ce qui interdit aussi d'INSERER une
--      ligne invisible), ni par la politique personnelle (sans quoi un DG marquerait sa propre
--      ligne is_system = true et se rendrait du coup invisible et intouchable, ce qui retournerait
--      la protection contre l'attaque qu'elle est censee empecher) ; il ne se pose que par cette
--      migration, qui tourne en tant que proprietaire ;
--   5. le compte racine est la ligne la plus ancienne portee par le role super_admin ; la migration
--      echoue plutot que de deviner s'il y en a zero ou plusieurs.
--
-- Choix consignes :
--   - le drapeau vit en colonne (profiles.is_system), pas dans une liste d'uuid : un uuid ecrit
--     dans du SQL ne survit pas a un changement de projet, et la regle doit tenir dans la base.
--   - ce fichier est en ASCII pur, y compris les noms de politiques : le collage par
--     presse-papiers est la surface ou les accents se corrompent (022 porte 56 octets non ASCII a
--     preserver a chaque collage). Un script a 0 octet non ASCII ne peut pas etre mute
--     silencieusement. Les anciennes politiques, dont les noms sont accentues en base, sont
--     retirees LUE DEPUIS LE CATALOGUE (format('%I')), jamais par un nom recopie.
--   - le retrait catalogue s'appuie sur la mesure (c) : exactement 3 politiques. Si le compte est
--     autre, la migration refuse de poser la main sur une politique qu'elle ne connait pas.
--   - can_manage_profile reste SECURITY DEFINER avec search_path epingle : la politique porte sur
--     profiles, une sous-requete directe dans son expression serait recursive.

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_system IS
    'Compte racine : retire de la vue des autres comptes, interdit de modification par un autre compte, y compris un pair de niveau egal.';

-- Le compte racine est la ligne la plus ancienne portee par le role super_admin.
-- Zero candidat ou plusieurs candidats = arret, pas de choix implicite.
DO $$
DECLARE
    v_racine UUID;
    v_nb     INT;
    v_deja   INT;
BEGIN
    SELECT count(*) INTO v_deja FROM public.profiles WHERE is_system = true;
    IF v_deja > 1 THEN
        RAISE EXCEPTION 'Compte racine : % lignes is_system deja, reparer avant 029', v_deja
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_nb
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE r.code = 'super_admin';

    IF v_nb <> 1 THEN
        RAISE EXCEPTION 'Compte racine : % comptes super_admin trouves, 1 attendu', v_nb
            USING ERRCODE = '23514';
    END IF;

    SELECT p.id INTO v_racine
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE r.code = 'super_admin'
    ORDER BY p.created_at NULLS LAST, p.id
    LIMIT 1;

    UPDATE public.profiles SET is_system = true WHERE id = v_racine;
END
$$;

-- Etat attendu mesure le 2026-11-17 : exactement 3 politiques sur profiles. On les retire par le
-- catalogue, ce qui evite de retaper un nom accentue, puis on les recree en ASCII.
DO $$
DECLARE
    v_pol INT;
    r     RECORD;
BEGIN
    SELECT count(*) INTO v_pol
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';

    IF v_pol <> 3 THEN
        RAISE EXCEPTION 'Politiques profiles : 3 attendues avant 029, % trouvees', v_pol
            USING ERRCODE = '23514';
    END IF;

    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'profiles'
             ORDER BY policyname
    LOOP
        EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
    END LOOP;
END
$$;

-- Predicate des politiques d'administration : niveau STRICTEMENT superieur sur la cible, niveau
-- superieur ou egal sur le role attribue, et aucune ecriture sur une ligne racine.
CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT public.has_permission('admin:users:manage')
      AND public.get_auth_access_level() > COALESCE((
              SELECT r.access_level
              FROM public.profiles AS p
              JOIN public.roles AS r ON r.id = p.role_id
              WHERE p.id = p_profile_id
          ), 0::SMALLINT)
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
    'Verrou RLS : admin:users:manage + niveau de l appelant STRICTEMENT superieur a celui de la cible, superieur ou egal a celui du role attribue, et cible non marquee is_system.';

-- Garde-fou du drapeau : la politique personnelle ne peut ni poser ni retirer is_system sur sa
-- propre ligne. Sans elle, un compte de niveau 3 se marque lui-meme racine (id = auth.uid() passe,
-- et la ligne devient alors invisible et intouchable pour tout le monde).
CREATE OR REPLACE FUNCTION public.profile_is_system_as_stored(p_profile_id UUID, p_is_system BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = p_profile_id
          AND p.is_system IS DISTINCT FROM p_is_system
    );
$fn$;

REVOKE ALL ON FUNCTION public.profile_is_system_as_stored(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_is_system_as_stored(UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.profile_is_system_as_stored(UUID, BOOLEAN) IS
    'Vrai seulement si le drapeau propose est celui deja stocke : la politique personnelle ne peut pas creer de compte racine.';

-- Politique d'administration : meme verrou en USING et en WITH CHECK. WITH CHECK interdit de
-- proposer is_system = true, ce qui ferme aussi l'INSERT d'une ligne invisible.
CREATE POLICY "Gestion des profils par les administrateurs"
ON public.profiles FOR ALL
TO authenticated
USING (public.can_manage_profile(id, role_id))
WITH CHECK (public.can_manage_profile(id, role_id) AND is_system IS NOT TRUE);

-- Lecture : la ligne racine n'apparait que pour son propre titulaire.
CREATE POLICY "Lecture des profils selon hierarchie"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR (
        NOT is_system
        AND (
            public.has_permission('admin:users:manage')
            OR public.get_auth_role() IN ('directeur_general', 'super_admin', 'secretaire')
        )
    )
);

-- Ecriture personnelle : portee inchangee (soi-meme, sans changer son role ni se declarer racine),
-- nom en ASCII.
CREATE POLICY "Mise a jour personnelle de profil"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    AND public.profile_role_as_stored(id, role_id)
    AND public.profile_is_system_as_stored(id, is_system)
);

COMMIT;
