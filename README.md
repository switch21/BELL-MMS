# BELL-MMS — BELL MULTI-MANAGEMENT SYSTEM

> Application Intégrée de Gestion d'Entreprise de Droit Camerounais  
> Charte graphique : **C — Executive Green**  
> Devise opérationnelle : **XAF (FCFA)**

---

## 🚀 Démarrage Rapide

```bash
# 1. Installation des dépendances (déjà effectuée)
npm install

# 2. Lancement du serveur de développement
npm run dev

# 3. Compilation pour la production
npm run build
```

---

## 👥 Comptes de Démonstration & Rôles Préconfigurés

| Nom complet | Rôle | Email | Périmètre d'accès |
|---|---|---|---|
| **Paul BELL** | Directeur Général | `dg@bell-mms.cm` | Supervision générale, validations financières, ventes et trésorerie |
| **Chantal NGO** | Secrétaire | `secretaire@bell-mms.cm` | Accueil, fiches clients, courriers, préparation des dossiers |
| **Emmanuel FOTSO** | Collaborateur | `collaborateur@bell-mms.cm` | Opérations foncières, suivi des tâches, demandes de dépenses |
| **Administrateur** | Super Administrateur | `admin@bell-mms.cm` | Paramètres généraux, rôles/droits, audits et maintenance technique |

---

## 🗄️ Schéma PostgreSQL & Migrations Supabase

Les migrations doivent être appliquées dans l'ordre `001` à `013` depuis `supabase/migrations/`. Elles définissent les rôles et permissions, les règles RLS, l'audit, le foncier, les ventes, les prestations, la trésorerie, les workflows atomiques de vente/réservation et l'attribution du super-administrateur.

Pour activer Supabase, renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env`. Ne jamais utiliser une clé `service_role` dans le navigateur. Les comptes Supabase Auth et leurs profils/rôles doivent être provisionnés dans le projet Supabase.

La lecture et la création des clients/partenaires, les ventes/réservations/encaissements, les dossiers de financement et les paramètres utilisent Supabase lorsque ces variables sont configurées. Le foncier, les dossiers de prestations, la trésorerie, les utilisateurs et plusieurs journaux/rapports restent à raccorder. Sans configuration Supabase, l'application démarre en mode démonstration local.

La migration `013_assign_super_admin_pat_epee.sql` exige que `pat.epee@gmail.com` existe dans Supabase Auth et qu'un profil correspondant soit déjà présent. Créer et provisionner ce compte avant d'appliquer les migrations.
