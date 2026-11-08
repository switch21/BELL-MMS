DO $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
BEGIN
    SELECT id INTO v_user_id
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

    UPDATE public.profiles
    SET role_id = v_role_id,
        is_active = true,
        job_title = COALESCE(NULLIF(job_title, ''), 'Super Administrateur'),
        updated_at = NOW()
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Cannot assign super_admin: create a profile for pat.epee@gmail.com before applying this migration.';
    END IF;
END;
$$;
