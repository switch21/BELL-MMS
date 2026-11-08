DROP POLICY IF EXISTS "Création de vente autorisée" ON public.sales;
DROP POLICY IF EXISTS "Validation de vente par direction" ON public.sales;
CREATE POLICY "Modification des ventes réservée à la direction"
ON public.sales FOR UPDATE TO authenticated
USING (public.has_permission('sales:validate'))
WITH CHECK (public.has_permission('sales:validate'));

DROP POLICY IF EXISTS "Gestion des réservations" ON public.reservations;

CREATE POLICY "Lecture des échéanciers autorisée"
ON public.payment_schedules FOR SELECT TO authenticated
USING (public.has_permission('sales:read'));

DROP TRIGGER IF EXISTS trg_audit_payment_schedules ON public.payment_schedules;
CREATE TRIGGER trg_audit_payment_schedules
AFTER INSERT OR UPDATE OR DELETE ON public.payment_schedules
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
