# 🧠 AI Quiz Wizard - Plateforme de Génération de Quiz Intelligente

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**AI Quiz Wizard** est une application Fullstack innovante conçue pour révolutionner la création de quiz. Grâce à l'intelligence artificielle (Hugging Face & Groq), les utilisateurs peuvent générer des quiz complets, variés et personnalisés en quelques secondes, tout en profitant d'une expérience utilisateur fluide et moderne.

---

## ✨ Fonctionnalités Clés

### 🤖 Génération de Quiz par IA
- **Création instantanée** : Générez des quiz à partir d'un simple sujet ou d'un texte fourni.
- **Mixité des formats** : Supporte les questions à choix multiples (QCM), les questions à plusieurs réponses et les Vrai/Faux.
- **Paramétrage précis** : Choix de la difficulté, du nombre de questions et de la langue.

### 🎮 Expérience de Jeu (Quiz Player)
- **Interface Immersive** : Un lecteur de quiz élégant avec animations Fluides (Framer Motion).
- **Gestion du Temps** : Chronomètre intégré pour chaque session.
- **Bilan Détaillé** : Après chaque quiz, accédez à une analyse complète de vos réponses avec des conseils personnalisés générés par l'IA pour progresser.

### 📚 Gestion Personnalisée
- **Tableau de bord "Mes Quiz"** : Redessiné avec une interface 70/30 (Image/Boutons) ultra-premium.
- **Tri & Filtrage Avancé** : Triez vos quiz par date, difficulté, nombre de questions, ou clonabilité.
- **Édition & Clonage** : Modifiez vos quiz générés ou clonez ceux des autres pour les personnaliser.

---

## 🛠️ Stack Technique

| Composant | Technologie |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Framer Motion, Lucide React |
| **Backend** | FastAPI (Python 3.10+), SQLAlchemy |
| **Base de Données** | PostgreSQL (Supabase ou Local) |
| **IA / LLM** | Groq (Llama-3), Hugging Face (Mistral/Gemma) |
| **Authentification** | JWT (JSON Web Tokens), Google OAuth 2.0 |

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
   - Copiez `.env.example` vers `.env`
   - Remplissez vos clés API (Hugging Face, Groq, Google OAuth) et vos identifiants DB.
6. Lancez le serveur : `uvicorn main:app --reload`

### 3️⃣ Configuration du Frontend
1. Naviguez vers le dossier frontend : `cd ../Frontend`
2. Installez les dépendances : `npm install`
3. Lancez le client : `npm run dev`

---

## 📂 Structure du Projet
```
.
├── Backend/          # Serveur FastAPI, Modèles DB, Logique IA
├── Frontend/         # Application React (Vite)
├── .env.example      # Template global des variables d'environnement
└── README.md         # Documentation principale
```

---

## 🔒 Sécurité
Toutes les données sensibles (clés d'API, informations de connexion à la base de données) sont gérées via des variables d'environnement et sont listées dans `.gitignore` pour éviter toute exposition sur le dépôt public.

---

## 🤝 Contribution
Ce projet a été réalisé dans le cadre d'un **Projet de Fin d'Études (PFE)** par **Driss El Baraka**. Toute suggestion d'amélioration est la bienvenue !
