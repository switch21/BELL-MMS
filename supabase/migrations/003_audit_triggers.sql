-- BELL-MMS : Migration 003 - Triggers d'Audit Automatique
-- Enregistre automatiquement les créations, modifications et suppressions

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_action VARCHAR(50);
    v_user_id UUID;
    v_user_email VARCHAR(255);
BEGIN
    v_user_id := auth.uid();
    
    -- Récupérer l'email de l'utilisateur si disponible
    IF v_user_id IS NOT NULL THEN
        SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        v_action := 'CREATE';
        v_new_data := to_jsonb(NEW);
        
        INSERT INTO public.audit_logs (user_id, user_email, action, module, entity_name, entity_id, new_values)
        VALUES (v_user_id, v_user_email, v_action, TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.id::text, v_new_data);
        
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_action := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        
        INSERT INTO public.audit_logs (user_id, user_email, action, module, entity_name, entity_id, old_values, new_values)
        VALUES (v_user_id, v_user_email, v_action, TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.id::text, v_old_data, v_new_data);
        
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        v_action := 'DELETE';
        v_old_data := to_jsonb(OLD);
        
        INSERT INTO public.audit_logs (user_id, user_email, action, module, entity_name, entity_id, old_values)
        VALUES (v_user_id, v_user_email, v_action, TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.id::text, v_old_data);
        
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Activation du trigger sur la table profiles
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Activation du trigger sur la table app_settings
DROP TRIGGER IF EXISTS trg_audit_app_settings ON public.app_settings;
CREATE TRIGGER trg_audit_app_settings
AFTER UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
