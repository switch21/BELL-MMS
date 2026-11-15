-- 023 : accord de la permission admin:users:manage au Directeur General
--
-- Constat du 2026-11-15, apres la mise en service de admin-update-user : la fonction refuse le
-- DG pour une seule raison, le grant. Le seed 001 (ligne 173) exclut explicitement
-- admin:users:manage, admin:roles:manage et admin:settings:write du role directeur_general, donc
-- (a) la politique RLS admin:users:manage de 002 lui est fermee et (b) le controle interne de
-- admin-update-user lui est ferme. La modification d'un utilisateur (mot de passe, activation)
-- reste ainsi reservee a super_admin.
--
-- Perimetre strict : UN grant, admin:users:manage. Les deux autres exclusions du seed
-- (admin:roles:manage, admin:settings:write) restent en l'etat : le DG ne se voit pas attribuer
-- la gestion des roles ni l'ecriture des parametres systeme.
--
-- Voie d'application reellement utilisee : supabase/checks/apply_023_confirme.sql (collee dans
-- l'editeur SQL du tableau de bord, ecritures derriere bell.confirme_023 = 'oui').

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles AS r
JOIN public.permissions AS p ON p.code = 'admin:users:manage'
WHERE r.code = 'directeur_general'
ON CONFLICT (role_id, permission_id) DO NOTHING;
