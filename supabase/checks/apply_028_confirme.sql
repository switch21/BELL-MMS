-- Meme contenu que supabase/migrations/028_profile_email_mirror.sql, avec le garde-fou de
-- confirmation et un controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du
-- tableau de bord. Ne jamais coller les deux : celui-ci est la voie unique.
-- Les ecrites ne partent que si bell.confirme_028 vaut 'oui'. Sans ce passage, le script ne
-- touche rien et rend une erreur.
--
-- Objet : rendre l'adresse email lisible et modifiable. profiles n'a jamais eu de colonne email
-- (001:92-103, aucun ADD COLUMN jusqu'a 027), la liste connectee affichait donc user.email sur
-- une colonne inexistante (UsersPage.tsx:62 puis :343 = vide) et admin-update-user ne connaissait
-- pas le mot email. 028 pose un MIROIR de auth.users.email tenu par trigger ; l'autorite reste
-- auth.users, c'est la que Supabase Auth authentifie.
--
-- Ordre impose : 028 apres 027 (ils partagent profiles), et AVANT le redeploiement des Edge
-- Functions qui ecrivent l'email et lisent roles.access_level.
--
-- Controle explicite du risque de collage : le declencheur vit sur auth.users, table du serveur
-- d'identification. Si le role proprietaire de auth.users changeait d'avis sur les privileges,
-- l'ancre 2 arrete le script avant toute ecriture, et le controle 5 exige le trigger ACTIVE et
-- declenchable apres creation : un trigger present mais inactif ne prouverait rien.

-- 1. PRE-VOL LECTURE SEULE (coller seul si besoin ; dans le collage complet, seul le dernier jeu
--    de resultats est rendu, donc cette grille est masquee par la certification 6).
SELECT
    to_regclass('auth.users') IS NOT NULL AS auth_users_present,
    (SELECT count(*) FROM pg_attribute AS a
      WHERE a.attrelid = 'auth.users'::regclass
        AND a.attname = 'email' AND NOT a.attisdropped) = 1 AS email_dans_auth,
    (SELECT count(*) FROM pg_attribute AS a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'email' AND NOT a.attisdropped) AS colonne_email_deja_la,
    (SELECT count(*) FROM public.profiles) AS comptes_profils;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_028', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_028', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_028 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- 3. ANCHRES : auth.users existe avec sa colonne email, profiles existe.
DO $ancre$
DECLARE
    v_auth_email INTEGER;
    v_profiles BOOLEAN;
BEGIN
    SELECT count(*) INTO v_auth_email FROM pg_attribute AS a
    WHERE a.attrelid = 'auth.users'::regclass
      AND a.attname = 'email' AND NOT a.attisdropped;
    IF v_auth_email <> 1 THEN
        RAISE EXCEPTION 'Ancre auth.users invalide : la colonne email est introuvable (% ligne de catalogue).', v_auth_email
            USING ERRCODE = 'P0001';
    END IF;

    SELECT to_regclass('public.profiles') IS NOT NULL INTO v_profiles;
    IF NOT v_profiles THEN
        RAISE EXCEPTION 'Ancre profiles absente : la table public.profiles est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;
END
$ancre$;

-- 4. MIROIR + DECLENCHEUR
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

COMMENT ON COLUMN public.profiles.email IS
    'Miroir de auth.users.email, tenu par le trigger on_auth_user_email. Lu par les ecrans, ecrit par Auth.';

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- INSERT : le profil n existe pas encore a l instant du compte Auth (c est
    -- admin-create-user qui l insere juste apres, avec l email dans son insert).
    -- L UPDATE ne touche donc aucune ligne, ce n est pas une erreur.
    UPDATE public.profiles AS p
    SET email = NEW.email
    WHERE p.id = NEW.id
      AND p.email IS DISTINCT FROM NEW.email;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email ON auth.users;
CREATE TRIGGER on_auth_user_email
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_profile_email() TO supabase_auth_admin, service_role, postgres;

-- 5. RATTRAPAGE des comptes deja la. Effet de bord assume et voulu : chaque ligne touchee passe
--    par trg_audit_profiles, donc le journal garde une ligne UPDATE par compte avec user_id NULL
--    (l'editeur SQL n'a pas d'auth.uid()). C'est la meme signature que les lignes deja presentes
--    dans audit_logs, pas un nouveau defaut.
UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE u.id = p.id
  AND p.email IS DISTINCT FROM u.email;

-- 6. CONTROLE AVANT COMMIT : la propriete, pas un proxy.
--   (a) la colonne email existe sur profiles (information lisible par le client via select('*')) ;
--   (b) le declencheur est branche sur auth.users, ACTIF (tgenabled = 'O') et non interne, sinon
--       il ne se déclencherait pas et le miroir serait silencieusement mort ;
--   (c) la fonction est SECURITY DEFINER avec search_path epingle : le serveur d'auth n'a aucun
--       droit sur public.profiles, sans definer l'ecriture echouerait a chaque changement d'email ;
--   (d) le miroir est plein et identique a auth.users : un compte sans email ici = rattrapage
--       qui n'a pas tourne ; un compte different = autorite mal copiee.
DO $controle$
DECLARE
    v_colonne INTEGER;
    v_trigger INTEGER;
    v_fonction INTEGER;
    v_sans_email INTEGER;
    v_divergents INTEGER;
BEGIN
    SELECT count(*) INTO v_colonne FROM pg_attribute AS a
    WHERE a.attrelid = 'public.profiles'::regclass
      AND a.attname = 'email' AND NOT a.attisdropped;
    IF v_colonne <> 1 THEN
        RAISE EXCEPTION 'Colonne profiles.email : 1 attendue, % trouvee.', v_colonne
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_trigger FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_email'
      AND NOT t.tgisinternal AND t.tgenabled = 'O';
    IF v_trigger <> 1 THEN
        RAISE EXCEPTION 'Declencheur on_auth_user_email : 1 attendu actif et non interne, % trouve.', v_trigger
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_fonction FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_profile_email'
      AND p.prosecdef
      AND array_to_string(p.proconfig, ' ; ') LIKE '%search_path=public, pg_temp%';
    IF v_fonction <> 1 THEN
        RAISE EXCEPTION 'Fonction sync_profile_email : 1 attendue en SECURITY DEFINER et search_path epingle, % trouvee.', v_fonction
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_sans_email FROM public.profiles AS p
    JOIN auth.users AS u ON u.id = p.id
    WHERE p.email IS NULL AND u.email IS NOT NULL;
    IF v_sans_email <> 0 THEN
        RAISE EXCEPTION 'Rattrapage incomplet : % compte(s) avec un email dans auth.users et rien dans profiles.', v_sans_email
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_divergents FROM public.profiles AS p
    JOIN auth.users AS u ON u.id = p.id
    WHERE p.email IS DISTINCT FROM u.email;
    IF v_divergents <> 0 THEN
        RAISE EXCEPTION 'Miroir divergent : % compte(s) ou profiles.email n est pas auth.users.email.', v_divergents
            USING ERRCODE = 'P0001';
    END IF;
END
$controle$;

COMMIT;

-- 7. CERTIFICATION (LECTURE SEULE, 1 ligne, dernier jeu rendu par l'editeur).
--   Attendu : colonne_email, trigger_branche_actif, fonction_definer_epinglee,
--             droit_serveur_auth, anon_refuse, miroir_plein, miroir_identique valent true ;
--             comptes_miroir = nombre de comptes (4 au 2026-11-16), comptes_sans_email = 0.
SELECT
    (SELECT count(*) FROM pg_attribute AS a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'email' AND NOT a.attisdropped) = 1 AS colonne_email,
    (SELECT count(*) FROM pg_trigger AS t
      JOIN pg_class AS c ON c.oid = t.tgrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' AND c.relname = 'users'
        AND t.tgname = 'on_auth_user_email'
        AND NOT t.tgisinternal AND t.tgenabled = 'O') = 1 AS trigger_branche_actif,
    (SELECT count(*) FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sync_profile_email'
        AND p.prosecdef
        AND array_to_string(p.proconfig, ' ; ') LIKE '%search_path=public, pg_temp%') = 1 AS fonction_definer_epinglee,
    has_function_privilege('supabase_auth_admin', 'public.sync_profile_email()', 'EXECUTE') AS droit_serveur_auth,
    NOT has_function_privilege('anon', 'public.sync_profile_email()', 'EXECUTE') AS anon_refuse,
    (SELECT count(*) FROM public.profiles AS p
      JOIN auth.users AS u ON u.id = p.id
      WHERE p.email IS NOT NULL) AS comptes_miroir,
    (SELECT count(*) FROM public.profiles AS p
      JOIN auth.users AS u ON u.id = p.id
      WHERE p.email IS DISTINCT FROM u.email) = 0 AS miroir_identique;
