# REPS — compteur de répétitions par caméra

Une application web (PWA) qui compte tes répétitions avec la caméra de ton téléphone.

- **Un exercice au choix** : choisis l'exercice, un objectif (facultatif), un nombre de séries et le repos entre les séries. La caméra compte à voix haute, un bip signale l'objectif.
- **WOD, plusieurs exercices** : *Pour le temps*, *AMRAP* ou *intervalles* (EMOM, Tabata). Deux façons de compter :
  - **Dans l'ordre** : l'appli suit la liste, annonce l'exercice suivant quand tu atteins les répétitions, gère les tours, le schéma (21-15-9) et le repos entre tours ;
  - **Détection auto** : tous les exercices de la liste sont « armés » en même temps ; l'appli reconnaît seule celui que tu fais et compte chacun. Tu les enchaînes dans l'ordre que tu veux.
- Présélections (Cindy, Angie, Barbara, Fran, Chelsea, Murph sans la course, Tabata, Trio express), WOD décrit en texte (« AMRAP 12 min : 5 tractions, 10 pompes, 15 squats »), WOD enregistrés.
- Carnet : historique, records par exercice, sauvegarde et restauration.
- 13 exercices : squats, fentes, pompes, tractions, dips, sit-ups, soulevés/swings, développés, toes to bar, développé couché/incliné, tirages/rowing, presse à cuisses, burpees.
- Analyse aussi une **vidéo** du téléphone, au lieu de la caméra.
- **Deux langues** : français et azerbaïdjanais (sélecteur **FR | AZ** en haut à droite, choix mémorisé ; la langue du navigateur est utilisée au premier lancement). Interface, conseils de placement, annonces vocales et lecture d'un WOD écrit en azéri (« AMRAP 12 dəq: 5 dartınma, 10 şınav, 15 çömelmə »). La traduction azérie a été rédigée sans relecture par une personne de langue azérie : toute correction est la bienvenue. La voix de synthèse utilise une voix azérie si le téléphone en a une, sinon une voix turque (langue très proche).

Ce compteur est issu de celui de ROAD TO GI, isolé en application autonome (ROAD TO GI n'est pas modifiée).

## Vie privée

Les images sont analysées **sur le téléphone** : elles ne sont ni enregistrées ni envoyées. Seuls des chiffres (résultats, réglages) sont gardés dans le stockage local de l'appareil (`reps_v1`). Aucun compte, aucun serveur, aucun outil statistique.

Au premier usage, deux ressources publiques sont téléchargées puis gardées pour le hors-ligne (cache `reps-ml-v1`) :

| Ressource | Source | Taille |
| --- | --- | --- |
| Bibliothèque MediaPipe Tasks Vision 0.10.21 (JavaScript + WebAssembly) | `cdn.jsdelivr.net` | environ 9,7 Mo |
| Modèle `pose_landmarker_lite` (détection du squelette) | `storage.googleapis.com/mediapipe-models` | environ 5,6 Mo |

MediaPipe et ses modèles sont publiés par Google sous licence Apache 2.0.

## Utilisation

1. Pose le téléphone à la verticale, calé, à 2,5 à 3 m, **de profil ou de trois-quarts**, corps entier visible. Un bon éclairage et un fond uni aident.
2. Choisis l'exercice (onglet *Exercice*) ou le WOD (onglet *WOD*), puis **Démarrer la caméra**.
3. Vérifie le badge « Cadrage OK », touche **Démarrer** (ou active le départ automatique). Un décompte lance la série.
4. Si l'appli se trompe : **−1 / +1**, **Zéro**, **Pause**. À la fin, enregistre dans le carnet.

Plusieurs personnes dans le cadre : l'appli se fixe sur toi (squelette rouge) et ignore les autres, même si quelqu'un passe devant. Si elle te perd de vue, elle ne compte rien jusqu'à ton retour.

### Sensibilité

*Souple* accepte moins d'amplitude, *Normale* est le réglage de référence, *Stricte* exige l'amplitude complète. Le diagnostic (Carnet > Réglages) affiche l'angle mesuré et les seuils pour régler finement.

### WOD en détection automatique : ce qu'il faut savoir

L'appli compare le mouvement des dernières secondes à la « signature » de chaque exercice de la liste (tronc vertical ou horizontal, quelle partie du corps se déplace — hanches, épaules ou poignets —, mains au-dessus de la tête, etc.). Une répétition n'est comptée que pour l'exercice reconnu. C'est plus fragile que le suivi *dans l'ordre* : en cas de doute, utilise l'ordre.

## Limites

- C'est une aide, pas un arbitre : le comptage dépend de l'angle de la caméra, de la lumière, des vêtements et de la vitesse.
- Moins fiables : dips, toes to bar, rowing assis et tirage vertical. En position allongée, la détection peut décrocher.
- Le corps entier doit rester dans le cadre (jambes comprises pour squats, fentes, burpees…).
- Les burpees se comptent au retour debout ; les thrusters et wall balls sont comptés comme des squats.
- Testé dans un navigateur sur des vidéos de démonstration. **Pas encore testé sur un iPhone réel** (caméra en mode application installée, accélération graphique, voix).

## Publier sur GitHub Pages

1. Crée un dépôt public (par exemple `reps`) et envoie tous les fichiers de ce dossier à la racine (sauf `tools/`, qui sert au développement).
2. Réglages > Pages > *Deploy from a branch* > `main` / racine.
3. L'application est disponible sur `https://<compte>.github.io/<dépôt>/`.

Le service worker utilise des préfixes propres à REPS (`reps-…`) : il ne touche pas aux caches des autres applications du même domaine (ARISE, ROAD TO GI, Ma Routine…). À chaque nouvelle version, changer `VERSION` dans `sw.js`.

## Installer sur iPhone

Ouvre le site dans Safari, puis Partager > Sur l'écran d'accueil > Ajouter. Premier lancement avec du réseau (téléchargement du modèle), ensuite l'appli fonctionne hors ligne.

## Fichiers

```text
index.html            interface et session caméra
styles.css            thème (blanc et rouge)
i18n.js               langues : dictionnaire français → azerbaïdjanais, sélecteur FR | AZ
engine.js             moteur : exercices, angles, machine à états, suivi d'une personne, reconnaissance, compteur multi-exercices
wod.js                WOD : modèle, lecture de texte, présélections, progression, scores
vision.js             caméra ou vidéo, modèle MediaPipe, boucle d'analyse, squelette
audio.js              bips, voix, vibrations
session.js            séances : exercice seul (séries et repos) et WOD (ordre imposé ou libre)
app.js                onglets, formulaires, carnet, résultats, sauvegarde
sw.js                 hors-ligne
manifest.webmanifest  installation
icons/                icônes
tests/                tests du moteur et des WOD (voir plus bas)
tools/                outils de développement (non publiés)
VERIFICATION.md       contrôles réalisés
```

## Tests

`node tests/engine.test.cjs`, `node tests/wod.test.cjs` et `node tests/i18n.test.cjs` (Node.js 18 ou plus). Ils couvrent la reconnaissance des textes, les machines à états, la reconnaissance d'exercice (trajectoires simulées), le compteur multi-exercices, la lecture des WOD, les étapes, les totaux, la progression et les scores, ainsi que le dictionnaire azéri (mêmes paramètres des deux côtés, aucun texte vide, chaque exercice reconnu sous son nom azéri). `VERIFICATION.md` décrit aussi les essais sur poses enregistrées de vidéos libres.
