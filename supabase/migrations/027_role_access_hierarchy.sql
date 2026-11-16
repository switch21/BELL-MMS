-- BELL-MMS : Migration 027 - Hierarchie des roles dans la base
--
-- Defaut constate le 2026-11-16 : rien, nulle part, ne compare le niveau de l'appelant a celui
-- de la ligne cible. Trois trous mesurés dans le code du depot :
--   (a) supabase/functions/admin-update-user : le garde (:73-86) autorise super_admin sans
--       condition, puis tout role tenant admin:users:manage (done le DG depuis 023). L'ecriture
--       (:169-181) applique first_name, last_name, role_id et is_active a n'importe quel user_id.
--       Un compte DG peut donc retrograder, renommer ou suspendre le compte super_admin.
--   (b) supabase/migrations/002_security_rls.sql:89-92, « Gestion des profils par les
--       administrateurs » : FOR ALL ... USING (has_permission('admin:users:manage')), sans
--       aucune condition sur la ligne cible. Le meme resultat s'obtient par un
--       PATCH /rest/v1/profiles?id=eq.<super_admin> direct, fonction ou pas.
--   (c) 002:82-86, « Mise a jour personnelle de profil » : id = auth.uid() sur toutes les
--       colonnes, donc un compte peut changer son propre role_id (auto-promotion).
--
-- Regle posee ici, dans cet ordre :
--   1. chaque role porte un niveau : super_admin 4, directeur_general 3, secretaire 2,
--      collaborateur 1 ;
--   2. un compte ne peut ecrire une ligne de profil que si son niveau est superieur ou egal au
--      niveau ACTUEL de la cible, et qu'il n'attribue pas un role de niveau superieur au sien ;
--   3. la permission admin:users:manage reste requise : 027 RESTREINT les droits, n'en accorde
--      jamais a un role qui ne les avait pas (un secretaire ne peut donc pas toucher un
--      collaborateur) ;
--   4. le role d'un compte n'est plus jamais modifiable par le compte lui-meme : la politique
--      personnelle verrouille role_id, le changement de role passe par la politique
--      administrateur et par un niveau suffisant.
--
-- Choix consignes :
--   - le niveau vit dans roles.access_level (colonne), pas dans une carte du client : la carte
--     ROLE_PERMISSIONS_MAP est codee en dur (b2 reste ouvert) et le client n'est jamais la
--     verite. La regle doit tenir dans la base et dans la fonction.
--   - les trois nouvelles fonctions sont SECURITY DEFINER avec search_path epingle (meme forme
--     que get_auth_role / has_permission apres 021) : une politique qui lirait directement
--     profiles ou roles ferait recusion de politique sur elle-meme.
--   - pas de colonne de niveau sur profiles : le niveau se derive du role, une seule source.

ALTER TABLE public.roles
    ADD COLUMN IF NOT EXISTS access_level SMALLINT NOT NULL DEFAULT 1;

UPDATE public.roles AS r
SET access_level = v.lvl
FROM (VALUES
    ('super_admin', 4::SMALLINT),
    ('directeur_general', 3::SMALLINT),
    ('secretaire', 2::SMALLINT),
    ('collaborateur', 1::SMALLINT)
) AS v(code, lvl)
WHERE r.code = v.code;

-- Niveau de l'appelant, 0 quand aucun compte actif ne lui correspond (aucun droit d'ecriture).
CREATE OR REPLACE FUNCTION public.get_auth_access_level()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT r.access_level
        FROM public.profiles AS p
        JOIN public.roles AS r ON r.id = p.role_id
        WHERE p.id = auth.uid() AND p.is_active = true
    ), 0::SMALLINT);
$$;

-- Predicate des politiques d'administration de profiles.
-- p_profile_id : la ligne visee (ancienne ligne pour USING, ligne proposee pour WITH CHECK).
-- p_role_id    : le role qui va etre inscrit sur la ligne (ancien role pour USING).
-- La ligne cible est lue par la fonction, pas par la politique : la politique porte sur
-- profiles, une sous-requete directe sur profiles dans son expression serait recursive.
CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_permission('admin:users:manage')
      AND public.get_auth_access_level() >= COALESCE((
              SELECT r.access_level
              FROM public.profiles AS p
              JOIN public.roles AS r ON r.id = p.role_id
              WHERE p.id = p_profile_id
          ), 0::SMALLINT)
      AND public.get_auth_access_level() >= COALESCE((
              SELECT r.access_level
              FROM public.roles AS r
              WHERE r.id = p_role_id
          ), 0::SMALLINT);
$$;

-- Vrai seulement si le role propose est celui deja stocke : la politique personnelle ne peut
-- plus servir a se promouvoir soi-meme (trou (c)).
CREATE OR REPLACE FUNCTION public.profile_role_as_stored(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = p_profile_id
          AND p.role_id IS DISTINCT FROM p_role_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_auth_access_level() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_profile(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_role_as_stored(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_access_level() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_role_as_stored(UUID, UUID) TO authenticated;

COMMENT ON COLUMN public.roles.access_level IS
    'Niveau hierarchique du role : 4 super_admin, 3 directeur_general, 2 secretaire, 1 collaborateur.';
COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS
    'Verrou RLS : admin:users:manage + niveau de l appelant >= niveau de la cible et du role attribue.';

-- Nom des politiques conserve a l'identique depuis 002 (les accents aussi) : la garantie ne vient
-- pas du nom mais du controle AVANT COMMIT dans le script de collage, qui exige exactement trois
-- politiques sur profiles et que plus aucune politique d'ecriture ne se passe des deux fonctions
-- de verrou. Sans ce controle, une corruption d'accent laisserait l'ancienne politique ouverte
-- a cote de la nouvelle (quatre lignes au lieu de trois) et le trou survivrait en silence.
DROP POLICY IF EXISTS "Mise a jour personnelle de profil" ON public.profiles;
DROP POLICY IF EXISTS "Mise à jour personnelle de profil" ON public.profiles;
CREATE POLICY "Mise à jour personnelle de profil"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND public.profile_role_as_stored(id, role_id));

DROP POLICY IF EXISTS "Gestion des profils par les administrateurs" ON public.profiles;
CREATE POLICY "Gestion des profils par les administrateurs"
ON public.profiles FOR ALL
TO authenticated
USING (public.can_manage_profile(id, role_id))
WITH CHECK (public.can_manage_profile(id, role_id));
