-- Audit all client and partner changes performed through Supabase.
DROP TRIGGER IF EXISTS trg_audit_clients ON public.clients;
CREATE TRIGGER trg_audit_clients
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_partners ON public.partners;
CREATE TRIGGER trg_audit_partners
AFTER INSERT OR UPDATE OR DELETE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
