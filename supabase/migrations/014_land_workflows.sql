CREATE POLICY "Création des domaines fonciers autorisée"
ON public.land_properties FOR INSERT TO authenticated
WITH CHECK (public.has_permission('land:write'));

CREATE OR REPLACE FUNCTION public.create_land_property(
    p_reference VARCHAR,
    p_designation VARCHAR,
    p_ownership_type VARCHAR,
    p_land_title_number VARCHAR,
    p_locality VARCHAR,
    p_total_area_sqm NUMERIC,
    p_purchase_price NUMERIC,
    p_latitude NUMERIC,
    p_longitude NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_land_id UUID;
    v_subdivision_id UUID;
    v_subdivision_reference VARCHAR;
BEGIN
    IF NOT public.has_permission('land:write') THEN
        RAISE EXCEPTION 'Permission refusée pour créer un domaine foncier.' USING ERRCODE = '42501';
    END IF;

    IF p_total_area_sqm <= 0 OR p_ownership_type NOT IN ('entreprise', 'tiers_mandat') THEN
        RAISE EXCEPTION 'Superficie ou nature de propriété invalide.';
    END IF;

    INSERT INTO public.land_properties (
        reference, designation, ownership_type, land_title_number, locality,
        total_area_sqm, purchase_price, latitude, longitude
    )
    VALUES (
        p_reference, p_designation, p_ownership_type, p_land_title_number,
        p_locality, p_total_area_sqm, p_purchase_price, p_latitude, p_longitude
    )
    RETURNING id INTO v_land_id;

    v_subdivision_reference :=
        'LOT-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-'
        || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8));

    INSERT INTO public.subdivisions (
        land_property_id, reference, name, total_area_sqm, status
    )
    VALUES (
        v_land_id, v_subdivision_reference, p_designation, p_total_area_sqm, 'en_cours'
    )
    RETURNING id INTO v_subdivision_id;

    INSERT INTO public.blocks (subdivision_id, name)
    VALUES (v_subdivision_id, 'Bloc A');

    RETURN v_land_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_land_plot(
    p_subdivision_id UUID,
    p_block_id UUID,
    p_plot_number VARCHAR,
    p_area_sqm NUMERIC,
    p_facade_m NUMERIC,
    p_depth_m NUMERIC,
    p_price_per_sqm NUMERIC,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.plots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plot public.plots%ROWTYPE;
BEGIN
    IF NOT public.has_permission('land:write') THEN
        RAISE EXCEPTION 'Permission refusée pour créer une parcelle.' USING ERRCODE = '42501';
    END IF;

    IF p_area_sqm <= 0 OR p_price_per_sqm < 0 OR NULLIF(BTRIM(p_plot_number), '') IS NULL THEN
        RAISE EXCEPTION 'Numéro, superficie ou prix de parcelle invalide.';
    END IF;

    IF p_block_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE id = p_block_id AND subdivision_id = p_subdivision_id
    ) THEN
        RAISE EXCEPTION 'Le bloc sélectionné ne correspond pas au lotissement.';
    END IF;

    INSERT INTO public.plots (
        subdivision_id, block_id, plot_number, area_sqm, facade_m, depth_m,
        price_per_sqm, status, latitude, longitude, notes
    )
    VALUES (
        p_subdivision_id, p_block_id, BTRIM(p_plot_number), p_area_sqm,
        p_facade_m, p_depth_m, p_price_per_sqm, 'disponible',
        p_latitude, p_longitude, p_notes
    )
    RETURNING * INTO v_plot;

    UPDATE public.subdivisions
    SET total_plots_count = total_plots_count + 1, updated_at = NOW()
    WHERE id = p_subdivision_id;

    RETURN v_plot;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_land_properties ON public.land_properties;
CREATE TRIGGER trg_audit_land_properties
AFTER INSERT OR UPDATE OR DELETE ON public.land_properties
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_subdivisions ON public.subdivisions;
CREATE TRIGGER trg_audit_subdivisions
AFTER INSERT OR UPDATE OR DELETE ON public.subdivisions
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_blocks ON public.blocks;
CREATE TRIGGER trg_audit_blocks
AFTER INSERT OR UPDATE OR DELETE ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

REVOKE ALL ON FUNCTION public.create_land_property(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_land_plot(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_land_property(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_land_plot(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
