# Vision et périmètre

> Document de cadrage de référence. Validé lors de la séance de cadrage du 2026-11-15.
> Toute modification passe par une revue humaine : les agents peuvent proposer des changements, jamais les appliquer seuls.

## Mission

**Zoomathia est un projet de recherche.** Sa mission est de soutenir l'étude de la transmission culturelle du savoir zoologique de l'Antiquité au Moyen Âge.

**L'application Zoomathia est l'outil de travail de ce projet.** Elle propose :

- un outil de recherche sur un corpus de textes zoologiques grecs et latins et leurs traductions ;
- l'annotation semi-automatique de ces textes, qui sert aussi de base de travail à des agents IA et à des pipelines d'annotation automatisée ;
- des données libres et transmissibles, publiées dans des formats ouverts (RDF).

C'est un travail collaboratif.

### Projet et application

| | Projet Zoomathia | Application Zoomathia |
|---|---|---|
| Nature | Programme de recherche (ANR Zoomathia, GDRI Zoomathia soutenu par le CNRS) | Logiciel décrit par ce dépôt |
| Porteurs | Équipe Wimmics (Inria, I3S, CNRS, Université Côte d'Azur) ; pipeline d'annotation issu des projets AutomaZoo et HisINum (IdEx UCA JEDI) | Équipe de développement du dépôt |
| Production | Connaissances scientifiques, publications | Corpus annoté, graphe de connaissances, outils d'exploration |

## Statut visé : service de recherche ouvert

L'application doit devenir une **plateforme pérenne et publique**, utilisée au-delà de l'équipe du projet. L'hébergement de production n'est pas encore décidé : l'I3S, sur `zoomathia.i3s.unice.fr` (qui sert aujourd'hui l'ancienne version de l'application), ou l'hébergement du mainteneur, avec un nom de domaine. Ce statut entraîne des exigences non négociables :

| Exigence | Conséquence |
|---|---|
| Identité des contributeurs | Aucune écriture anonyme : toute contribution est rattachée à un compte. |
| Modération | Aucune contribution n'est publiée sans validation (règles dans [regles-metier.md](regles-metier.md)). |
| Accessibilité | Conformité RGAA : obligation légale des services en ligne des organismes publics (article 47 de la loi n° 2005-102). |
| Données personnelles | RGPD : l'identité des contributeurs est une donnée personnelle (minimisation, mentions légales, registre). |
| Exploitation | Sauvegarde et restauration testées de toutes les données produites dans l'application, supervision du service. |
| Rapidité, absence de blocage | Réponses rapides, y compris pour les requêtes qui font appel au raisonnement ; aucun utilisateur ni aucune requête ne bloque les autres ; cible : 50 utilisateurs simultanés. |
| Pérennité des données | Formats ouverts (RDF, W3C Web Annotation, SKOS, TEI), URI stables, exports complets sans perte. |

## Publics

| Public | Usages principaux |
|---|---|
| Chercheurs du projet | Annoter, valider, enrichir le thésaurus, écrire des questions de compétence. |
| Communauté scientifique | Consulter, interroger (SPARQL), exporter et citer le corpus. |
| Étudiants et enseignants | Lecture guidée, exemples de requêtes commentés. |
| Grand public | Découvrir les textes et les animaux de l'Antiquité et du Moyen Âge. |
| Agents IA et pipelines (clients machine) | Lire le corpus et le graphe, produire des annotations candidates (découle de la mission). |

L'interface doit servir les publics non experts sans dégrader les outils experts.

## Périmètre

**Socle :** lecture et exploration du corpus (œuvres, livres, chapitres, paragraphes, témoins textuels et traductions), recherche multicritère, exports.

**Piliers, tous dans le périmètre visé :**

1. **Annotation collaborative** des textes avec les concepts du thésaurus TheZoo, avec validation.
2. **Enrichissement du thésaurus** : propositions de termes et de synonymes destinées à TheZoo (OpenTheso, Huma-Num).
3. **Requêtage avancé** : playground SPARQL, questions de compétence, visualisations de graphe.
4. **Ingestion TEI-XML et pré-annotation automatique**, dont les résultats sont validés par des chercheurs.

**Hors périmètre :**

- discussion entre utilisateurs (commentaires publics, forums, messagerie) ;
- traduction automatique des textes anciens.

**Non tranché :** l'édition des textes du corpus dans l'application (correction ou transcription) n'a été ni incluse ni exclue. À préciser avant tout développement.

## Licences

| Objet | Licence | Statut |
|---|---|---|
| Données produites dans l'application (annotations, propositions, graphe des contributions) | CC BY 4.0 | Décidé (RM-LIC-01) |
| Textes du corpus | Licence propre à chaque source (par exemple CC BY-SA pour les textes Perseus) | À vérifier source par source |
| Code de l'application | À décider avec les tutelles (Inria, CNRS, Université Côte d'Azur) | À trancher ; aucun fichier de licence d'ici là |

Le pied de page actuel indique « licence ouverte » : à aligner sur CC BY 4.0.

## Feuille de route

| Étape | Contenu | État |
|---|---|---|
| 1 | Version 2.0 : sauvegarde du triplestore, backend FastAPI, frontend React et TypeScript, thésaurus, annotations, playground SPARQL | Réalisé |
| 2 | Cadrage : vision, règles métier, architecture, consignes pour les agents | Réalisé le 2026-11-15 |
| 3 | Mise en sécurité : priorités P0 de l'audit du 2026-11-15 (authentification, rôles, modération, garde-fous) | Prochaine étape |
| 4 | Alignement sur les règles décidées : QC en base, publication des annotations dans Corese, catégories issues de TheZoo, API REST versionnée | À venir |
| 5 | Ingestion TEI-XML (découpage en œuvres, parties et paragraphes) et pré-annotation automatique par correspondance avec TheZoo, avec relecture | À venir |
| 6 | Mise en production : TLS, reverse proxy, sauvegardes, supervision, audit RGAA | À venir |

## Conséquences pour le développement

Déduites des choix ci-dessus, à confirmer en relecture :

1. **L'API est un produit**, pas seulement le backend du frontend : documentée, versionnée, utilisable par des clients machine.
2. **Chaque annotation porte sa provenance** (humaine ou machine, outil, version, score éventuel), dès maintenant et avant même que le pipeline automatique existe.
3. **Toute donnée produite dans l'application est exportable en RDF standard** et reste réutilisable hors de l'application.
4. **La sécurité et l'accessibilité sont des prérequis de mise en ligne**, pas des améliorations ultérieures.
