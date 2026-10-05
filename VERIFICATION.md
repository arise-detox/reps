# Vérifications de REPS 1.0

Réalisées le 5 octobre 2026 dans le navigateur intégré de Claude, sur un serveur local. Ce document distingue ce qui a été contrôlé de ce qui ne l'a pas été.

## Tests automatisés

Node n'est pas installé sur le poste de développement : `tests/engine.test.cjs` et `tests/wod.test.cjs` ont été exécutés dans le navigateur avec une petite doublure de `require` et `assert` (ils tournent à l'identique sous Node 18 ou plus).

- **Moteur** : reconnaissance du texte (« 15 Tractions », « wall balls »…), machine à états (répétition complète, amplitude insuffisante signalée, sensibilité souple/normale/stricte, comptage en haut pour les développés, vitesse impossible, corps perdu puis retrouvé), reconnaissance de l'exercice sur des trajectoires de posture simulées (squat, pompe, traction, développé, soulevé, sit-up, rowing, burpee ; un sit-up n'est pas pris pour un burpee ni l'inverse), compteur multi-exercices (validation des paramètres, ajustements).
- **WOD** : lecture de textes (AMRAP, schéma 21-15-9, EMOM, Tabata, tours, repos, exercices inconnus signalés), normalisation et bornes, étapes en ordre imposé, totaux requis, progression en ordre libre, scores et durées. Les 8 présélections sont valides.

## Essais sur poses enregistrées de vidéos libres

Des vidéos libres de droits (Wikimedia Commons : squat, soulevé de terre, développé, développé couché et incliné, rowing, tractions, sit-ups, burpees, fentes, kettlebell, toes to bar…) ont été passées dans MediaPipe ; les 33 points du corps de chaque image ont été enregistrés, puis rejoués à travers le moteur (sans les vidéos ni la caméra). Ces enregistrements ne sont pas publiés.

- **Un exercice à la fois** : le compteur d'ROAD TO GI, repris tel quel, compte comme avant sur ces clips. Un bogue a été corrigé : après une perte du corps de plus de 1,5 s, la valeur lissée de l'angle n'était pas remise à zéro (la première répétition suivante pouvait être manquée).
- **WOD en détection automatique, les 13 exercices armés en même temps (cas le plus difficile)** : sur 21 clips, 85 répétitions attendues (celles que le compteur dédié compte) ; 72 attribuées au bon exercice, 13 manquées (corps hors cadre, début de clip), 12 attribuées à tort. Avec 5 à 6 exercices armés (WOD classique : squats, pompes, tractions, sit-ups, burpees) : 72 bien attribuées, 9 fausses.
- **Enchaînements simulés** (extraits de clips mis bout à bout avec des pauses) : squat, développé, soulevé, burpee, traction, sit-ups, burpees : tout est attribué au bon exercice (une seule répétition de sit-up manquée). Séance « trio » (burpees, squats, sit-ups, deux fois) : 6 burpees, 4 squats, 6 sit-ups, sans faux positif. Séance « salle » (couché, traction, squat, sit-ups, incliné, soulevé) : tout correct.
- **Confusions connues** : un swing de kettlebell très « squat » (genoux très fléchis, tronc peu penché) peut être compté comme squat ; les pompes ne sont pas validées faute de bonne vidéo libre (le compteur de pompes vient de ROAD TO GI) ; dips, toes to bar, rowing assis et tirage vertical ne sont pas validés.

## Séances

Contrôleurs (`session.js`) exécutés avec des poses injectées, sans caméra :

- **Exercice seul** : 2 séries de 2 squats avec objectif, repos de 3 s, compte à rebours, enchaînement et résultat (2 + 2 = 4).
- **WOD pour le temps en ordre imposé** : 2 squats puis 1 traction → terminé, score au chronomètre.
- **WOD pour le temps en détection automatique** (squats, tractions, burpees dans cet ordre) : 2, 1 et 3 répétitions comptées, WOD terminé automatiquement quand tous les totaux sont atteints.
- **AMRAP en ordre imposé** : tours et étapes qui avancent.
- **Intervalles** : un exercice à tour de rôle (2 intervalles, effort 6 s, repos 2 s → 2/2 réussis) et tous les exercices à chaque intervalle (passage automatique à l'exercice suivant).
- Un compte à rebours de 0 seconde (vidéo importée) ne démarre plus qu'une fois (bogue trouvé pendant ces essais, corrigé).

## Interface

- Les trois onglets, la lecture d'un WOD écrit (« Cindy : AMRAP 15 min : 5 tractions, 10 pompes, 15 squats » → format, durée, nom, trois exercices), ajout d'un exercice, bascule *dans l'ordre* / *détection auto*, écran de session (cadrage, décompte, WOD avec pastilles par exercice), résultat, carnet avec records et historique.
- Analyse d'une vidéo de squats dans l'appli (modèle chargé, 2 squats, résultat avec record) ; même vidéo dans un WOD en détection automatique (« Détecté : Squats »).
- Restauration d'une sauvegarde via le sélecteur de fichier : séances, WOD, exercice choisi et réglages retrouvés ; une séance de type inconnu, un exercice inexistant dans les compteurs et un nom contenant du HTML (affiché en texte, jamais interprété) sont neutralisés ; le stockage local est mis à jour.
- Aucun débordement horizontal à 320 px sur les trois onglets et la session. Aucune erreur dans la console.
- Hors-ligne : le service worker préchargé 14 fichiers de l'appli et garde en cache la bibliothèque et le modèle (4 fichiers, environ 15 Mo en tout) après un premier usage. Le service worker n'utilise que des caches préfixés `reps-` (il ne touche pas aux autres applis du même domaine).

## Langues (version 1.1)

- Sélecteur FR | AZ en haut à droite : bascule immédiate de l'interface, du titre de la page, des conseils de placement, des messages de séance et des textes de WOD ; choix conservé après rechargement et dans la sauvegarde.
- Tous les écrans parcourus en azéri (exercices, WOD, présélections, formats, Carnet avec séances fictives, à-propos) et des séances simulées (exercice seul avec repos, intervalles, AMRAP en détection automatique) : aucun texte français oublié (relevé automatique des textes sans traduction : aucun).
- `tests/i18n.test.cjs` : paramètres identiques des deux côtés pour les 300 textes du dictionnaire, aucune traduction vide, noms d'exercices azéris reconnus par le lecteur de WOD, lecture de WOD écrits en azéri, durées et scores en azéri.
- Aucun débordement horizontal à 320 px en azéri.
- **Limite** : la traduction azérie n'a pas été relue par une personne de langue azérie (termes sportifs choisis au plus courant : dartınma, şınav, çömelmə, raund, təkrar…) ; la voix de synthèse azérie dépend du téléphone (repli sur une voix turque), non testée sur iPhone.

## Ce qui n'a pas été testé

- **Aucun iPhone réel** : caméra en mode application installée, accélération graphique, voix de synthèse, vibrations, verrou d'écran.
- **Aucune vraie caméra** dans l'environnement de test : la caméra n'a été essayée que par ses messages d'erreur ; l'analyse passe par des vidéos et des poses enregistrées.
- Pompes, dips, toes to bar, rowing assis, tirage vertical, position allongée prolongée.
- Détection automatique entre exercices très proches (swing et squat, pompes et développé couché).
- Le partage natif et le téléchargement du fichier de sauvegarde (le bouton « Sauvegarder » utilise le mécanisme standard Blob + lien de téléchargement, non confirmé ici).
