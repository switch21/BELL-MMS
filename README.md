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

Les scripts SQL prêts à être appliqués sont situés dans `supabase/migrations/` :
- `001_initial_schema.sql` : Rôles, permissions, profils utilisateurs, audit_logs et app_settings.
- `002_security_rls.sql` : Politiques Row Level Security (RLS) et fonctions d'autorisation `has_permission()`.
- `003_audit_triggers.sql` : Trigger d'audit automatique `audit_trigger_func()` pour l'enregistrement immuable des modifications.
