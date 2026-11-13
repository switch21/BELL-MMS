-- BELL-MMS : Migration 015 - Raccordement du module Prestations
-- Complète les policies manquantes sur les étapes et ajoute les noms
-- d'affichage dénormalisés attendus par l'interface (aucun accès croisé
-- aux profils n'est accordé : la RLS de public.profiles reste inchangée).

-- 1. COLONNES D'AFFICHAGE DES NOMS
ALTER TABLE public.service_cases
    ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS dg_validated_by_name VARCHAR(200);

ALTER TABLE public.service_case_steps
    ADD COLUMN IF NOT EXISTS completed_by_name VARCHAR(200);

-- 2. POLITIQUES RLS MANQUANTES SUR LES ÉTAPES
-- (la table était protégée par RLS sans aucune policy : tout accès était refusé)
DROP POLICY IF EXISTS "Lecture des étapes de prestation" ON public.service_case_steps;
CREATE POLICY "Lecture des étapes de prestation"
ON public.service_case_steps FOR SELECT TO authenticated
USING (public.has_permission('services:read'));

DROP POLICY IF EXISTS "Écriture des étapes de prestation" ON public.service_case_steps;
CREATE POLICY "Écriture des étapes de prestation"
ON public.service_case_steps FOR ALL TO authenticated
USING (public.has_permission('services:write'))
WITH CHECK (public.has_permission('services:write'));

-- 3. INDEX POUR LES LECTURES FRÉQUENTES
CREATE INDEX IF NOT EXISTS idx_service_cases_client ON public.service_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_service_cases_status ON public.service_cases(status);
CREATE INDEX IF NOT EXISTS idx_service_case_steps_case ON public.service_case_steps(case_id);

-- 4. TRACE D'AUDIT DES ÉTAPES
DROP TRIGGER IF EXISTS trg_audit_service_case_steps ON public.service_case_steps;
CREATE TRIGGER trg_audit_service_case_steps
AFTER INSERT OR UPDATE OR DELETE ON public.service_case_steps
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
