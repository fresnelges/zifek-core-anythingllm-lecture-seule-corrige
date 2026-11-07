# Zifek Core — Skill AnythingLLM corrigé, lecture seule

Ce pack reprend la documentation originale Zifek Core v1.3.0 (181 outils documentés) mais **l’exécution de cette compétence est volontairement limitée à une liste explicite d’outils de consultation** (fichier `allowlist.json`). Les commandes qui écrivent, créent ou confirment une réservation, modifient un panier, paient, annulent ou accèdent aux médias privés sont refusées par `handler.js`.

## Corrections apportées au pack d'origine

- ZIP reconstruit en format valide (l'archive reçue signalait 544 octets manquants dans la table centrale).
- `plugin.json` avec `schema: skill-1.0.0`, `imported: true`, `entrypoint.file` / `entrypoint.params`, exemples valides.
- `handler.js` exporte `module.exports.runtime.handler` et fournit gestion d'erreurs et résultat de type string.
- Paramètres d’appel : `tool` (nom de l'outil), `params_json` (chaîne JSON sérialisée).
- Lecture du jeton depuis `ZIFEK_AGENT_TOKEN` dans l'environnement du processus ou depuis le paramètre d'interface `setup_args`.
- URL passerelle verrouillée et requêtes sans redirections ; pas de jeton envoyé ailleurs.
- Limite de résultat, prise en charge médias, ZCalendar, état du prix, pagination.
- Aucune commande d’écriture autorisée par ce skill, quelle que soit la permission du jeton. N'utiliser malgré tout qu'un jeton à droits de lecture.

## Installation dans le déploiement AnythingLLM existant

D'après la configuration du VPS srv2026381 et du répertoire `/opt/zifek-ai/storage`, créer :

`/opt/zifek-ai/storage/plugins/agent-skills/zifek-core`

Y copier `plugin.json`, `handler.js`, `allowlist.json`, et facultativement les autres fichiers de documentation.

Assurer la lecture des fichiers par l'utilisateur du conteneur (UID 1000 dans le déploiement existant), puis actualiser Settings → Agent Skills et activer « Zifek Core — Consultation ».

Dans l'interface du skill, configurer `ZIFEK_AGENT_TOKEN` avec un **jeton de lecture** fraîchement émis via Socle central → Écosystème IA. Ne jamais utiliser un jeton partagé entre clients et ne pas activer le skill avec un jeton d’écriture dans un workspace public.

Un redémarrage de Docker n'est normalement pas requis : AnythingLLM prend en charge le chargement à chaud des skills. Recharger la page et quitter le contexte d'agent actif (`/exit`) si nécessaire.

## Exemples

Entrée outil :

```json
{"tool":"search_zifek_resources","params_json":"{\"query\":\"artisanat\",\"city\":\"Fes\",\"resource_type\":\"product\",\"limit\":5}"}
```

Autre entrée :

```json
{"tool":"get_zifek_resource_media","params_json":"{\"resource_type\":\"accommodation\",\"resource_id\":35,\"limit\":10,\"offset\":0}"}
```

La passerelle est interrogée en POST à l'adresse déjà utilisée sur `helloreaddy.com` ; le skill renvoie une chaîne Markdown comprenant les éléments et médias réels accessibles.

## Limitations et vérifications

- La documentation `tools.json` mentionne 181 outils, mais **ils ne sont pas tous exposés par ce skill**. Voir `allowlist.json`.
- Ce skill ne représente pas les réservations confirmées ni les paiements. Il faut une liaison serveur-utilisateur, une confirmation backend et des droits propres à chaque client avant de les exposer.
- Les images Markdown peuvent s’afficher dans AnythingLLM si le moteur de rendu et les URLs le permettent. Les vidéos restent normalement des liens et miniatures ; le chat Zifek peut utiliser son lecteur dédié.
- Les URL de médias publics sont accessibles selon leur ACL ; ce skill n'inclut pas `get_zifek_private_media`.
- Les prix et disponibilités sont toujours des informations provenant d'un contrôle au moment de l'appel ; les afficher comme des informations à revalider avant une action.
