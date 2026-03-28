import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, PenLine, Search, BookOpen, Calendar, Play, Tag, Globe2, RefreshCw } from 'lucide-react';
import api from '../utils/api';

const THUMBNAIL_THEMES = [
  { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', icon: '🧠' },
  { bg: 'linear-gradient(135deg, #f59e0b, #ef4444)', icon: '🔥' },
  { bg: 'linear-gradient(135deg, #10b981, #3b82f6)', icon: '🌊' },
  { bg: 'linear-gradient(135deg, #ec4899, #f43f5e)', icon: '💎' },
  { bg: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)', icon: '🚀' },
  { bg: 'linear-gradient(135deg, #14b8a6, #06b6d4)', icon: '🌿' },
];

const getThemeForId = (id = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return THUMBNAIL_THEMES[Math.abs(hash) % THUMBNAIL_THEMES.length];
};

const normalizeTag = (tag) => String(tag || '').trim().toLowerCase();

const typeLabel = (type) => {
  if (type === 'ai') return 'IA';
  if (type === 'manual') return 'MANUEL';
  return 'QUIZ';
};

const PublicQuizCard = ({ quiz, index, onLaunch, onOpenDetails = () => {} }) => {
  const [imgError, setImgError] = useState(false);
  const theme = getThemeForId(quiz.id_quiz);
  const formattedDate = new Date(quiz.date_creation).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 280, damping: 24 }}
      className="group relative h-[430px] overflow-hidden rounded-[30px] border cursor-pointer"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
      onClick={() => onOpenDetails(quiz.id_quiz)}
    >
      <div className="absolute inset-0">
        {quiz.image_couverture_url && !imgError ? (
          <img
            src={quiz.image_couverture_url}
            alt={quiz.titre}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl transition-transform duration-500 group-hover:scale-110" style={{ background: theme.bg }}>
            <span>{theme.icon}</span>
          </div>
        )}
      </div>

      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/35 to-transparent" />

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <span className="rounded-full bg-white/95 px-3 py-1 text-[10px] font-black tracking-wide text-gray-800">
          {typeLabel(quiz.type_creation)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-3 py-1 text-[10px] font-black tracking-wide text-white">
          <Globe2 size={11} /> PUBLIC
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <h3 className="line-clamp-2 text-xl font-black leading-tight">{quiz.titre}</h3>

        {quiz.description && (
          <p className="mt-2 line-clamp-2 text-xs font-medium text-white/80">{quiz.description}</p>
        )}

        <div className="mt-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-white/85">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1">
            <BookOpen size={12} /> {quiz.nombre_questions || 0} Questions
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1">
            <Calendar size={12} /> {formattedDate}
          </span>
        </div>

        {Array.isArray(quiz.tags) && quiz.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {quiz.tags.slice(0, 3).map((tag) => (
              <span key={`${quiz.id_quiz}-${tag}`} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={(event) => {
            event.stopPropagation();
            onLaunch(quiz.id_quiz);
          }}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black transition-all hover:bg-white hover:text-black"
        >
          <Play size={16} className="fill-current" /> Jouer ce quiz
        </button>
      </div>
    </motion.article>
  );
};

const PublicQuizGallery = ({ searchQuery = '', onLaunchQuiz, onCreateQuiz, onOpenQuizDetails = () => {} }) => {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeTag, setActiveTag] = useState('all');

  const fetchPublicQuizzes = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/quiz/public');
      setQuizzes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[PublicQuizGallery] Erreur de chargement:', err);
      setError('Impossible de charger les quiz publics pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicQuizzes();
  }, []);

  const tags = useMemo(() => {
    const counts = new Map();
    quizzes.forEach((quiz) => {
      const values = Array.isArray(quiz.tags) ? quiz.tags : [];
      values.forEach((rawTag) => {
        const key = normalizeTag(rawTag);
        if (!key) return;
        if (!counts.has(key)) counts.set(key, { label: rawTag, count: 0 });
        counts.get(key).count += 1;
      });
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12)
      .map(([key, value]) => ({ key, label: value.label, count: value.count }));
  }, [quizzes]);

  const normalizedSearch = (searchQuery || '').trim().toLowerCase();

  const visibleQuizzes = useMemo(() => {
    return quizzes
      .filter((quiz) => {
        if (typeFilter !== 'all' && quiz.type_creation !== typeFilter) return false;

        if (activeTag !== 'all') {
          const quizTags = Array.isArray(quiz.tags) ? quiz.tags.map(normalizeTag) : [];
          if (!quizTags.includes(activeTag)) return false;
        }

        if (!normalizedSearch) return true;

        const inTitle = String(quiz.titre || '').toLowerCase().includes(normalizedSearch);
        const inDesc = String(quiz.description || '').toLowerCase().includes(normalizedSearch);
        const inTags = (Array.isArray(quiz.tags) ? quiz.tags : [])
          .some((t) => String(t || '').toLowerCase().includes(normalizedSearch));

        return inTitle || inDesc || inTags;
      })
      .sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));
  }, [quizzes, typeFilter, activeTag, normalizedSearch]);

  return (
    <section className="pt-40 px-6 pb-16">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[34px] border p-8 md:p-10" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />

          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-black uppercase tracking-wider" style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}>
              <Sparkles size={14} /> Bibliotheque Communautaire
            </p>
            <h1 className="mt-4 text-3xl font-black md:text-5xl" style={{ color: 'var(--text-primary)' }}>
              Decouvrez des quiz publics crees par la communaute
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-medium md:text-base" style={{ color: 'var(--text-muted)' }}>
              Utilisez la recherche et les filtres pour trouver rapidement un quiz par theme, categorie ou mode de creation.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setTypeFilter('all')}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${typeFilter === 'all' ? 'text-white' : ''}`}
                style={typeFilter === 'all' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                Tous
              </button>
              <button
                onClick={() => setTypeFilter('ai')}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${typeFilter === 'ai' ? 'text-white' : ''}`}
                style={typeFilter === 'ai' ? { background: 'linear-gradient(135deg, #7c3aed, #ec4899)' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                <Sparkles size={14} /> IA
              </button>
              <button
                onClick={() => setTypeFilter('manual')}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${typeFilter === 'manual' ? 'text-white' : ''}`}
                style={typeFilter === 'manual' ? { background: 'linear-gradient(135deg, #0ea5e9, #10b981)' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                <PenLine size={14} /> Manuels
              </button>

              <button
                onClick={fetchPublicQuizzes}
                className="ml-auto inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider"
                style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}
              >
                <RefreshCw size={14} /> Actualiser
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveTag('all')}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${activeTag === 'all' ? 'text-white' : ''}`}
                style={activeTag === 'all' ? { backgroundColor: '#0f172a' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                Tous les tags
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.key}
                  onClick={() => setActiveTag(tag.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${activeTag === tag.key ? 'text-white' : ''}`}
                  style={activeTag === tag.key ? { background: 'linear-gradient(135deg, #f97316, #ef4444)' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  <Tag size={12} /> {tag.label} ({tag.count})
                </button>
              ))}
            </div>

            {normalizedSearch && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}>
                <Search size={14} /> Recherche active: "{searchQuery}"
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[430px] animate-pulse rounded-[30px] border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }} />
            ))}
          </div>
        ) : error ? (
          <div className="mt-10 rounded-3xl border p-8 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
            <p className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{error}</p>
            <button
              onClick={fetchPublicQuizzes}
              className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white"
            >
              Reessayer
            </button>
          </div>
        ) : (
          <>
            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>
                Quiz disponibles ({visibleQuizzes.length})
              </h2>
            </div>

            <AnimatePresence mode="popLayout">
              {visibleQuizzes.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-10 rounded-3xl border p-10 text-center"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                >
                  <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Aucun quiz ne correspond aux filtres.</p>
                  <p className="mx-auto mt-2 max-w-lg text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                    Essayez un autre tag ou une autre categorie. Vous pouvez aussi creer un nouveau quiz pour enrichir la bibliotheque.
                  </p>
                  <button
                    onClick={onCreateQuiz}
                    className="mt-5 rounded-2xl bg-linear-to-r from-violet-600 to-orange-500 px-6 py-3 text-sm font-black text-white"
                  >
                    Creer un quiz
                  </button>
                </motion.div>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {visibleQuizzes.map((quiz, index) => (
                    <PublicQuizCard
                      key={quiz.id_quiz}
                      quiz={quiz}
                      index={index}
                      onLaunch={onLaunchQuiz}
                      onOpenDetails={onOpenQuizDetails}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </section>
  );
};

export default PublicQuizGallery;
