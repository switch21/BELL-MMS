CREATE POLICY "Création des parcelles autorisée"
ON public.plots FOR INSERT TO authenticated
WITH CHECK (public.has_permission('land:write'));

CREATE OR REPLACE FUNCTION public.change_plot_status(
    p_plot_id UUID,
    p_new_status VARCHAR,
    p_reason TEXT
)
RETURNS public.plots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plot public.plots%ROWTYPE;
BEGIN
    IF NOT (
        public.has_permission('land:status:change')
        OR public.has_permission('land:write')
    ) THEN
        RAISE EXCEPTION 'Permission refusée pour modifier le statut de la parcelle.'
            USING ERRCODE = '42501';
    END IF;

    IF p_new_status NOT IN (
        'disponible', 'reservee', 'en_cours_de_vente',
        'vendue', 'bloquee', 'litige', 'indisponible'
    ) OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Statut ou motif de changement invalide.';
    END IF;

    SELECT * INTO v_plot
    FROM public.plots
    WHERE id = p_plot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcelle introuvable.';
    END IF;

    IF v_plot.status = 'vendue'
       AND p_new_status = 'disponible'
       AND public.get_auth_role() NOT IN ('directeur_general', 'super_admin') THEN
        RAISE EXCEPTION 'Seule la direction peut remettre une parcelle vendue à disposition.'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.plots
    SET status = p_new_status, updated_at = NOW()
    WHERE id = p_plot_id;

    INSERT INTO public.plot_status_history (
        plot_id, old_status, new_status, reason, changed_by
    )
    VALUES (p_plot_id, v_plot.status, p_new_status, BTRIM(p_reason), auth.uid());

    SELECT * INTO v_plot FROM public.plots WHERE id = p_plot_id;

    RETURN v_plot;
END;
$$;

REVOKE ALL ON FUNCTION public.change_plot_status(UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_plot_status(UUID, VARCHAR, TEXT) TO authenticated;
