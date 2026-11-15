# Glossaire

> Termes du domaine et leur nom dans le code (anglais). À compléter dès qu'un terme nouveau apparaît dans une règle métier.

| Terme | Nom dans le code | Définition |
|---|---|---|
| Œuvre | `work` | Texte d'un auteur (par exemple le *De natura animalium* d'Élien) ; type `zoo:Oeuvre` dans le graphe. |
| Témoin | `witness` | Version d'un même texte dans une langue ou une édition donnée (fichier distinct). L'application regroupe les témoins d'une même œuvre. |
| Traduction | `translation` | Témoin en langue moderne, souvent anglaise, apparié à un témoin original. |
| Partie | `part`, `section` | Subdivision d'une œuvre (livre, chapitre, section) ; relations `zoo:hasPart` et `zoo:isPartOf`. |
| Paragraphe | `paragraph` | Plus petite unité de texte annotable ; type `zoo:Paragraph`, porte le texte (`zoo:text`). |
| Corpus | `corpus` | Ensemble des œuvres disponibles. |
| Sous-corpus | `subcorpus` | Résultat d'une recherche multicritère, exportable. |
| Recherche multicritère | `custom search` | Recherche par auteurs, œuvres, concepts et collections, avec inclusion ou exclusion et mode ET/OU. |
| Annotation | `annotation` | Lien entre un passage d'un paragraphe et un concept de TheZoo, au format W3C Web Annotation. |
| Annotation historique | `legacy annotation` | Annotation déjà présente dans Corese, produite par les pipelines AutomaZoo et HisINum. |
| Contribution | `contribution` | Annotation ou proposition de terme créée dans l'application. |
| Suggestion | `suggestion` | Contribution produite par un compte de service, en attente de relecture humaine (RM-MOD-04). |
| Relecture | `review` | Validation ou rejet d'une contribution par un pair (RM-MOD-01). |
| Retrait | `retraction` | Retrait motivé d'une annotation validée (RM-PUB-04). |
| Granularité | `scope_type` | Mot, suite de mots, phrase, paragraphe ou plusieurs paragraphes (RM-ANN-02). |
| Position | `offset` | Début ou fin d'un passage dans le texte du paragraphe (RM-ANN-01). |
| Thésaurus TheZoo | `thesaurus` | Vocabulaire SKOS de référence du projet (`th310`), hébergé sur OpenTheso. |
| OpenTheso | `opentheso` | Plateforme de gestion de thésaurus d'Huma-Num. |
| Concept | `concept` | Entrée du thésaurus (`skos:Concept`), identifiée par une URI. |
| Libellé préférentiel, alternatif | `pref_label`, `alt_label` | Nom principal et synonymes d'un concept, par langue. |
| Concept générique | `broader` | Concept parent (`skos:broader`). |
| Collection | `collection` | Regroupement thématique de concepts (`skos:Collection`), par exemple Zoonyme ou Éthologie. |
| Catégorie | `category` | Classe d'affichage d'un concept (animal, comportement, anatomie, lieu, personne, général), déduite de ses collections (RM-CON-01). |
| Proposition de terme | `term proposal` | Nouveau terme ou synonyme proposé pour TheZoo. |
| Question de compétence (QC) | `competency question`, `qc` | Question de recherche formalisée par une requête SPARQL de référence. |
| Variante SPO | `spo query` | Version d'une requête qui renvoie des triplets sujet-prédicat-objet, pour la visualisation en graphe. |
| VENUS | `venus` | Bibliothèque de visualisation de graphes de l'équipe Wimmics. |
| Corese | `corese` | Triplestore et moteur SPARQL de l'équipe Wimmics, qui héberge le graphe de référence. |
| Graphe nommé | `named graph` | Partie du triplestore identifiée par une URI, par exemple le graphe des contributions. |
| TEI | `tei` | Format XML d'encodage des textes (Text Encoding Initiative). |
| Pré-annotation | `pre-annotation` | Annotation proposée automatiquement par un pipeline, à relire. |
| Visiteur, contributeur, administrateur, compte de service | `visitor`, `contributor`, `admin`, `service account` | Rôles de l'application ([regles-metier.md](regles-metier.md), section 1). |
