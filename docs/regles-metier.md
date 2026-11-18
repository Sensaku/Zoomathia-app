# Règles métier

> Référentiel des règles fonctionnelles de l'application Zoomathia. Chaque règle a un identifiant stable (`RM-XXX-nn`) à citer dans le code, les tests et les PR.
> Ouvert lors de la séance de cadrage du 2026-11-15.

## Statut des règles

| Statut | Signification | Ce qu'un agent peut faire |
|---|---|---|
| **Décidé** | Validé par le responsable du projet. | Implémenter. |
| **Proposé** | Valeur par défaut raisonnable, pas encore validée. | Implémenter seulement si la tâche l'exige, en le signalant dans la PR. |
| **À trancher** | Question ouverte. | Ne pas implémenter : poser la question. |

Une règle modifiée est mise à jour ici dans la même PR que le code.

---

## 1. Accès, comptes et rôles

### Rôles

| Rôle | Qui | Obtention |
|---|---|---|
| **Visiteur** | Toute personne, sans compte. | — |
| **Contributeur** | Personne inscrite dont le compte a été activé. | Inscription puis activation par un administrateur (RM-CPT-02). |
| **Administrateur** | Responsables de la plateforme. | Désigné par un administrateur existant. |
| **Compte de service** | Agent IA ou pipeline d'annotation automatique. | Créé par un administrateur (RM-MOD-04). |

### Matrice des permissions

| Action | Visiteur | Contributeur | Administrateur | Compte de service |
|---|:-:|:-:|:-:|:-:|
| Consulter le corpus, les annotations validées, le thésaurus, les QC | ✔ | ✔ | ✔ | ✔ |
| Rechercher, exporter, exécuter des requêtes SPARQL en lecture | ✔ | ✔ | ✔ | ✔ |
| Soumettre un texte via le formulaire sans compte | ✔ | ✔ | ✔ | ✘ |
| Créer une annotation, proposer un terme | ✘ | ✔ | ✔ | ✔ (suggestion) |
| Relire (valider, rejeter) la contribution d'autrui | ✘ | ✔ | ✔ | ✘ |
| Relire sa propre contribution | ✘ | ✘ | ✘ | ✘ |
| Activer, désactiver un compte, attribuer un rôle | ✘ | ✘ | ✔ | ✘ |
| Examiner et importer un texte soumis | ✘ | ✘ | ✔ | ✘ |
| Créer ou modifier une question de compétence native | ✘ | propose (RM-QC-02) | ✔ | ✘ |
| Modifier ou supprimer sa contribution encore en attente (RM-CTB-05) | ✘ | ✔ | ✔ | ✔ |
| Supprimer la contribution **en attente ou rejetée** d'une autre personne, modération (RM-MOD-05) | ✘ | ✘ | ✔ | ✘ |
| Modifier ou supprimer une contribution historique sans compte auteur (RM-CTB-06) | ✘ | ✘ | ✔ | ✘ |
| Retirer une contribution validée, avec motif (RM-PUB-04) | ✘ | la sienne | ✔ | ✘ |
| Modifier une contribution validée | ✘ | ✘ | ✘ | ✘ |
| Supprimer une contribution validée | ✘ | ✘ | ✘ | ✘ |
| Enregistrer une requête SPARQL (RM-QC-06) | ✘ | ✔ | ✔ | — |
| Modifier ou supprimer une requête enregistrée | ✘ | la sienne | toute requête personnelle | — |
| Consulter, exécuter, exporter les requêtes enregistrées | ✔ | ✔ | ✔ | ✔ |

*Notes sur la matrice (décidé le 2026-11-16) :*

- Un administrateur suit la règle de l'auteur pour **sa propre** contribution : modifiable et supprimable tant qu'elle est en attente, jamais ensuite. La modération (RM-MOD-05) ne vise que les contributions d'autrui.
- Une contribution validée ne se supprime jamais : elle se retire (RM-PUB-04, chantier ultérieur).
- Une contribution historique (RM-CTB-06) n'a pas de compte auteur : seul un administrateur la modifie (tant qu'elle est en attente) ou la supprime (en attente ou rejetée) ; tout compte actif peut relire une historique en attente, puisque son auteur est inconnu (décidé le 2026-11-17).
- Une requête personnelle enregistrée avant les comptes n'a pas de compte auteur : seul un administrateur la modifie ou la supprime.
- Une question de compétence native est en lecture seule pour tous, administrateurs compris, tant que RM-QC-01 n'est pas mise en œuvre (voir RM-QC-02).
- Un compte de service n'a pas de règle pour les requêtes enregistrées (« — ») : à décider avec le chantier de pré-annotation.

### Règles

**RM-ACC-01 — Lecture ouverte.** *Décidé.*
Toute consultation est accessible sans compte : corpus, annotations validées, thésaurus, questions de compétence, recherche, exports et playground SPARQL en lecture.

**RM-ACC-02 — Pas de quota, mais pas de déni de service.** *Décidé (principe) ; seuils proposés.*
Aucun quota d'usage n'est imposé aux utilisateurs. Le service se protège en revanche contre les requêtes trop lourdes et les abus, avec un timeout, un nombre maximal de résultats, une taille de réponse maximale, une limite de requêtes concurrentes et le blocage des clients abusifs. Les seuils sont choisis pour qu'un usage normal ne les atteigne jamais ; ils sont détaillés dans [security.md](security.md).

**RM-ACC-03 — Contributions en attente visibles sur demande.** *Décidé.*
Les contributions non encore relues (annotations, propositions de termes, suggestions des agents IA) sont visibles par tous, mais masquées par défaut. Elles s'affichent quand l'utilisateur active le filtre « contributions en attente », avec un marquage « non relu » explicite.

**RM-ACC-04 — Contributions rejetées et motif publics.** *Décidé (2026-11-16).*
Les contributions rejetées restent consultables par tous, avec leur motif de rejet : les listes se filtrent par statut, rejets compris. Elles n'apparaissent jamais dans la lecture du corpus (le lecteur n'affiche que les annotations validées, et les annotations en attente sur demande, RM-ACC-03).

**RM-CPT-01 — Comptes locaux.** *Décidé.*
L'authentification repose sur des comptes gérés par l'application (email et mot de passe). Les exigences de sécurité associées (hachage, vérification de l'email, réinitialisation, protection contre la force brute) sont dans [security.md](security.md).

**RM-CPT-02 — Activation par un administrateur.** *Décidé.*
L'inscription crée un compte **en attente**. Un administrateur l'active après vérification de l'email et de l'identité déclarée (nom, affiliation). Un compte en attente ne peut rien écrire.
*Mécanisme (décidé le 2026-11-15) :* tant qu'aucun serveur SMTP n'est disponible, l'administrateur vérifie lui-même l'adresse et l'identité, active le compte et réinitialise les mots de passe.
*Premier administrateur (décidé le 2026-11-16) :* il est créé par une commande serveur (`python -m app.accounts.cli create-admin`), le mot de passe étant saisi à l'invite, jamais dans l'environnement, la ligne de commande ni les journaux. Les administrateurs suivants sont désignés par un administrateur existant.

**RM-CPT-03 — Désactivation.** *Proposé.*
Un administrateur peut désactiver un compte. Ses contributions restent publiées et attribuées.
La désactivation révoque aussitôt les sessions du compte et ses jetons de réinitialisation inutilisés ; un administrateur ne peut pas désactiver son propre compte (un autre administrateur doit le faire), et la désactivation ou la rétrogradation d'un administrateur actif n'aboutit que si un autre administrateur actif subsiste (vérifié dans la requête elle-même, y compris si deux administrateurs agissent l'un sur l'autre au même instant), pour qu'il en reste toujours un.

**RM-CPT-04 — Suppression d'une inscription non activée.** *Proposé.*
Un administrateur peut supprimer un compte **en attente** qui n'a jamais été activé (inscription refusée ou indésirable) : les données personnelles inutiles ne sont pas conservées. Un compte activé un jour ne se supprime pas, il se désactive (RM-CPT-03) ; un administrateur ne peut pas supprimer son propre compte.

**RM-CPT-05 — Identité publique d'un contributeur.** *Décidé (2026-11-16).*
L'identité publique d'un contributeur, comme auteur ou comme relecteur, est le **nom affiché et l'affiliation** de son compte. L'adresse email n'est jamais publique : elle ne figure dans aucune réponse de l'API, ni dans aucun export RDF ou JSON accessible aux visiteurs.

**RM-CTB-01 — Toute contribution exige un compte actif.** *Décidé.*
Créer une annotation ou proposer un terme nécessite un compte contributeur actif. Seule exception : le formulaire de soumission de texte (RM-CTB-02).

**RM-CTB-02 — Formulaire de soumission de texte sans compte.** *Décidé.*
Une personne sans compte peut proposer un texte (fichier TEI-XML ou référence bibliographique) en indiquant obligatoirement son nom, son email et son affiliation. Un administrateur examine chaque soumission avant tout import ; rien n'est publié automatiquement.
*Proposé :* protection anti-spam compatible avec l'accessibilité (champ piège, limitation de débit, confirmation de l'email), sans CAPTCHA visuel.

**RM-CTB-03 — Auteur fixé par le serveur.** *Décidé (2026-11-16).*
L'auteur d'une contribution est le compte connecté, jamais un champ libre envoyé par le client : un nom ou un identifiant d'auteur envoyé par le client est ignoré.

**RM-CTB-04 — Statut initial fixé par le serveur.** *Décidé (2026-11-16).*
Une contribution est toujours créée « en attente de relecture » (`pending`), quel que soit le statut que le client envoie.

**RM-CTB-05 — Contribution en attente modifiable par son auteur.** *Décidé (2026-11-16).*
Tant qu'elle n'est pas relue, l'auteur peut modifier ou supprimer sa contribution. Une fois relue, seule la règle de retrait s'applique (RM-PUB-04).
*Modification d'une annotation :* le concept (IRI, libellé, type) et la justification seulement. Le passage annoté (paragraphe, texte, positions, portée) est fixé : pour le changer, l'auteur supprime l'annotation et en crée une autre.
*Modification d'une proposition de terme :* tous les champs.
*Technique (décidé le 2026-11-17) :* chaque modification et chaque relecture incrémente un numéro de version que le client renvoie ; un conflit de version donne une erreur 409, pour qu'un relecteur ne valide pas un contenu que l'auteur vient de modifier.

**RM-CTB-06 — Contributions historiques.** *Décidé (2026-11-16).*
Les contributions enregistrées avant l'existence des comptes gardent le nom libre de leur auteur comme **auteur historique**, sans compte, et gardent leur statut. Seul un administrateur les modifie ou les supprime, dans les limites de RM-CTB-05 (modification : en attente seulement) et de RM-MOD-05 (suppression : en attente ou rejetée).
*Technique (décidé le 2026-11-17) :* l'auteur d'une contribution historique en attente étant inconnu, tout compte actif peut la relire.

**RM-MOD-01 — Relecture par les pairs.** *Décidé.*
Tout contributeur actif peut valider ou rejeter la contribution d'un autre contributeur, jamais la sienne. Cette règle s'applique aussi aux administrateurs.

**RM-MOD-02 — Une seule relecture.** *Décidé.*
Une validation par un pair suffit à publier une annotation ou une proposition de terme.

**RM-MOD-03 — Traçabilité de la relecture.** *Décidé (2026-11-16).*
Le relecteur et la date de relecture sont enregistrés. Un rejet exige un motif (non vide, 2 000 caractères au plus) ; une validation n'en comporte pas.

**RM-MOD-05 — Modération par un administrateur.** *Décidé (2026-11-16).*
Un administrateur peut supprimer la contribution **en attente ou rejetée** d'une autre personne (contribution historique comprise). Une contribution validée n'est jamais supprimée : elle sera retirée (RM-PUB-04). Les suppressions de modération sont journalisées (identifiants seulement, ni nom ni email).

**RM-MOD-06 — Une relecture est définitive.** *Décidé (2026-11-16).*
Une contribution validée ne peut ensuite être que retirée (RM-PUB-04). Une contribution rejetée reste dans l'historique : son auteur en crée une nouvelle. Il n'y a ni réouverture ni autre changement de statut.

**RM-MOD-04 — Contributions automatiques.** *Décidé.*
Chaque agent IA ou pipeline dispose d'un compte de service avec un jeton d'API. Ses annotations portent leur provenance (outil, version, score de confiance) et restent des **suggestions** jusqu'à la relecture d'un contributeur humain. Un compte de service ne relit jamais.
*Décidé (2026-11-16) :* la mise en œuvre des comptes de service est reportée au chantier de pré-annotation. Jusqu'alors, l'application n'a que deux rôles, `contributor` et `admin`.

### Cycle de vie d'une contribution

```text
                 relecture par un pair (≠ auteur)
  en attente  ───────────────────────────────▶  validée
      │
      └─────────────────────────────────────▶  rejetée (avec motif)

  suggestion (compte de service) ── relecture humaine ──▶ validée | rejetée
```

Une contribution validée peut ensuite être **retirée** (RM-PUB-04) : elle quitte le graphe, son historique reste consultable.

*Décidé (2026-11-16, technique) :* les statuts sont stockés sous forme de codes et traduits dans l'interface. Les codes `pending`, `validated` et `rejected` sont en service ; `suggested` et `retracted` arrivent avec leurs fonctionnalités (pré-annotation, RM-PUB-04). La migration des anciens libellés français (« En attente de validation », « En attente de révision », « Validé », « Rejeté ») est faite côté serveur ; depuis P0-5a, l'interface reçoit les codes et les affiche par des libellés traduits.

---

## 2. Annotations

### Contenu

**RM-ANN-01 — Positions dans le texte.** *Proposé (technique).*
Les positions suivent le `TextPositionSelector` du W3C : positions en caractères (points de code Unicode), début inclus, fin exclue, mesurées sur le texte exact du paragraphe tel qu'il est stocké dans le graphe. Le client calcule les positions à partir de la sélection réelle, jamais en recherchant le texte sélectionné dans le paragraphe.

**RM-ANN-02 — Granularités.** *Proposé (comportement actuel).*
Mot, suite de mots, phrase, paragraphe, plusieurs paragraphes.

**RM-ANN-03 — Annotation sur plusieurs paragraphes.** *Proposé.*
Le début se mesure dans le premier paragraphe, la fin dans le dernier, et l'annotation liste tous les paragraphes couverts.

**RM-ANN-04 — Concept annoté.** *Proposé.*
Le corps d'une annotation est l'URI d'un concept existant de TheZoo. Si le concept n'existe pas, le contributeur propose d'abord le terme (section 3).

*Décidé (2026-11-16) :* à la création, le serveur vérifie que le concept est une IRI de TheZoo (`https://opentheso.huma-num.fr/?idc=…&idt=th310`), ou l'IRI qu'il a attribuée à un terme proposé dans l'application (`http://zoomathia.i3s.unice.fr/concept/proposal/<n>`) en attendant son intégration dans TheZoo, et que les paragraphes appartiennent à l'espace de noms du corpus (`http://ns.inria.fr/zoomathia/`), sans vérifier leur existence.

**RM-ANN-05 — Justification.** *Proposé (comportement actuel).*
La justification philologique est facultative.

### Publication

**RM-PUB-01 — Une annotation validée est publiée dans le graphe de référence.** *Décidé.*
Dès sa validation, l'annotation est convertie en RDF selon le modèle W3C Web Annotation et écrite automatiquement dans le triplestore Corese, dans un graphe nommé réservé aux contributions. Elle devient interrogeable en SPARQL comme les annotations historiques.

**RM-PUB-02 — Provenance publiée.** *Proposé.*
Le RDF publié contient l'auteur, le relecteur, les dates de création et de validation et, pour une annotation automatique, l'outil, sa version et le score de confiance.

**RM-PUB-03 — Publication idempotente.** *Proposé.*
Chaque annotation reçoit une URI stable à sa création. La republier ne crée pas de doublon. Un retrait (RM-PUB-04) la supprime du graphe des contributions.

**RM-PUB-04 — Retrait plutôt que modification.** *Décidé.*
Une annotation publiée n'est jamais modifiée. Pour la corriger, son auteur ou un administrateur la retire, avec un motif obligatoire, puis crée une nouvelle annotation. L'annotation retirée quitte le graphe des contributions ; son historique (auteur, relecteur, dates, motif du retrait) reste consultable dans l'application.
*Proposé :* la nouvelle annotation référence celle qu'elle remplace.

---

## 3. Thésaurus TheZoo

**RM-THE-01 — TheZoo reste la référence.** *Décidé.*
Le thésaurus de référence est TheZoo (`th310`) sur OpenTheso (Huma-Num). L'application ne le modifie jamais directement.

**RM-THE-02 — Intégration manuelle des propositions validées.** *Décidé.*
Une proposition validée est exportée en SKOS ; l'administrateur du thésaurus la saisit ou l'importe dans OpenTheso.

**RM-THE-03 — Suivi de l'intégration.** *Proposé.*
Une proposition saisie dans OpenTheso passe au statut `integrated` et enregistre l'URI du concept créé.

**RM-THE-04 — Anti-doublon.** *Proposé (comportement actuel, étendu).*
Une proposition identique (même libellé préférentiel, même langue) déjà en attente est refusée. Avant soumission, l'interface signale les concepts proches qui existent déjà dans TheZoo.

**RM-THE-05 — Langues des libellés.** *Proposé.*
Codes ISO 639 : `fr`, `en`, `la` (latin), `grc` (grec ancien). Liste extensible par un administrateur.

**RM-THE-06 — Copie de TheZoo dans Corese.** *Proposé.*
Corese contient une copie SKOS de TheZoo utilisée par les requêtes. Un administrateur la recharge depuis OpenTheso après chaque intégration de propositions, et au moins périodiquement.

---

## 4. Questions de compétence

**RM-QC-01 — Source unique en base de données.** *Décidé.*
Les questions de compétence natives sont stockées dans la base applicative, seule source de vérité. Les requêtes de `data/queries/*.rq` y sont migrées une fois ; ces fichiers et `app/core/qcs_data.py` sont ensuite supprimés.

**RM-QC-02 — Édition par les administrateurs, propositions par les contributeurs.** *Décidé.*
Un administrateur modifie une QC directement. Un contributeur peut proposer une modification, appliquée après validation par un administrateur. La relecture par les pairs ne s'applique pas aux QC.
*Technique (décidé le 2026-11-17) :* tant que RM-QC-01 n'est pas mise en œuvre, les questions natives existent en trois copies (`app/core/qcs_data.py`, `data/queries/*.rq`, base de données) : l'édition par un administrateur attend la source unique. D'ici là, toute modification ou suppression d'une QC native répond 403 (`builtin_query`) à tout le monde, administrateurs compris.

**RM-QC-03 — Historique des versions.** *Proposé.*
Chaque modification conserve la version précédente (auteur, date, contenu), qui peut être restaurée.

**RM-QC-04 — Création.** *Proposé.*
Même circuit que RM-QC-02 : un administrateur crée une QC native, un contributeur peut en proposer une.

**RM-QC-05 — Garde-fous.** *Proposé.*
Toute QC, native ou proposée, est une requête SELECT ou ASK qui respecte les garde-fous de RM-ACC-02.

**RM-QC-06 — Requêtes personnelles.** *Décidé (2026-11-16).*
Enregistrer une requête SPARQL exige un compte actif. Une requête enregistrée par un contributeur lui appartient (l'auteur est le compte connecté, jamais un champ du client) ; elle est visible par tous en lecture, exécutable et exportable par tous, modifiable et supprimable par son auteur ou un administrateur. Une requête enregistrée avant les comptes n'a pas de compte auteur : seul un administrateur la modifie ou la supprime. Son auteur est public (RM-CPT-05).
*À trancher avec le chantier de pré-annotation (2026-11-17) :* un compte de service peut-il enregistrer des requêtes ? Rien n'est à mettre en œuvre d'ici là : les comptes de service n'existent pas encore (RM-MOD-04).

---

## 5. Catégories de concepts

**RM-CON-01 — Catégorie issue des collections de TheZoo.** *Décidé.*
La catégorie d'un concept (animal, comportement, anatomie, lieu, personne, général) découle des collections OpenTheso auxquelles il appartient, via une table de correspondance unique et documentée. Elle remplace les heuristiques actuelles (identifiants et libellés codés en dur).

**RM-CON-02 — Calcul unique côté backend.** *Décidé (découle de RM-CON-01).*
Le backend calcule la catégorie et la renvoie avec chaque concept et chaque annotation, y compris en attente. Le frontend l'affiche sans la recalculer.

**RM-CON-03 — Priorité entre catégories.** *Proposé.*
Un concept présent dans plusieurs collections prend la première catégorie dans cet ordre : animal, comportement, anatomie, lieu, personne. Sans collection reconnue, il est « général ».

Table de correspondance proposée (reprise des commentaires du code actuel), à valider avec les gestionnaires de TheZoo :

| Collection TheZoo | Catégorie |
|---|---|
| Zoonyme (MT_7), Archéotaxon (MT_10) | animal |
| Éthologie (MT_13) | comportement |
| Anatomie (MT_8), Physiologie (MT_11) | anatomie |
| Lieux (MT_4) | lieu |
| Anthroponymes (MT_1), Peuples (MT_5) | personne |

*Point de vigilance :* certains concepts aujourd'hui classés « animal » par identifiant (racines « Domestique », « Sauvage »…) n'appartiennent peut-être à aucune de ces collections. Mesurer la couverture avant de supprimer les heuristiques.

---

## 6. Licence des contributions

**RM-LIC-01 — Données produites sous CC BY 4.0.** *Décidé.*
Les données produites dans l'application (annotations, propositions de termes, graphe des contributions) sont publiées sous licence CC BY 4.0. Les textes du corpus gardent leurs propres licences.

**RM-LIC-02 — Consentement et mention.** *Proposé.*
Le contributeur accepte la licence lors de son inscription. Les exports RDF indiquent la licence (`dcterms:license`) et l'attribution : projet Zoomathia et auteurs des contributions.

---

## 7. Recherche et export

**RM-EXP-01 — Export de la recherche personnalisée.** *Décidé (2026-11-16).*
L'export CSV ou JSON d'une recherche personnalisée contient les lignes brutes de la requête de cette recherche, que le serveur construit à partir des critères : mêmes colonnes, mêmes lignes, un passage apparaissant une fois par niveau de sa hiérarchie. L'export n'a pas de limite propre : il s'arrête aux mêmes garde-fous que la recherche (RM-ACC-02).

---

## Décisions en attente

Une seule question est ouverte (**À trancher**) : les requêtes enregistrées par un compte de service (RM-QC-06), à trancher avec le chantier de pré-annotation.

Les choix techniques que le chantier P0-4b avait mis en œuvre par défaut (RM-CTB-05, RM-CTB-06, RM-QC-02) ont été confirmés le 2026-11-17. Les autres règles « Proposé » restent à valider en relecture.
