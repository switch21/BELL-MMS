-- 018_auth_session_audit.sql
-- Journalise les connexions reussies dans audit_logs.
-- Le client ne peut pas inserer dans audit_logs (RLS) : on expose une RPC
-- SECURITY DEFINER qui n'accepte aucune identite fournie par l'appelant.

CREATE OR REPLACE FUNCTION public.log_login_event()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_email VARCHAR(255);
    v_log_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utilisateur non authentifie.' USING ERRCODE = '42501';
    END IF;

    SELECT email INTO v_email
    FROM auth.users
    WHERE id = v_user_id;

    INSERT INTO public.audit_logs (
        user_id, user_email, action, module, entity_name, entity_id, new_values
    )
    VALUES (
        v_user_id,
        v_email,
        'LOGIN',
        'AUTH',
        'session',
        v_user_id::text,
        jsonb_build_object('source', 'supabase-auth', 'timestamp', now())
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_login_event() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_login_event() TO authenticated;

COMMENT ON FUNCTION public.log_login_event()
    IS 'Journalise une connexion reussie dans audit_logs pour auth.uid().';
