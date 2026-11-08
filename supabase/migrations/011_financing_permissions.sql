DROP POLICY IF EXISTS "Gestion du financement" ON public.financing_cases;

CREATE POLICY "Création des dossiers de financement autorisée"
ON public.financing_cases FOR INSERT TO authenticated
WITH CHECK (public.has_permission('services:write'));

CREATE POLICY "Décision des dossiers de financement réservée à la direction"
ON public.financing_cases FOR UPDATE TO authenticated
USING (
    public.has_permission('services:validate')
    OR public.get_auth_role() IN ('directeur_general', 'super_admin')
)
WITH CHECK (
    public.has_permission('services:validate')
    OR public.get_auth_role() IN ('directeur_general', 'super_admin')
);
