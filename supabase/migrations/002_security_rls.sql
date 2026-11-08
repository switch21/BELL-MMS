-- BELL-MMS : Migration 002 - Politiques de Sécurité Row Level Security (RLS)

-- Activer RLS sur les tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 1. FONCTIONS DE SÉCURITÉ RPC (SECURITY DEFINER)
-- Fonction pour récupérer le code du rôle de l'utilisateur connecté
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT r.code 
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND p.is_active = true;
$$;

-- Fonction pour vérifier si l'utilisateur possède une permission spécifique
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.role_permissions rp ON p.role_id = rp.role_id
        JOIN public.permissions perm ON rp.permission_id = perm.id
        WHERE p.id = auth.uid() 
          AND p.is_active = true 
          AND (perm.code = p_permission_code OR public.get_auth_role() = 'super_admin')
    );
$$;

-- 2. POLITIQUES POUR 'roles' & 'permissions'
-- Tout utilisateur authentifié actif peut lire les rôles et permissions
CREATE POLICY "Les utilisateurs authentifiés peuvent lire les rôles"
ON public.roles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Seul le super_admin peut modifier les rôles"
ON public.roles FOR ALL
TO authenticated
USING (public.get_auth_role() = 'super_admin');

CREATE POLICY "Les utilisateurs authentifiés peuvent lire les permissions"
ON public.permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Les utilisateurs authentifiés peuvent lire role_permissions"
ON public.role_permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Seul le super_admin peut modifier role_permissions"
ON public.role_permissions FOR ALL
TO authenticated
USING (public.get_auth_role() = 'super_admin');

-- 3. POLITIQUES POUR 'profiles'
-- Un utilisateur peut lire son propre profil ou tous les profils s'il a les droits admin/direction
CREATE POLICY "Lecture des profils autorisée aux utilisateurs authentifiés"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    OR public.has_permission('admin:users:manage')
    OR public.get_auth_role() IN ('directeur_general', 'super_admin', 'secretaire')
);

-- Un utilisateur peut mettre à jour ses préférences personnelles (thème, téléphone)
CREATE POLICY "Mise à jour personnelle de profil"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Seul le super_admin ou un admin autorisé peut créer ou modifier les rôles d'autres utilisateurs
CREATE POLICY "Gestion des profils par les administrateurs"
ON public.profiles FOR ALL
TO authenticated
USING (public.has_permission('admin:users:manage'));

-- 4. POLITIQUES POUR 'audit_logs'
-- Tout le monde peut insérer via trigger ou application
CREATE POLICY "Insertion des logs d'audit autorisée"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Seuls les utilisateurs avec la permission peuvent lire les logs d'audit
CREATE POLICY "Lecture des logs d'audit sécurisée"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_permission('admin:audit:read'));

-- Aucune mise à jour ni suppression autorisée sur audit_logs (immuabilité)
-- (Pas de politique UPDATE ou DELETE = rejet automatique)

-- 5. POLITIQUES POUR 'app_settings'
CREATE POLICY "Lecture des paramètres pour les utilisateurs authentifiés"
ON public.app_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Modification des paramètres restreinte"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.has_permission('admin:settings:write'))
WITH CHECK (public.has_permission('admin:settings:write'));
