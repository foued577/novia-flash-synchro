# AI Company — architecture et exploitation

Une organisation de sept agents IA (Claude) qui pilote, maintient et fait évoluer NOVIA Flash Synchro, sous la supervision des administrateurs.

| Agent | Nom | Rôle | Rend compte à |
|---|---|---|---|
| CEO | Claire | Supervise, répartit les missions, arbitre, rapport quotidien | Direction (humain) |
| CTO | Hugo | Architecture, maintenance, évolutions, déploiement | CEO |
| RSSI | Inès | Audits de sécurité, RLS, comptes, données | CEO |
| Business Analyst | Lucas | Besoins → missions avec critères d’acceptation | CEO |
| QA Engineer | Sarah | Tests, contrôles de cohérence, validation des corrections | CTO |
| Support Manager | Nadia | Demandes utilisateurs, incidents, réponses | CEO |
| Data Analyst | Yanis | Indicateurs, usage, tendances | CEO |

Identité, compétences, objectifs, outils autorisés et mémoire de travail de chaque agent sont stockés dans `ai_agents` et modifiables depuis l’application (AI Company → Organigramme et Paramètres IA).

## Architecture

```
Navigateur (React)                       Supabase
────────────────────                     ───────────────────────────────────────────
/ai-company  ── lecture + temps réel ──▶ tables ai_* (RLS : administrateurs)
             ── invoke ──────────────▶   Edge Function ai-company (orchestrateur)
                                              │  service_role, côté serveur uniquement
                                              ├─▶ API Claude (ANTHROPIC_API_KEY)
                                              ├─▶ outils = requêtes ciblées + fonctions ai_*()
                                              └─▶ écrit missions, messages, décisions, journal
Tous les utilisateurs ── « Aide et demandes » ─▶ support_requests (chacun voit les siennes)
```

**Orchestrateur** (`supabase/functions/ai-company`) :
- `chat` : la CEO répond à la direction et découpe les demandes en missions assignées ; si des missions sont créées, un cycle démarre aussitôt.
- `run_cycle` : chaque agent actif prend sa mission prête la plus prioritaire (dépendances terminées) et ses messages non lus ; **tous les agents travaillent en parallèle**. Jusqu’à 4 tours s’enchaînent tant qu’il reste du travail et du temps (limite d’exécution Supabase).
- `daily_report` : la CEO rédige le rapport quotidien.
- `decide` : validation ou refus humain d’une décision ; si une action est attachée, elle est exécutée à ce moment-là.

**Boucle d’un agent** : prompt système (identité, organisation, règles, mode d’autonomie, mémoire) → appel au modèle avec ses seuls outils autorisés → exécution des outils (en parallèle) → résultat renvoyé au modèle → … jusqu’à la fin du tour ou la limite d’étapes. Chaque appel et chaque outil est journalisé (`ai_activity`, jetons et durée compris).

**Communication** : les agents délèguent par `create_mission` (avec `depends_on` pour enchaîner) et s’écrivent par `send_message` ; les messages sont traités au tour suivant. Chaque mission garde son historique (`ai_mission_events`).

## Données

| Table | Contenu |
|---|---|
| `ai_settings` | activation, modèle, autonomie, budget quotidien de jetons, étapes max |
| `ai_agents` | identité, compétences, objectifs, outils, mémoire, état |
| `ai_missions` / `ai_mission_events` | missions (statut, priorité, responsable, dépendances, résultat) et historique |
| `ai_messages` | chat avec la CEO et messagerie entre agents |
| `ai_decisions` | décisions consignées et actions à valider (risque, paramètres, résultat) |
| `ai_activity`, `ai_runs` | journal détaillé et cycles d’exécution |
| `ai_reports` | rapports quotidiens, audits, analyses |
| `support_requests` | demandes des utilisateurs |

## Sécurité

- **Clé API** : `ANTHROPIC_API_KEY` est un secret Supabase lu uniquement par la fonction ; elle n’est jamais envoyée au navigateur.
- **Accès** : toutes les tables `ai_*` sont réservées aux administrateurs (RLS) ; la fonction vérifie que l’appelant est administrateur.
- **Pas de SQL libre, pas de code** : les agents n’ont que des outils déterminés. Les analyses passent par `ai_security_audit()`, `ai_health_checks()`, `ai_database_overview()`, `ai_usage_stats()` (lecture seule, exécutables par le seul rôle serveur). Les évolutions de code sont décrites dans des missions ou décisions et appliquées par un humain.
- **Liste blanche par agent** (`ai_agents.tools`), vérifiée côté serveur à chaque appel ; les actions sur l’application sont en plus limitées par rôle d’agent.
- **Actions et autonomie** :

  | Action | Risque | Agents |
  |---|---|---|
  | `ensure_meeting` — créer la réunion d’une semaine | faible | CEO, CTO |
  | `set_support_request_status` | faible | Support, CEO |
  | `answer_support_request` — réponse visible par l’utilisateur | moyen | Support, CEO |
  | `update_service_duration` | élevé | CEO, CTO |
  | `update_meeting_settings` | élevé | CEO, CTO |
  | `update_user_role` | élevé | CEO, RSSI |

  *Observation* : aucune action. *Supervisé* (défaut) : toute action attend une validation. *Autonome encadré* : risques faible et moyen exécutés directement, risque élevé toujours validé.
- **Injection de consignes** : les contenus saisis par les utilisateurs sont balisés comme données ; les agents ont pour règle de ne jamais suivre d’instructions qu’ils contiendraient, et ne disposent de toute façon d’aucun outil dangereux.
- **Garde-fous de coût** : budget quotidien de jetons, nombre d’étapes par tâche, 6 missions créées au plus par exécution, 3 tentatives par mission, un seul cycle à la fois.

## Mise en service

1. Créer une clé sur https://console.anthropic.com (facturation à l’usage).
2. Supabase → Edge Functions → Secrets : ajouter `ANTHROPIC_API_KEY`.
3. Dans l’application : AI Company → Chat avec la CEO, ou « Lancer un cycle ».

Déploiement de la fonction : `supabase functions deploy ai-company --no-verify-jwt` (elle authentifie elle-même l’appelant).

## Travail planifié (facultatif)

Pour que l’organisation travaille sans page ouverte :

1. Secret Supabase `AI_CRON_SECRET` = une longue valeur aléatoire ; la même valeur dans le Vault : `select vault.create_secret('<valeur>', 'ai_cron_secret');`
2. Activer les extensions `pg_cron` et `pg_net`, puis :

```sql
select cron.schedule('ai-company-cycle', '5 7-19 * * 1-5', $$
  select net.http_post(
    url := 'https://<ref-projet>.supabase.co/functions/v1/ai-company',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-ai-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ai_cron_secret')),
    body := '{"action":"run_cycle"}'::jsonb)
$$);

select cron.schedule('ai-company-report', '0 17 * * 1-5', $$
  select net.http_post(
    url := 'https://<ref-projet>.supabase.co/functions/v1/ai-company',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-ai-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ai_cron_secret')),
    body := '{"action":"daily_report"}'::jsonb)
$$);
```

Les horaires `cron` sont en UTC. Une tâche planifiée ne peut que lancer un cycle ou un rapport : le chat et les validations restent réservés aux administrateurs.

## Étendre l’organisation

- **Nouvel outil** : l’ajouter dans `tools.ts` (`TOOLS`), puis l’autoriser aux agents concernés (Paramètres IA).
- **Nouvelle action** : l’ajouter dans `ACTIONS` avec son niveau de risque et les agents autorisés ; elle hérite automatiquement du circuit de validation.
- **Nouvel agent** : insérer une ligne dans `ai_agents` (identifiant, rôle, compétences, objectifs, outils, `reports_to`) et ajouter son identifiant aux listes `enum` de `create_mission` et `send_message`.
- **Accès au code (piste)** : un outil `create_github_issue` (jeton GitHub limité au dépôt, secret Supabase) permettrait au CTO de transformer ses propositions en tickets ; l’écriture directe dans le code est volontairement exclue.
