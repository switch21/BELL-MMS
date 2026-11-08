DO $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
    v_email TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    SELECT id, email,
           NULLIF(BTRIM(raw_user_meta_data ->> 'first_name'), ''),
           NULLIF(BTRIM(raw_user_meta_data ->> 'last_name'), '')
    INTO v_user_id, v_email, v_first_name, v_last_name
    FROM auth.users
    WHERE LOWER(email) = LOWER('pat.epee@gmail.com');

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION
            'Cannot assign super_admin: create the Supabase Auth account for pat.epee@gmail.com before applying this migration.';
    END IF;

    SELECT id INTO v_role_id
    FROM public.roles
    WHERE code = 'super_admin';

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION
            'Cannot assign super_admin: the system role has not been seeded.';
    END IF;

    v_first_name := COALESCE(
        v_first_name,
        INITCAP(SPLIT_PART(SPLIT_PART(v_email, '@', 1), '.', 1))
    );
    v_last_name := COALESCE(
        v_last_name,
        INITCAP(SPLIT_PART(SPLIT_PART(v_email, '@', 1), '.', 2))
    );

    INSERT INTO public.profiles (id, first_name, last_name, role_id, job_title, is_active)
    VALUES (v_user_id, v_first_name, v_last_name, v_role_id, 'Super Administrateur', true)
    ON CONFLICT (id) DO UPDATE
    SET role_id = EXCLUDED.role_id,
        is_active = true,
        job_title = COALESCE(NULLIF(public.profiles.job_title, ''), EXCLUDED.job_title),
        updated_at = NOW();
END;
$$;
