-- Sonde LECTURE SEULE (aucune ecriture) : etat complet des parcelles TEST-, y compris l'id de
-- la parcelle que l'UI ne rend pas. A coller dans l'editeur SQL du dashboard.
-- Attendu apres « GO conversion » du 2026-11-15 : 2 lignes.
--   TEST-LOT-01 : statut vendue, vente VTE-2026-E3C80242 de 15 000 000 F, solde 8 000 000 F,
--                 recus 7 000 000 F (solde_vente = true), res_reference NULL, history_max = 1.
--   TEST-LOT-02 : statut vendue, vente VTE-2026-9E06C437 de type comptant, prix 12 800 000 F,
--                 solde 0 F, recus 12 800 000 F (solde_vente = true), vente_statut soldee,
--                 res_reference RES-2026-FD4F4831 en statut transformee_en_vente,
--                 res_selee_par_une_vente = true (la vente reference bien cette reservation),
--                 history_max = 2 et history_dernier = vendue.
-- Prix attendu : LOT-01 500 m2 x 30 000 = 15 000 000 ; LOT-02 400 m2 x 32 000 = 12 800 000 (prix_genere = true).
-- Colonnes de controle :
--   prix_genere   = total_price (colonne GENERATED) bien egal a area_sqm * price_per_sqm
--   solde_vente   = final_price - total des recus de la vente, doit egaler remaining_balance
--   history_max   = nombre de transitions d'etat enregistrees pour la parcelle
--   res_selee_par_une_vente = sales.reservation_id designe la derniere reservation de la parcelle
SELECT p.plot_number,
       p.id                                                        AS plot_id,
       b.name                                                      AS bloc,
       sdiv.name                                                   AS lotissement,
       p.area_sqm,
       p.facade_m,
       p.depth_m,
       p.price_per_sqm,
       p.total_price,
       (p.area_sqm * p.price_per_sqm = p.total_price)              AS prix_genere,
       p.status                                                    AS statut,
       res.reference                                               AS res_reference,
       res.status                                                  AS res_statut,
       res.expiration_date                                         AS res_expiration,
       res.deposit_amount                                          AS res_acompte,
       cl.last_name || ' ' || COALESCE(cl.first_name, '')          AS res_client,
       coalesce(vte.reservation_id = res.id, false)                AS res_selee_par_une_vente,
       vte.reference                                               AS vente_reference,
       vte.status                                                  AS vente_statut,
       vte.final_price                                             AS vente_prix,
       vte.remaining_balance                                       AS vente_solde,
       COALESCE(rec.total_recus, 0)                                AS vente_recus,
       (vte.final_price - COALESCE(rec.total_recus, 0) = vte.remaining_balance) AS solde_vente,
       (SELECT count(*) FROM public.plot_status_history h WHERE h.plot_id = p.id) AS history_max,
       (SELECT h2.new_status FROM public.plot_status_history h2
         WHERE h2.plot_id = p.id ORDER BY h2.changed_at DESC LIMIT 1)             AS history_dernier
FROM public.plots p
LEFT JOIN public.blocks b ON b.id = p.block_id
LEFT JOIN public.subdivisions sdiv ON sdiv.id = p.subdivision_id
LEFT JOIN LATERAL (
    SELECT r.id, r.reference, r.status, r.expiration_date, r.deposit_amount, r.client_id
    FROM public.reservations r
    WHERE r.plot_id = p.id
    ORDER BY r.created_at DESC
    LIMIT 1
) res ON TRUE
LEFT JOIN public.clients cl ON cl.id = res.client_id
LEFT JOIN LATERAL (
    SELECT sa.id, sa.reference, sa.status, sa.final_price, sa.remaining_balance, sa.reservation_id
    FROM public.sales sa
    WHERE sa.plot_id = p.id
    ORDER BY sa.created_at DESC
    LIMIT 1
) vte ON TRUE
LEFT JOIN (
    SELECT re.sale_id AS sale_id, SUM(re.amount) AS total_recus
    FROM public.receipts re
    GROUP BY re.sale_id
) rec ON rec.sale_id = vte.id
WHERE p.plot_number LIKE 'TEST-%'
ORDER BY p.plot_number;
