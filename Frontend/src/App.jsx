import React, { useState, useEffect, useCallback } from 'react';
import api from './utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import Onboarding from './components/Onboarding';
import CreateCenter from './components/CreateCenter';
import Profile from './components/Profile';
import MyQuizzes from './components/MyQuizzes';
import QuizPlayer from './components/QuizPlayer';

function App() {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCreateCenterOpen, setIsCreateCenterOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null); // Full quiz object for editing
  const [activeQuiz, setActiveQuiz] = useState(null); // Quiz currently being played
  const [isLaunching, setIsLaunching] = useState(false); // Launching transition state
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'profile' | 'myquizzes'

  // ── Dark mode engine ──
  const applyTheme = useCallback((theme) => {
    const html = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (theme === 'dark' || (theme === 'system' && prefersDark)) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    const theme = currentUser?.preferences?.theme || 'light';
    applyTheme(theme);

    // Listen for OS theme changes when in system mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if ((currentUser?.preferences?.theme || 'light') === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [currentUser?.preferences?.theme, applyTheme]);

  useEffect(() => {
    const token = localStorage.getItem('qvibe_token');
    const savedUser = localStorage.getItem('qvibe_user');

    // 1. Afficher immédiatement depuis localStorage — l'interface ne bloque pas
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }

    // 2. Rafraîchir silencieusement en arrière-plan (sans bloquer l'UI)
    if (token) {
      api.get('/auth/me')
        .then((freshUser) => {
          setCurrentUser(freshUser);
          localStorage.setItem('qvibe_user', JSON.stringify(freshUser));
        })
        .catch((err) => {
          console.warn('[App] Impossible de rafraîchir le profil:', err);
          if (!savedUser) {
            localStorage.removeItem('qvibe_token');
          }
        });
    }
  }, []);

  // Update state and localStorage without redundant API calls
  const handleUpdateUserLocal = (userData) => {
    setCurrentUser(userData);
    localStorage.setItem('qvibe_user', JSON.stringify(userData));
  };

  // Listen for global unauthorized events (401)
  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn(' [App] Session expirée, déconnexion...');
      handleLogout();
      alert('Votre session a expiré. Veuillez vous reconnecter.');
      openAuthModal('login');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const openAuthModal = (mode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (userData) => {
    setCurrentUser(userData);
    localStorage.setItem('qvibe_user', JSON.stringify(userData));
    // Check if onboarding is needed
    if (!userData.preferences || !userData.preferences.onboarding_completed) {
      setShowOnboarding(true);
    }
  };



  const handleUpdateUser = async (updatedUser) => {
    try {
      // Sync to backend
      const response = await api.put('/auth/update', {
        nom_affichage: updatedUser.nom_affichage,
        bio: updatedUser.preferences?.bio,
        preferences: updatedUser.preferences
      });

      // Update local state with fresh data from backend
      setCurrentUser(response);
      localStorage.setItem('qvibe_user', JSON.stringify(response));
    } catch (error) {
      console.error(' [App] Erreur lors de la mise à jour du profil:', error);
      alert('Erreur lors de la sauvegarde du profil.');
    }
  };

  const handleUpdateTheme = async (newTheme) => {
    applyTheme(newTheme);
    if (!currentUser) return;

    // Update locally first for instant feedback (already done by applyTheme, but we update state too)
    const updatedPreferences = { ...currentUser.preferences, theme: newTheme };
    const updatedUser = { ...currentUser, preferences: updatedPreferences };

    setCurrentUser(updatedUser);
    localStorage.setItem('qvibe_user', JSON.stringify(updatedUser));

    // Save to server
    try {
      await api.put('/auth/update', {
        preferences: updatedPreferences
      });
      console.log(' [App] Thème sauvegardé sur le serveur:', newTheme);
    } catch (error) {
      console.error(' [App] Erreur sauvegarde thème:', error);
    }
  };

  const handleOnboardingComplete = (updatedUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('qvibe_user', JSON.stringify(updatedUser));
    setShowOnboarding(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('qvibe_token');
    localStorage.removeItem('qvibe_user');
    setCurrentUser(null);
    setEditingQuiz(null);
    setCurrentView('dashboard');
  };

  const handleEditQuiz = (quiz) => {
    setEditingQuiz(quiz);
    setIsCreateCenterOpen(true);
  };

  const handleLaunchQuiz = async (quizId) => {
    try {
      setIsLaunching(true);
      setIsCreateCenterOpen(false); // Close creator if open
      setEditingQuiz(null);

      // Fetch full quiz data if we only have the ID
      const fullQuiz = await api.get(`/quiz/${quizId}`);

      // Delay slightly to show the beautiful transition
      setTimeout(() => {
        setActiveQuiz(fullQuiz);
        setIsLaunching(false);
      }, 2000);
    } catch (err) {
      console.error(" [App] Erreur lancement quiz:", err);
      alert("Impossible de lancer le quiz.");
      setIsLaunching(false);
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Onboarding */}
      {showOnboarding && currentUser && (
        <Onboarding
          user={currentUser}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* Main App Layout */}
      {!isCreateCenterOpen ? (
        <>
          {/* Header */}
          {currentView === 'dashboard' && (
            <Header
              onSearchFocusChange={setIsSearchActive}
              onOpenAuth={openAuthModal}
              currentUser={currentUser}
              onLogout={handleLogout}
              onCreateClick={() => {
                setEditingQuiz(null);
                setIsCreateCenterOpen(true);
              }}
              onProfileClick={() => setCurrentView('profile')}
              onMyQuizzesClick={() => setCurrentView('myquizzes')}
            />
          )}

          {/* Search Overlay */}
          <div className={`search-overlay ${isSearchActive ? 'active' : ''}`} />

          {/* Page Content */}
          <AnimatePresence mode="wait">
            {currentView === 'profile' && currentUser ? (
              <Profile
                key="profile"
                user={currentUser}
                onClose={() => {
                  setCurrentView('dashboard');
                }}
                onUpdateUser={handleUpdateUser}
                onUpdateUserLocal={handleUpdateUserLocal}
                onThemePreview={handleUpdateTheme}
              />
            ) : currentView === 'myquizzes' && currentUser ? (
              <MyQuizzes
                key="myquizzes"
                currentUser={currentUser}
                onClose={() => setCurrentView('dashboard')}
                onCreateClick={() => {
                  setEditingQuiz(null);
                  setIsCreateCenterOpen(true);
                }}
                onEditQuiz={handleEditQuiz}
                onLaunchQuiz={handleLaunchQuiz}
              />
            ) : (
              <motion.main
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pt-40 px-6 transition-all duration-500"
              >
                <div className="max-w-7xl mx-auto">
                  {/* Dashboard Content */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-80 rounded-3xl shadow-sm border transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1 duration-300" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}></div>
                    ))}
                  </div>
                </div>
              </motion.main>
            )}
          </AnimatePresence>
        </>
      ) : (
        /* Create Center Page */
        <AnimatePresence mode="wait">
          <CreateCenter
            onClose={() => {
              setIsCreateCenterOpen(false);
              setEditingQuiz(null);
            }}
            currentUser={currentUser}
            editingQuiz={editingQuiz}
            onLaunchQuiz={handleLaunchQuiz}
          />
        </AnimatePresence>
      )}

      {/* Launching Transition Overlay */}
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex flex-col items-center justify-center p-6 text-center"
            style={{ backgroundColor: 'var(--bg-base)' }}
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-32 h-32 rounded-3xl bg-indigo-600 flex items-center justify-center text-5xl mb-8 shadow-2xl shadow-indigo-500/20"
            >
              🚀
            </motion.div>
            <h2 className="text-3xl font-black mb-4">Préparation du Quiz...</h2>
            <p className="opacity-60 mb-8 max-w-sm">Optimisation de l'expérience et chargement des questions.</p>

            <div className="w-64 h-2 bg-indigo-500/10 rounded-full overflow-hidden relative">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 bg-indigo-600"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiz Player Overlay */}
      <AnimatePresence>
        {activeQuiz && (
          <QuizPlayer
            quiz={activeQuiz}
            onClose={() => setActiveQuiz(null)}
          />
        )}
      </AnimatePresence>

      {/* Auth Modal (Persistent) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}

export default App;
