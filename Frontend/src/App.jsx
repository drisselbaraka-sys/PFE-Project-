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
import SessionLobby from './components/SessionLobby';
import PublicQuizGallery from './components/PublicQuizGallery';
import PublicQuizDetails from './components/PublicQuizDetails';

function App() {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCreateCenterOpen, setIsCreateCenterOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null); // Full quiz object for editing
  const [activeQuiz, setActiveQuiz] = useState(null); // Quiz currently being played
  const [activeSessionCode, setActiveSessionCode] = useState(null); // The session code if in live mode
  const [liveQuizSessionCode, setLiveQuizSessionCode] = useState(null);
  const [liveQuizOptions, setLiveQuizOptions] = useState(null);
  const [isSessionHost, setIsSessionHost] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false); // Launching transition state
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'profile' | 'myquizzes'
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');
  const [publicQuizDetailId, setPublicQuizDetailId] = useState(null);
  const [publicQuizDetailRefresh, setPublicQuizDetailRefresh] = useState(0);

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
    const checkStorage = () => {
      const savedUser = sessionStorage.getItem('qvibe_user');
      const token = sessionStorage.getItem('qvibe_token');

      // Session persistence is tab-only. Each tab behaves like an isolated device.
      if (savedUser && token) {
        api.setToken(token);
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch (err) {
          console.warn('[App] Session locale invalide:', err);
          sessionStorage.removeItem('qvibe_user');
          sessionStorage.removeItem('qvibe_token');
          api.setToken(null);
          setCurrentUser(null);
        }
        return;
      }

      // Avoid phantom logged state when token/user storage is inconsistent.
      if (savedUser || token) {
        sessionStorage.removeItem('qvibe_user');
        sessionStorage.removeItem('qvibe_token');
      }
      api.setToken(null);
      setCurrentUser(null);
    };

    // Initial check on mount for this tab only.
    checkStorage();
  }, []);

  // Update state and tab-local session without redundant API calls
  const handleUpdateUserLocal = (userData) => {
    setCurrentUser(userData);
    sessionStorage.setItem('qvibe_user', JSON.stringify(userData));
  };

  const openAuthModal = (mode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (userData) => {
    setCurrentUser(userData);
    sessionStorage.setItem('qvibe_user', JSON.stringify(userData));
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
      sessionStorage.setItem('qvibe_user', JSON.stringify(response));
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
    sessionStorage.setItem('qvibe_user', JSON.stringify(updatedUser));

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
    sessionStorage.setItem('qvibe_user', JSON.stringify(updatedUser));
    setShowOnboarding(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('qvibe_token');
    sessionStorage.removeItem('qvibe_user');
    api.setToken(null);
    setCurrentUser(null);
    setEditingQuiz(null);
    setCurrentView('dashboard');
    setPublicQuizDetailId(null);
  };

  const handleEditQuiz = (quiz) => {
    setEditingQuiz(quiz);
    setIsCreateCenterOpen(true);
  };

  const handleLaunchQuiz = async (quizId) => {
    try {
      setIsLaunching(true);
      setLiveQuizSessionCode(null);
      setLiveQuizOptions(null);
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

  const handleLaunchPublicQuiz = async (quizId) => {
    try {
      setIsLaunching(true);
      setLiveQuizSessionCode(null);
      setLiveQuizOptions(null);
      setIsCreateCenterOpen(false);
      setEditingQuiz(null);

      const fullQuiz = await api.get(`/quiz/public/${quizId}`);

      setTimeout(() => {
        setActiveQuiz(fullQuiz);
        setIsLaunching(false);
      }, 1200);
    } catch (err) {
      console.error(' [App] Erreur lancement quiz public:', err);
      alert('Impossible de lancer ce quiz public.');
      setIsLaunching(false);
    }
  };

  const handleOpenPublicQuizDetails = (quizId) => {
    setPublicQuizDetailId(quizId);
    setCurrentView('public_quiz_detail');
    setIsSearchActive(false);
    setIsCreateCenterOpen(false);
    setEditingQuiz(null);
  };

  const handleRequestPublicQuizEdit = async (quizId) => {
    if (!currentUser) {
      openAuthModal('login');
      alert('Vous devez vous connecter pour modifier ou cloner ce quiz.');
      return;
    }

    try {
      const editableQuiz = await api.post(`/quiz/public/${quizId}/clone`, {});
      setEditingQuiz(editableQuiz);
      setIsCreateCenterOpen(true);
    } catch (err) {
      console.error(' [App] Erreur clonage/modification quiz public:', err);
      alert(err?.detail || 'Impossible de modifier ce quiz.');
    }
  };

  const handleLaunchLiveSession = async (sessionCode, isHost = true) => {
    setIsCreateCenterOpen(false); // Close creator if open
    setEditingQuiz(null);
    setCurrentView('dashboard');
    setActiveSessionCode(sessionCode);
    setIsSessionHost(isHost);
  };

  const handleLaunchSessionQuiz = async (sessionCode, sessionMeta = null) => {
    try {
      setIsLaunching(true);
      setIsCreateCenterOpen(false);
      setEditingQuiz(null);

      const fullQuiz = await api.get(`/session/${sessionCode}/quiz`);

      setLiveQuizSessionCode(sessionCode);
      setLiveQuizOptions(sessionMeta?.settings || null);
      setActiveSessionCode(null);
      setTimeout(() => {
        setActiveQuiz(fullQuiz);
        setIsLaunching(false);
      }, 2000);
    } catch (err) {
      console.error(" [App] Erreur lancement session quiz:", err);
      alert("Impossible de lancer le quiz.");
      setIsLaunching(false);
    }
  };

  const handleJoinLiveSession = async (rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) {
      alert('Veuillez entrer un code de session.');
      return;
    }

    setCurrentView('dashboard');
    setIsCreateCenterOpen(false);
    setEditingQuiz(null);
    setActiveSessionCode(code);
    setIsSessionHost(false);
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
        activeSessionCode ? (
          <AnimatePresence mode="wait">
            <SessionLobby 
              sessionCode={activeSessionCode} 
              isCreator={isSessionHost} 
              currentUserId={currentUser?.id_utilisateur}
              onLaunchGame={async (sessionMeta) => {
                await handleLaunchSessionQuiz(activeSessionCode, sessionMeta);
              }}
              onClose={() => setActiveSessionCode(null)}
            />
          </AnimatePresence>
        ) : (
          <>
            {/* Header */}
            {currentView === 'dashboard' && (
            <Header
              onSearchFocusChange={setIsSearchActive}
              onOpenAuth={openAuthModal}
              currentUser={currentUser}
              onLogout={handleLogout}
              searchValue={dashboardSearchQuery}
              onSearchChange={setDashboardSearchQuery}
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
            ) : currentView === 'public_quiz_detail' && publicQuizDetailId ? (
              <PublicQuizDetails
                key={`public-quiz-${publicQuizDetailId}`}
                quizId={publicQuizDetailId}
                currentUser={currentUser}
                refreshSignal={publicQuizDetailRefresh}
                onBack={() => {
                  setCurrentView('dashboard');
                  setPublicQuizDetailId(null);
                  setIsSearchActive(false);
                }}
                onPlayQuiz={handleLaunchPublicQuiz}
                onRequestEdit={handleRequestPublicQuizEdit}
                onOpenAuth={openAuthModal}
              />
            ) : (
              <motion.main
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="transition-all duration-500"
              >
                <PublicQuizGallery
                  searchQuery={dashboardSearchQuery}
                  onLaunchQuiz={handleLaunchPublicQuiz}
                  onCreateQuiz={() => {
                    setEditingQuiz(null);
                    setIsCreateCenterOpen(true);
                  }}
                  onOpenQuizDetails={handleOpenPublicQuizDetails}
                />
              </motion.main>
            )}
          </AnimatePresence>
        </>
        )
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
            onLaunchLiveSession={handleLaunchLiveSession}
            onJoinLiveSession={handleJoinLiveSession}
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
            currentUser={currentUser}
            liveSessionCode={liveQuizSessionCode}
            liveSessionOptions={liveQuizOptions}
            onPublicSubmissionSuccess={({ quizId }) => {
              const targetQuizId = quizId || activeQuiz?.id_quiz || publicQuizDetailId;
              setActiveQuiz(null);
              setLiveQuizSessionCode(null);
              setLiveQuizOptions(null);

              if (targetQuizId) {
                setPublicQuizDetailId(targetQuizId);
                setCurrentView('public_quiz_detail');
                setPublicQuizDetailRefresh((prev) => prev + 1);
              }
            }}
            onClose={() => {
              setActiveQuiz(null);
              setLiveQuizSessionCode(null);
              setLiveQuizOptions(null);
            }}
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

