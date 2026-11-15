-- Certification en base du flux vente joue le 2026-11-15 (LECTURE SEULE, un seul jeu de resultats)
-- Pourquoi : l interface affiche 15 M / 7 M / 8 M, mais ce sont des calculateurs du client.
-- Ce que 020 et 021 sont censes prouver, c est l etat DES TABLES apres create_sale
-- (15 M, acompte 3 M, 3 echeances de 4 M) puis collect_sale_payment (4 M encaisses sur la 1ere).
-- Une seule rangee rendue : les echeances et les recus sont agreges en texte pour eviter
-- un deuxieme jeu de resultats que l editeur du dashboard n affiche pas toujours.
-- Aucun objet ecrit : SELECT sur sales, plots, payment_schedules, receipts, plot_status_history.

WITH ma_vente AS (
    SELECT s.id, s.reference, s.sale_type, s.status AS statut_vente, s.total_price,
           s.discount_amount, s.final_price, s.initial_deposit, s.remaining_balance,
           s.sale_date, s.payment_method, s.reservation_id,
           p.plot_number, p.status AS statut_parcelle, p.id AS plot_id
    FROM public.sales s
    JOIN public.plots p ON p.id = s.plot_id
    WHERE p.plot_number LIKE 'TEST-%'
    ORDER BY s.created_at DESC
    LIMIT 1
),
ech AS (
    SELECT string_agg(
               ps.installment_number::TEXT || ': du ' || ps.due_amount::TEXT
                   || ' / paye ' || ps.paid_amount::TEXT
                   || ' = ' || ps.status
                   || ' (' || to_char(ps.due_date, 'DD/MM/YYYY') || ')',
               '  ||  ' ORDER BY ps.installment_number) AS detail,
           count(*)                     AS nb_echeances,
           sum(ps.due_amount)           AS total_du,
           sum(ps.paid_amount)          AS total_paye_echeances,
           count(*) FILTER (WHERE ps.status = 'paye')    AS nb_payees,
           count(*) FILTER (WHERE ps.status = 'en_attente') AS nb_en_attente
    FROM public.payment_schedules ps, ma_vente v
    WHERE ps.sale_id = v.id
),
rec AS (
    SELECT string_agg(r.reference || ' = ' || r.amount::TEXT || ' (' || r.payment_method
                          || ', ' || to_char(r.payment_date, 'DD/MM/YYYY') || ')',
                      '  ||  ' ORDER BY r.payment_date, r.reference) AS detail,
           count(*)          AS nb_recus,
           sum(r.amount)     AS total_recus
    FROM public.receipts r, ma_vente v
    WHERE r.sale_id = v.id
),
hist AS (
    SELECT string_agg(h.old_status || '->' || h.new_status, ' , ' ORDER BY h.changed_at) AS detail,
           count(*) AS nb_lignes
    FROM public.plot_status_history h, ma_vente v
    WHERE h.plot_id = v.plot_id
)
SELECT v.plot_number,
       v.statut_parcelle,
       v.reference                AS vente,
       v.sale_date,
       v.sale_type,
       v.statut_vente,
       v.total_price,
       v.discount_amount,
       v.final_price,
       v.initial_deposit,
       v.remaining_balance,
       v.reservation_id,
       e.nb_echeances,
       e.total_du,
       e.total_paye_echeances,
       e.nb_payees,
       e.nb_en_attente,
       r.nb_recus,
       r.total_recus,
       -- trois invariants, attendus a 0 chacun
       (r.total_recus + v.remaining_balance) - v.final_price                       AS equilibre_recus,
       e.total_du - (v.final_price - v.initial_deposit)                            AS equilibre_echeancier,
       (e.total_paye_echeances - (r.total_recus - v.initial_deposit))              AS equilibre_encaisse,
       h.nb_lignes  AS nb_historique_parcelle,
       e.detail     AS echeances,
       r.detail     AS recus,
       h.detail     AS historique
FROM ma_vente v, ech e, rec r, hist h;

-- Lecture attendue si le flux est conforme :
--   statut_parcelle = vendue, sale_type = echelonne, statut_vente = en_cours
--   total_price = final_price = 15000000, discount_amount = 0,
--   initial_deposit = 3000000, remaining_balance = 8000000
--   reservation_id = NULL (le client n envoie jamais d identifiant de reservation)
--   nb_echeances = 3, total_du = 12000000, total_paye_echeances = 4000000,
--   nb_payees = 1, nb_en_attente = 2
--   nb_recus = 2, total_recus = 7000000 (1er = acompte de vente, 2e = encaissement VIR-TEST-0001)
--   equilibre_recus = 0        (recus + solde = prix du contrat)
--   equilibre_echeancier = 0   (somme des echeances = prix - acompte)
--   equilibre_encaisse = 0     (decaisse sur les echeances = recus hors acompte initial)
--   nb_historique_parcelle >= 1 (l UPDATE de plots s accompagne d une ligne plot_status_history)
