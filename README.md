# 🧠 AI Quiz Wizard - Plateforme de Génération de Quiz Intelligente

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**AI Quiz Wizard** est une application Fullstack innovante conçue pour révolutionner la création, la gestion et le passage de quiz. Grâce à l'intelligence artificielle (Hugging Face & Groq), les utilisateurs peuvent générer des quiz complets, variés et personnalisés en quelques secondes à partir de simples sujets ou de documents complets, tout en profitant d'une expérience utilisateur fluide, robuste et moderne.

---

## ✨ Fonctionnalités Clés

### 🤖 Génération de Quiz par IA Avancée
- **Création instantanée multi-sources** : Générez des quiz à partir d'un simple sujet, d'un texte fourni, ou via **l'upload de documents (PDF, TXT, DOCX)**.
- **Mixité des formats** : Supporte les questions à choix multiples (QCM), les questions à plusieurs réponses et les Vrai/Faux.
- **Auto-Correction IA** : Un système intelligent de `fix_prompt` s'assure que les JSON retournés par l'IA sont toujours valides, même si le modèle fait une erreur de formatage.

### 🎮 Expérience de Jeu (Quiz Player) & Modes
- **Interface Immersive** : Un lecteur de quiz élégant avec des animations fluides (Framer Motion).
- **Mode Entraînement vs Examen** : Gestion du temps stricte (Chronomètre) pour simuler des conditions réelles.
- **Bilan Détaillé & Export** : Après chaque quiz, accédez à une analyse complète de vos réponses. Vous pouvez également **exporter vos quiz en PDF ou document Word**.

### 🌐 Hub Communautaire (Quizzes Publics)
- **Partage Social** : Rendez vos quiz publics pour défier la communauté.
- **Système d'Évaluation Précis** : Notez les quiz avec un système d'étoiles interactif supportant les demi-points (0.5 à 5 étoiles).
- **Espace Commentaires dynamique** : Une section de commentaires compacte façon YouTube à la fin de chaque quiz pour partager son avis en direct avec la communauté.

### 🔐 Architecture Sécurisée & Multi-Comptes
- **Isolation par Onglets (Tab-Isolation)** : Le frontend utilise `sessionStorage` à la place de `localStorage`, permettant d'ouvrir **plusieurs comptes simultanément dans différents onglets** sans aucune fuite ou croisement de données (saignement de session).
- **Gestion de Profil & Uploads localisés** : Mettez à jour vos informations, uploadez des avatars, et gérez vos miniatures de quiz.

---

## 🛠️ Stack Technique

| Composant | Technologie |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Framer Motion, Lucide React, sessionStorage |
| **Backend** | FastAPI (Python 3.10+), SQLAlchemy |
| **Base de Données** | SQLite (Intégrée) / PostgreSQL |
| **IA / LLM** | Groq (Llama-3), Hugging Face (Mistral/Gemma) |
| **Authentification** | JWT (JSON Web Tokens), Bcrypt |

---

## ⚙️ Installation et Configuration

### 1️⃣ Cloner le dépôt
```bash
git clone https://github.com/drisselbaraka-sys/PFE-Project-.git
cd PFE-Project-
```

### 2️⃣ Configuration du Backend
1. Naviguez vers le dossier backend : `cd Backend`
2. Créez un environnement virtuel : `python -m venv venv`
3. Activez l'environnement :
   - Windows : `.\venv\Scripts\activate`
   - Linux/Mac : `source venv/bin/activate`
4. Installez les dépendances : `pip install -r requirements.txt`
5. Configurez vos variables d'environnement :
   - Créez un fichier `.env`
   - Remplissez vos clés API (`GROQ_API_KEY`, `SECRET_KEY` pour JWT, etc.).
6. Lancez le serveur : `uvicorn main:app --reload`

### 3️⃣ Configuration du Frontend
1. Depuis un nouveau terminal, naviguez vers le dossier frontend : `cd Frontend`
2. Installez les dépendances : `npm install`
3. Lancez le client de développement : `npm run dev`

---

## 📂 Structure du Projet Globale
```text
PFE Project/
├── Backend/          
│   ├── main.py       # Point d'entrée FastAPI
│   ├── auth/         # Logique d'authentification (JWT, Hachage)
│   ├── database/     # Modèles SQLAlchemy (Quiz, User, Rating, Comment)
│   ├── quiz/         # Logique IA (ai_service), auto-fix scripts, Routes Quiz
│   └── uploads/      # Stockage local sécurisé (Photos, PDFs, Miniatures)
├── Frontend/         
│   ├── src/          # Application React
│   │   ├── components/ # Composants UI (QuizPlayer, PublicQuizDetails, Auth...)
│   │   └── utils/    # Appels API (Axios configuré avec Intercepteurs)
│   └── package.json
└── README.md
```

---

## 🛡️ Git & Sécurité
Toutes les données sensibles (clés d'API, bases de données locales `.sqlite3`, répertoires `node_modules`, environnements virtuels `.venv`, et dossiers d'uploads utilisateurs) sont strictement ignorés via la configuration experte du `.gitignore` pour garantir un dépôt propre et sécurisé.

---

## 🤝 Contribution
Ce projet a été imaginé, architecturé et développé dans le cadre d'un **Projet de Fin d'Études (PFE)** par **Driss El Baraka**. Toute suggestion d'amélioration est la bienvenue !
