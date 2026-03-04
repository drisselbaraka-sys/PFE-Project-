import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../utils/api';
import {
    Search, Plus, Sparkles, PenLine, Star, MoreVertical,
    Play, Edit3, Share2, Trash2, BookOpen,
    Trophy, Calendar, BarChart2, ArrowLeft, Zap, Loader2,
    AlertCircle, RefreshCw, ChevronDown, Clock
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Palette de couleurs pour les miniatures auto-générées
// ──────────────────────────────────────────────────────────
const THUMBNAIL_THEMES = [
    { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', icon: '🧠' },
    { bg: 'linear-gradient(135deg, #f59e0b, #ef4444)', icon: '🔥' },
    { bg: 'linear-gradient(135deg, #10b981, #3b82f6)', icon: '🌊' },
    { bg: 'linear-gradient(135deg, #ec4899, #f43f5e)', icon: '💎' },
    { bg: 'linear-gradient(135deg, #f97316, #facc15)', icon: '⚡' },
    { bg: 'linear-gradient(135deg, #14b8a6, #06b6d4)', icon: '🌿' },
    { bg: 'linear-gradient(135deg, #a855f7, #6366f1)', icon: '✨' },
    { bg: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)', icon: '🚀' },
];

// Simple hash to get consistent color for same quiz
const getThemeForId = (id) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash |= 0;
    }
    return THUMBNAIL_THEMES[Math.abs(hash) % THUMBNAIL_THEMES.length];
};

const LEVEL_COLORS = {
    'Débutant': { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981' },
    'Intermédiaire': { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b' },
    'Moyen': { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b' },
    'Expert': { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444' },
    'Difficile': { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444' },
};

// ──────────────────────────────────────────────────────────
// Menu trois points
// ──────────────────────────────────────────────────────────
const QuizActionsMenu = ({ quizId, onAction, lightMode = false }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const actions = [
        { id: 'play', icon: <Play size={15} />, label: 'Jouer', color: '#6366f1' },
        { id: 'edit', icon: <Edit3 size={15} />, label: 'Modifier', color: 'var(--text-primary)' },
        { id: 'share', icon: <Share2 size={15} />, label: 'Partager', color: 'var(--text-primary)' },
        { id: 'delete', icon: <Trash2 size={15} />, label: 'Supprimer', color: '#ef4444', danger: true },
    ];

    return (
        <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => setOpen((v) => !v)}
                className={`p-2 rounded-xl transition-colors ${lightMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 dark:hover:bg-white/5 text-(--text-muted)'}`}
            >
                <MoreVertical size={18} />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-50 mt-1 w-44 rounded-2xl shadow-2xl border overflow-hidden"
                        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)', right: 0 }}
                    >
                        {actions.map((a) => (
                            <button
                                key={a.id}
                                onClick={() => { onAction(a.id, quizId); setOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors ${a.danger ? 'hover:bg-red-50 dark:hover:bg-red-900/20' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                style={{ color: a.color }}
                            >
                                {a.icon}
                                {a.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ──────────────────────────────────────────────────────────
// Carte de Quiz
// ──────────────────────────────────────────────────────────
const QuizCard = ({ quiz, index, onAction, onToggleFavorite }) => {
    const theme = getThemeForId(quiz.id_quiz);
    const levelStyle = LEVEL_COLORS[quiz.difficulte_moyenne] || LEVEL_COLORS['Moyen'];
    const formattedDate = new Date(quiz.date_creation).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.055, type: 'spring', stiffness: 260, damping: 24 }}
            className="quiz-card group rounded-[32px] overflow-hidden border cursor-pointer transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col h-[480px]"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
        >
            {/* Upper Area (70%) - Image + Overlay Info */}
            <div className="relative h-[72%] overflow-hidden shrink-0">
                {quiz.image_couverture_url ? (
                    <img
                        src={quiz.image_couverture_url}
                        alt={quiz.titre}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div
                        className="w-full h-full flex flex-col items-center justify-center gap-2 transition-transform duration-700 group-hover:scale-110"
                        style={{ background: theme.bg }}
                    >
                        <span className="text-6xl select-none">{theme.icon}</span>
                    </div>
                )}

                {/* Gradient Protection for Text */}
                <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/40 to-transparent opacity-80" />

                {/* Top Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                    {quiz.type_creation === 'ai' ? (
                        <span className="flex items-center gap-1.5 bg-white/95 text-purple-700 text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md">
                            <Sparkles size={12} /> IA
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 bg-white/95 text-gray-700 text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md">
                            <PenLine size={12} /> MANUEL
                        </span>
                    )}
                </div>

                {/* Favorite Toggle */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(quiz.id_quiz); }}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white/90 shadow-lg transition-all hover:scale-110 active:scale-95 z-10"
                >
                    <Star
                        size={16}
                        className={quiz.is_favorited ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                    />
                </button>

                {/* Metadata Overlay (Pinned to Bottom) */}
                <div className="absolute bottom-0 left-0 w-full p-6 text-white space-y-3">
                    <div className="flex justify-between items-start gap-4">
                        <h3 className="font-black text-xl leading-tight line-clamp-2 flex-1 drop-shadow-md">
                            {quiz.titre}
                        </h3>
                        <QuizActionsMenu quizId={quiz.id_quiz} onAction={onAction} lightMode={true} />
                    </div>

                    {quiz.description && (
                        <p className="text-xs font-medium opacity-80 line-clamp-2 leading-relaxed max-w-[90%]">
                            {quiz.description}
                        </p>
                    )}

                    <div className="flex items-center gap-4 pt-1">
                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-90 bg-white/10 px-2 py-1 rounded-lg backdrop-blur-md">
                            <BookOpen size={12} />
                            {quiz.nombre_questions} QUESTIONS
                        </span>
                        {quiz.difficulte_moyenne && (
                            <span
                                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg backdrop-blur-md"
                                style={{ backgroundColor: `${levelStyle.bg}44`, color: '#fff', border: `1px solid ${levelStyle.bg}66` }}
                            >
                                <BarChart2 size={12} />
                                {quiz.difficulte_moyenne}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-60 ml-auto">
                            <Calendar size={12} />
                            {formattedDate}
                        </span>
                    </div>
                </div>
            </div>

            {/* Bottom Area (30%) - Action Button */}
            <div className="flex-1 flex items-center p-6 bg-transparent">
                <button
                    onClick={(e) => { e.stopPropagation(); onAction('play', quiz.id_quiz); }}
                    className="w-full flex items-center justify-center gap-3 py-4 rounded-[24px] font-black text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-indigo-500/20"
                    style={{ background: theme.bg }}
                >
                    <Play size={18} className="fill-white" />
                    Lancer le quiz
                </button>
            </div>
        </motion.div>
    );
};

// ──────────────────────────────────────────────────────────
// État Vide
// ──────────────────────────────────────────────────────────
const EmptyState = ({ filter, onCreateClick }) => (
    <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="col-span-full flex flex-col items-center justify-center py-28 text-center"
    >
        <div
            className="w-32 h-32 rounded-3xl flex items-center justify-center text-5xl mb-8 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
            🎯
        </div>
        <h3 className="text-2xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>
            {filter === 'favorites' ? 'Aucun quiz favori'
                : filter === 'ai' ? 'Aucun quiz généré par IA'
                    : filter === 'manual' ? 'Aucun quiz manuel'
                        : 'Vous n\'avez pas encore de quiz'}
        </h3>
        <p className="max-w-sm font-medium mb-8" style={{ color: 'var(--text-muted)' }}>
            {filter === 'all' || filter === 'ai'
                ? 'Laissez l\'IA créer un quiz personnalisé pour vous en quelques secondes !'
                : 'Créez un quiz ou marquez-en un comme favori.'}
        </p>
        <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCreateClick}
            className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm text-white shadow-xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
            <Sparkles size={16} />
            Créer un quiz avec l'IA
        </motion.button>
    </motion.div>
);

// ──────────────────────────────────────────────────────────
// Composant Principal
// ──────────────────────────────────────────────────────────
const MyQuizzes = ({ currentUser, onClose, onCreateClick, onEditQuiz, onLaunchQuiz }) => {
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [shareNotif, setShareNotif] = useState(false);
    const [sortBy, setSortBy] = useState('date_desc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortRef = useRef(null);

    // ── Sorting Options ──
    const sortOptions = [
        { id: 'date_desc', label: 'Plus récent', icon: <Calendar size={14} /> },
        { id: 'date_asc', label: 'Plus ancien', icon: <Calendar size={14} /> },
        { id: 'questions_desc', label: 'Plus de questions', icon: <BookOpen size={14} /> },
        { id: 'questions_asc', label: 'Moins de questions', icon: <BookOpen size={14} /> },
        { id: 'difficulty_desc', label: 'Plus difficile', icon: <BarChart2 size={14} /> },
        { id: 'difficulty_asc', label: 'Plus facile', icon: <BarChart2 size={14} /> },
        { id: 'time_desc', label: 'Plus long', icon: <Clock size={14} /> },
        { id: 'time_asc', label: 'Plus court', icon: <Clock size={14} /> },
        { id: 'clonable', label: 'Clonable uniquement', icon: <Plus size={14} /> },
        { id: 'visibility', label: 'Public d\'abord', icon: <Share2 size={14} /> },
    ];

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (sortRef.current && !sortRef.current.contains(e.target)) setIsSortOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Fetch real quizzes from backend ──
    const fetchQuizzes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get('/quiz/me');
            setQuizzes(data);
        } catch (err) {
            console.error('[MyQuizzes] Erreur chargement quiz:', err);
            setError('Impossible de charger vos quiz. Vérifiez votre connexion.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchQuizzes();
    }, [fetchQuizzes]);

    const filters = [
        { id: 'all', label: 'Tous', icon: <Zap size={13} /> },
        { id: 'ai', label: 'Générés par IA', icon: <Sparkles size={13} /> },
        { id: 'manual', label: 'Manuels', icon: <PenLine size={13} /> },
        { id: 'favorites', label: 'Favoris', icon: <Star size={13} /> },
    ];

    const filtered = quizzes
        .filter((q) => {
            const matchSearch = q.titre.toLowerCase().includes(search.toLowerCase()) ||
                (q.description && q.description.toLowerCase().includes(search.toLowerCase()));
            if (!matchSearch) return false;
            if (activeFilter === 'ai') return q.type_creation === 'ai';
            if (activeFilter === 'manual') return q.type_creation === 'manual';
            if (activeFilter === 'favorites') return q.is_favorited;
            return true;
        })
        .sort((a, b) => {
            switch (sortBy) {
                case 'date_desc': return new Date(b.date_creation) - new Date(a.date_creation);
                case 'date_asc': return new Date(a.date_creation) - new Date(b.date_creation);
                case 'questions_desc': return b.nombre_questions - a.nombre_questions;
                case 'questions_asc': return a.nombre_questions - b.nombre_questions;
                case 'difficulty_desc': {
                    const levels = { 'Débutant': 1, 'Moyen': 2, 'Difficile': 3, 'Expert': 4 };
                    return (levels[b.difficulte_moyenne] || 0) - (levels[a.difficulte_moyenne] || 0);
                }
                case 'difficulty_asc': {
                    const levels = { 'Débutant': 1, 'Moyen': 2, 'Difficile': 3, 'Expert': 4 };
                    return (levels[a.difficulte_moyenne] || 0) - (levels[b.difficulte_moyenne] || 0);
                }
                case 'time_desc': return (b.duree_max_minutes || 0) - (a.duree_max_minutes || 0);
                case 'time_asc': return (a.duree_max_minutes || 0) - (b.duree_max_minutes || 0);
                case 'clonable': return (b.is_clonable ? 1 : 0) - (a.is_clonable ? 1 : 0);
                case 'visibility': return (b.visibilite === 'public' ? 1 : 0) - (a.visibilite === 'public' ? 1 : 0);
                default: return 0;
            }
        });

    const handleAction = async (action, quizId) => {
        if (action === 'delete') {
            try {
                await api.delete(`/quiz/${quizId}`);
                setQuizzes((prev) => prev.filter((q) => q.id_quiz !== quizId));
            } catch (err) {
                alert('Erreur lors de la suppression du quiz.');
            }
        } else if (action === 'share') {
            navigator.clipboard.writeText(`${window.location.origin}/quiz/${quizId}`).catch(() => { });
            setShareNotif(true);
            setTimeout(() => setShareNotif(false), 2500);
        } else if (action === 'play') {
            onLaunchQuiz(quizId);
        } else if (action === 'edit') {
            try {
                setLoading(true);
                const fullQuiz = await api.get(`/quiz/${quizId}`);
                onEditQuiz(fullQuiz); // Pass the full quiz (with questions) to App.jsx
            } catch (err) {
                console.error('[MyQuizzes] Erreur chargement détails quiz:', err);
                alert('Impossible de charger les détails du quiz pour modification.');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleToggleFavorite = async (quizId) => {
        // Optimistic update
        setQuizzes((prev) =>
            prev.map((q) => q.id_quiz === quizId ? { ...q, is_favorited: !q.is_favorited } : q)
        );
        try {
            await api.post(`/quiz/${quizId}/favorite`, {});
        } catch (err) {
            // Revert on error
            setQuizzes((prev) =>
                prev.map((q) => q.id_quiz === quizId ? { ...q, is_favorited: !q.is_favorited } : q)
            );
        }
    };

    const totalCompleted = quizzes.filter((q) => q.best_score !== null && q.best_score !== undefined).length;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen transition-colors duration-500"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
        >
            {/* ── Hero Banner ── */}
            <div
                className="relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)' }}
            >
                <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-white/5 blur-3xl" />

                <div className="relative max-w-7xl mx-auto px-6 py-12 pb-20">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 text-white/70 hover:text-white mb-8 transition-colors font-semibold text-sm"
                    >
                        <ArrowLeft size={18} />
                        Retour au tableau de bord
                    </button>
                    <div className="flex items-end justify-between">
                        <div>
                            <h1 className="text-4xl font-black text-white mb-2">Mes Quiz 📚</h1>
                            <p className="text-white/70 font-medium">
                                {quizzes.length} quiz créé{quizzes.length !== 1 ? 's' : ''} •{' '}
                                {quizzes.filter((q) => q.is_favorited).length} favori{quizzes.filter((q) => q.is_favorited).length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={onCreateClick}
                            className="hidden md:flex items-center gap-2 bg-white text-purple-700 font-black px-6 py-3 rounded-2xl shadow-xl text-sm"
                        >
                            <Plus size={18} />
                            Nouveau Quiz
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* ── Toolbar (floats over banner) ── */}
            <div className="max-w-7xl mx-auto px-6 -mt-8 mb-8 relative z-10">
                <div
                    className="rounded-3xl shadow-xl border p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 transition-all duration-500"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                >
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Rechercher un quiz…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 rounded-2xl outline-none text-sm font-semibold transition-all"
                            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                        />
                    </div>

                    {/* Filter pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {filters.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setActiveFilter(f.id)}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all"
                                style={{
                                    backgroundColor: activeFilter === f.id ? '#6366f1' : 'var(--bg-elevated)',
                                    color: activeFilter === f.id ? '#fff' : 'var(--text-muted)',
                                    boxShadow: activeFilter === f.id ? '0 4px 14px rgba(99,102,241,0.35)' : 'none',
                                }}
                            >
                                {f.icon}
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Sorting Dropdown */}
                    <div className="relative" ref={sortRef}>
                        <button
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border border-(--glass-border)"
                            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                        >
                            <BarChart2 size={13} className="text-indigo-500" />
                            <span>Trier par: {sortOptions.find(o => o.id === sortBy)?.label}</span>
                            <ChevronDown size={14} className={`transition-transform duration-300 ${isSortOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {isSortOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl border z-50 overflow-hidden"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                >
                                    <div className="max-h-80 overflow-y-auto custom-scrollbar p-2">
                                        {sortOptions.map((opt) => (
                                            <button
                                                key={opt.id}
                                                onClick={() => { setSortBy(opt.id); setIsSortOpen(false); }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${sortBy === opt.id ? 'bg-indigo-600 text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                style={{ color: sortBy === opt.id ? '#fff' : 'var(--text-primary)' }}
                                            >
                                                <span className={sortBy === opt.id ? 'text-white' : 'text-indigo-500'}>{opt.icon}</span>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Mobile create button */}
                    <button
                        onClick={onCreateClick}
                        className="md:hidden flex items-center justify-center gap-2 bg-purple-600 text-white font-black px-5 py-3 rounded-2xl text-sm shrink-0"
                    >
                        <Plus size={16} />
                        Nouveau
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="max-w-8xl mx-auto px-6 pb-20">
                {/* Loading state */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                            <Loader2 size={40} className="text-purple-500" />
                        </motion.div>
                        <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                            Chargement de vos quiz…
                        </p>
                    </div>
                )}

                {/* Error state */}
                {!loading && error && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-20 gap-5 text-center"
                    >
                        <div className="w-20 h-20 rounded-3xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                            <AlertCircle size={36} className="text-red-400" />
                        </div>
                        <p className="font-bold max-w-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                        <button
                            onClick={fetchQuizzes}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-purple-600 text-white font-black text-sm"
                        >
                            <RefreshCw size={15} />
                            Réessayer
                        </button>
                    </motion.div>
                )}

                {/* Quiz Grid */}
                {!loading && !error && (
                    <AnimatePresence mode="popLayout">
                        {filtered.length === 0 ? (
                            <div className="grid">
                                <EmptyState filter={activeFilter} onCreateClick={onCreateClick} />
                            </div>
                        ) : (
                            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                                <AnimatePresence>
                                    {filtered.map((quiz, i) => (
                                        <QuizCard
                                            key={quiz.id_quiz}
                                            quiz={quiz}
                                            index={i}
                                            onAction={handleAction}
                                            onToggleFavorite={handleToggleFavorite}
                                        />
                                    ))}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* ── Share toast ── */}
            <AnimatePresence>
                {shareNotif && (
                    <motion.div
                        initial={{ opacity: 0, y: 32 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 32 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-gray-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl font-bold text-sm z-999"
                    >
                        <Share2 size={16} className="text-purple-400" />
                        Lien copié dans le presse-papier !
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default MyQuizzes;
