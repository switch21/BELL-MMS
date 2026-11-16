-- BELL-MMS : Migration 028 - Adresse email des comptes dans profiles
--
-- Defaut constate le 2026-11-16 : l'adresse email n'existait nulle part de lisible par le client.
--   - profiles n'a aucune colonne email (001:92-103, et aucun ADD COLUMN email dans 002 a 027) ;
--   - la liste connectee fait supabase.from('profiles').select('*, role:roles(*)')
--     (src/modules/users/UsersPage.tsx:62) puis affiche {user.email} (:343) : en production le
--     rendu est vide, et setEmail(user.email) (:130) preremplit le vide ;
--   - le type UserProfile declare email: string (src/types/auth.types.ts:23) : le typage ment
--     depuis le depart, la colonne n'a jamais existe ;
--   - et admin-update-user ne connait pas le mot email (0 occurrence) : le champ etait grise
--     (UsersPage.tsx:461) parce que rien ne savait l'ecrire.
--
-- Choix consignes :
--   - profiles.email est un MIROIR de auth.users.email, tenu par trigger, pas une donnee saisie
--     librement : l'autorite reste auth.users (c'est la que Supabase Auth authentifie). Le patron
--     est deja dans la maison : 015 denormalise les noms pour la meme raison (la RLS de profiles
--     interdit la lecture croisee), et audit_logs porte deja user_email pour la meme raison.
--   - pas de contrainte UNIQUE sur profiles.email : l'unicite fait autorite dans auth.users ;
--     la dupliquer ici ajouterait un mode d'echec (deux ecritures qui se croisent) sans
--     ajouter de garantie. Le miroir peut donc etre legerement en retard, jamais divergent
--     autrement qu'en transit.
--   - le trigger ne touche PAS updated_at : synchroniser une adresse n'est pas une modification
--     metier du profil, la convention de la maison (updated_at porte par l'appelant) reste vraie.
--   - le trigger est SECURITY DEFINER avec search_path epingle : il est declenche par le role
--     du serveur d'auth (supabase_auth_admin), qui n'a aucun droit sur public.profiles.

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

-- Rattrapage des comptes deja la (quatre comptes au 2026-11-16). Effet de bord assume et voulu :
-- chaque ligne touchée passe par trg_audit_profiles, donc le journal garde une ligne UPDATE par
-- compte avec user_id NULL (l editeur SQL n a pas d auth.uid()). C est la meme signature que les
-- quatre CREATE deja presents dans audit_logs, pas un nouveau defaut.
UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE u.id = p.id
  AND p.email IS DISTINCT FROM u.email;
