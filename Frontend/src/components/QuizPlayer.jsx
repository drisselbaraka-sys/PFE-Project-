import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, ArrowRight, Clock, Trophy, Check, Rocket, Brain, HelpCircle, ChevronRight
} from 'lucide-react';

const TypographyStyle = () => (
    <style>
        {`
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=Inter:wght@100..900&display=swap');
            .font-outfit { font-family: 'Outfit', sans-serif; }
            .font-inter { font-family: 'Inter', sans-serif; }
            .glass-card {
                background: rgba(255, 255, 255, 0.7);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
            .enthusiast-gradient {
                background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
            }
            .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(99, 102, 241, 0.1);
                border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: rgba(99, 102, 241, 0.2);
            }
        `}
    </style>
);

const QuizPlayer = ({ quiz, onClose, isReview = false, onPublish }) => {
    const questions = quiz.questions || [];
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [isGlobalTimeUp, setIsGlobalTimeUp] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [isBilan, setIsBilan] = useState(false);
    const timerRef = useRef(null);

    const q = questions[currentIndex];

    // Logic for scoring
    const score = questions.reduce((acc, currentQ, idx) => {
        const ans = userAnswers[idx];
        if (!ans) return acc;
        const correct = currentQ.reponse_correcte;
        const isMatch = Array.isArray(correct)
            ? (Array.isArray(ans) && ans.length === correct.length && ans.every(v => correct.includes(v)))
            : ans === correct;
        return isMatch ? acc + 1 : acc;
    }, 0);

    const accuracy = Math.round((score / questions.length) * 100);

    const getAdvice = () => {
        if (accuracy >= 90) return "Impressionnant ! Vous maîtrisez parfaitement ce sujet. Pourquoi ne pas essayer un niveau plus difficile ou partager votre savoir ?";
        if (accuracy >= 70) return "Très bon travail ! Vous avez une base solide. Révisez les quelques points d'ombre pour atteindre la perfection.";
        if (accuracy >= 50) return "Pas mal ! Vous avez compris l'essentiel, mais une petite révision des concepts clés vous aiderait à progresser.";
        return "C'est un début ! Ne vous découragez pas, l'apprentissage est un marathon. Prenez le temps de relire les explications pour chaque erreur.";
    };

    const timeMode = (quiz.parametres_generation?.time_mode) || 'Timer Global';
    const timeLimit = (quiz.parametres_generation?.time_value) || quiz.duree_max_minutes || 10;
    const showImmediateFeedback = isBilan ? true : ((quiz.parametres_generation?.show_immediate_feedback) ?? true);

    useEffect(() => {
        if (timeMode === 'Pas de limite' || isBilan) return;
        let initialTime = timeMode === 'Mode Chrono' ? timeLimit : timeLimit * 60;
        setTimeLeft(initialTime);
        setIsGlobalTimeUp(false);
    }, [timeMode, timeLimit, isBilan]);

    useEffect(() => {
        if (timeMode === 'Pas de limite' || isGlobalTimeUp || isFinished || isBilan) return;
        if (timeMode === 'Mode Chrono') setTimeLeft(timeLimit);
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    if (timeMode === 'Timer Global') setIsGlobalTimeUp(true);
                    else if (timeMode === 'Mode Chrono' && !userAnswers[currentIndex]) {
                        handleSelectOption('TIMEOUT_NO_ANSWER');
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [currentIndex, timeMode, isGlobalTimeUp, isFinished, isBilan]);

    const handleSelectOption = (opt) => {
        if (isBilan) return; // Disable selection in bilan mode
        if (userAnswers[currentIndex] && showImmediateFeedback) return;
        if (isGlobalTimeUp || isFinished) return;

        if (q.type_question === 'Plusieurs Réponses') {
            setUserAnswers(prev => {
                const current = prev[currentIndex] || [];
                const updated = current.includes(opt)
                    ? current.filter(o => o !== opt)
                    : [...current, opt];
                return { ...prev, [currentIndex]: updated };
            });
        } else {
            setUserAnswers(prev => ({ ...prev, [currentIndex]: opt }));
            if (timeMode === 'Mode Chrono') clearInterval(timerRef.current);
        }
    };

    const isAnswered = q?.type_question === 'Plusieurs Réponses'
        ? (userAnswers[currentIndex]?.length > 0 && (userAnswers[currentIndex + '_locked'] || !showImmediateFeedback))
        : !!userAnswers[currentIndex];

    const isCorrect = Array.isArray(q?.reponse_correcte)
        ? (Array.isArray(userAnswers[currentIndex]) && userAnswers[currentIndex].length === q.reponse_correcte.length && userAnswers[currentIndex].every(v => q.reponse_correcte.includes(v)))
        : userAnswers[currentIndex] === q?.reponse_correcte;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex flex-col md:flex-row h-full w-full overflow-hidden font-inter transition-colors duration-500"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
        >
            <TypographyStyle />
            {/* Sidebar Navigation */}
            <div className="w-full md:w-80 border-r flex flex-col p-6 z-10 shrink-0 backdrop-blur-xl transition-all duration-500"
                style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}>
                <div className="mb-4">
                    {isBilan ? (
                        <button
                            onClick={() => { setIsFinished(true); setIsBilan(false); }}
                            className="p-2 hover:bg-indigo-500/10 rounded-2xl transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-indigo-500"
                        >
                            <ArrowRight size={16} className="rotate-180" /> Retour au résumé
                        </button>
                    ) : (
                        <button onClick={onClose} className="p-2 hover:bg-slate-500/10 rounded-2xl transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                            <X size={16} /> {isReview ? 'Annuler' : 'Quitter'}
                        </button>
                    )}
                </div>

                <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {/* Score Card */}
                    <div className="enthusiast-gradient rounded-2xl p-4 text-white">
                        <div className="flex justify-between items-center mb-2">
                            <Trophy size={20} className="text-amber-300" />
                            <span className="text-[10px] font-black opacity-60 uppercase tracking-widest">Score</span>
                        </div>
                        <div className="text-2xl font-black mb-1">{score} <span className="text-xs opacity-60 font-bold">/ {questions.length}</span></div>
                        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-white" animate={{ width: `${(score / questions.length) * 100}%` }} />
                        </div>
                    </div>

                    {/* Timer Card */}
                    {timeMode !== 'Pas de limite' && (
                        <div className={`p-4 rounded-2xl border-2 transition-all duration-500 ${timeLeft < 10 ? 'bg-red-500/10 border-red-500/50 animate-pulse' : ''}`}
                            style={{ backgroundColor: timeLeft < 10 ? 'transparent' : 'var(--bg-elevated)', borderColor: timeLeft < 10 ? '' : 'var(--border)' }}>
                            <div className="flex items-center gap-3 mb-1">
                                <Clock size={14} className={timeLeft < 10 ? 'text-red-500' : 'opacity-50'} />
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Temps</span>
                            </div>
                            <div className={`text-xl font-black ${timeLeft < 10 ? 'text-red-500' : ''}`} style={{ color: timeLeft < 10 ? '' : 'var(--text-primary)' }}>
                                {timeMode === 'Timer Global' ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}` : `${timeLeft}s`}
                            </div>
                        </div>
                    )}

                    {/* Question Indicators */}
                    <div className="grid grid-cols-5 gap-2 pt-4 px-2">
                        {questions.map((_, idx) => {
                            const isAnsweredIdx = !!userAnswers[idx];
                            const isCorrectIdx = Array.isArray(questions[idx].reponse_correcte)
                                ? (Array.isArray(userAnswers[idx]) && userAnswers[idx].length === questions[idx].reponse_correcte.length && userAnswers[idx].every(v => questions[idx].reponse_correcte.includes(v)))
                                : userAnswers[idx] === questions[idx].reponse_correcte;

                            return (
                                <button
                                    key={idx}
                                    onClick={() => !isGlobalTimeUp && setCurrentIndex(idx)}
                                    className={`w-full aspect-square rounded-xl flex items-center justify-center font-bold text-xs transition-all border-2
                                    ${currentIndex === idx ? 'bg-indigo-600 text-white border-indigo-600 scale-110 shadow-lg shadow-indigo-500/20' :
                                            isAnsweredIdx ?
                                                ((showImmediateFeedback || isGlobalTimeUp) ?
                                                    (isCorrectIdx ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500') :
                                                    'bg-indigo-500/20 text-indigo-500 border-indigo-500/30') :
                                                'border-transparent text-slate-400 hover:border-slate-500/20'}`}
                                    style={{ backgroundColor: currentIndex === idx ? '' : isAnsweredIdx ? '' : 'var(--bg-elevated)' }}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Navigation Controls */}
                <div className="mt-4 space-y-4 pt-4 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentIndex === 0 || isGlobalTimeUp}
                            className="p-3 bg-slate-500/10 rounded-xl font-bold disabled:opacity-30 transition-all flex items-center justify-center text-indigo-500"
                        >
                            <ArrowRight size={18} className="rotate-180" />
                        </button>
                        <button
                            onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                            disabled={currentIndex === questions.length - 1 || (!isAnswered && !showImmediateFeedback && !isGlobalTimeUp)}
                            className="p-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-30 hover:bg-indigo-700 transition-all flex items-center justify-center shadow-lg shadow-indigo-500/20"
                        >
                            <ArrowRight size={18} />
                        </button>
                    </div>

                    {!isBilan && (
                        <div className="space-y-2">
                            {isReview && (
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onPublish}
                                    className="w-full py-3 bg-black text-white rounded-xl font-black flex items-center justify-center gap-2 text-xs shadow-lg"
                                >
                                    PUBLIER <Rocket size={16} />
                                </motion.button>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setIsFinished(true)}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black flex items-center justify-center gap-2 text-xs shadow-lg shadow-indigo-500/20"
                            >
                                TERMINER <Check size={16} />
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 relative flex flex-col items-center custom-scrollbar">
                <div className="max-w-3xl w-full flex flex-col h-full pt-4 md:pt-12">
                    {/* Top Meta info */}
                    <div className="flex justify-between items-center w-full mb-6">
                        <span className="px-3 py-1 text-indigo-500 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                            {q?.type_question || 'MCQ'}
                        </span>
                        <div className="font-black text-[10px] uppercase tracking-widest opacity-50">
                            {currentIndex + 1} / {questions.length} Questions
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="w-full space-y-8"
                        >
                            <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">
                                {q?.texte_question}
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {q?.options_reponses.map((opt, idx) => {
                                    const isSelected = Array.isArray(userAnswers[currentIndex])
                                        ? userAnswers[currentIndex].includes(opt)
                                        : userAnswers[currentIndex] === opt;

                                    const isCorrectOpt = Array.isArray(q.reponse_correcte)
                                        ? q.reponse_correcte.includes(opt)
                                        : q.reponse_correcte === opt;

                                    let style = "border-transparent text-slate-400 hover:border-indigo-500/50 cursor-pointer shadow-sm transition-all duration-300";
                                    let bgStyle = { backgroundColor: 'var(--bg-elevated)' };

                                    if (isAnswered) {
                                        if (showImmediateFeedback || isGlobalTimeUp) {
                                            if (isCorrectOpt) {
                                                style = "border-green-500 text-green-500 border-2 cursor-default shadow-lg shadow-green-500/10";
                                                bgStyle = { backgroundColor: 'rgba(34, 197, 94, 0.1)' };
                                            } else if (isSelected) {
                                                style = "border-red-500 text-red-500 border-2 cursor-default shadow-lg shadow-red-500/10";
                                                bgStyle = { backgroundColor: 'rgba(239, 68, 68, 0.1)' };
                                            } else {
                                                style = "border-transparent opacity-30 cursor-default";
                                                bgStyle = { backgroundColor: 'var(--bg-elevated)' };
                                            }
                                        } else if (isSelected) {
                                            style = "border-indigo-500 text-indigo-500 border-2 shadow-lg shadow-indigo-500/10";
                                            bgStyle = { backgroundColor: 'rgba(99, 102, 241, 0.1)' };
                                        }
                                    }

                                    return (
                                        <motion.button
                                            key={idx}
                                            whileHover={(!isAnswered || !showImmediateFeedback) ? { y: -3, scale: 1.01 } : {}}
                                            onClick={() => handleSelectOption(opt)}
                                            disabled={(isAnswered && showImmediateFeedback) || isGlobalTimeUp}
                                            className={`group relative transition-all text-left font-bold flex items-center p-5 rounded-2xl min-h-[90px] text-lg border-2 ${style}`}
                                            style={bgStyle}
                                        >
                                            <div className={`rounded-xl flex items-center justify-center shrink-0 mr-4 font-black text-sm border-2 transition-colors w-10 h-10
                                                ${(isAnswered && (showImmediateFeedback || isGlobalTimeUp)) ?
                                                    (isCorrectOpt ? 'bg-green-500 border-green-500 text-white' : isSelected ? 'bg-red-500 border-red-500 text-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400') :
                                                    (isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-800/50 border-white/5 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600')}`}>
                                                {String.fromCharCode(65 + idx)}
                                            </div>
                                            <span className="flex-1 leading-snug">{opt}</span>

                                            {(showImmediateFeedback || isGlobalTimeUp) && isAnswered && isCorrectOpt && (
                                                <div className="ml-3 p-1.5 bg-green-500 rounded-full text-white shrink-0 shadow-lg">
                                                    <Check size={14} strokeWidth={4} />
                                                </div>
                                            )}
                                            {(showImmediateFeedback || isGlobalTimeUp) && isSelected && !isCorrectOpt && (
                                                <div className="ml-3 p-1.5 bg-red-500 rounded-full text-white shrink-0 shadow-lg">
                                                    <X size={14} strokeWidth={4} />
                                                </div>
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* Multi-answer validation */}
                            {q?.type_question === 'Plusieurs Réponses' && showImmediateFeedback && !isAnswered && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => setUserAnswers(prev => ({ ...prev, [currentIndex + '_locked']: true }))}
                                    disabled={!userAnswers[currentIndex] || userAnswers[currentIndex].length === 0}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all disabled:opacity-30 mt-4 uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20"
                                >
                                    Valider ma sélection
                                </motion.button>
                            )}

                            {/* Feedback Reveal */}
                            {((isAnswered && showImmediateFeedback) || isGlobalTimeUp) && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`p-8 rounded-[32px] border-l-8 transition-all duration-500 border`}
                                    style={{
                                        backgroundColor: 'var(--bg-surface)',
                                        borderColor: isCorrect ? '#22c55e33' : '#ef444433',
                                        borderLeftColor: isCorrect ? '#22c55e' : '#ef4444'
                                    }}
                                >
                                    <div className="flex items-start gap-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-xl ${isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                            {isCorrect ? <Trophy size={28} /> : (isGlobalTimeUp && !isAnswered ? <Clock size={28} /> : <Brain size={28} />)}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                                                    {isCorrect ? 'Excellent !' : (isGlobalTimeUp && !isAnswered ? 'Temps écoulé' : 'Réponse incorrecte')}
                                                </h4>
                                                <span className="h-px flex-1 bg-slate-500/10"></span>
                                            </div>
                                            <p className="font-bold text-lg leading-relaxed">
                                                {isGlobalTimeUp && !isAnswered ? "Le temps imparti est écoulé." : (q?.explication || "Pas d'explication supplémentaire.")}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Results Modal/Overlay */}
            <AnimatePresence>
                {(isFinished || (isGlobalTimeUp && timeMode === 'Timer Global')) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-100 flex items-center justify-center p-6 backdrop-blur-md bg-black/60"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="max-w-md w-full p-8 rounded-[40px] text-center border shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                        >
                            <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 flex items-center justify-center mx-auto mb-6">
                                <Trophy size={40} className="text-indigo-500" />
                            </div>

                            <h2 className="text-3xl font-black mb-1">Session terminée !</h2>
                            <p className="opacity-60 font-black uppercase tracking-widest text-[10px] mb-8">Résumé de vos performances</p>

                            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                                <div className="p-4 rounded-3xl bg-indigo-500/5 border border-indigo-500/10" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-indigo-500">Score Final</p>
                                    <p className="text-2xl font-black text-indigo-500">{score} <span className="text-sm opacity-40">/ {questions.length}</span></p>
                                </div>
                                <div className="p-4 rounded-3xl bg-emerald-500/5 border border-emerald-500/10" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-emerald-500">Précision</p>
                                    <p className="text-2xl font-black text-emerald-500">{accuracy}%</p>
                                </div>
                            </div>

                            <div className="bg-slate-500/5 rounded-3xl p-5 mb-8 text-left border border-slate-500/10" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 text-indigo-500 flex items-center gap-2">
                                    <Brain size={14} /> Conseil de l'IA
                                </p>
                                <p className="text-sm font-medium leading-relaxed italic opacity-80">
                                    "{getAdvice()}"
                                </p>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => {
                                        setIsBilan(true);
                                        setIsFinished(false);
                                        setIsGlobalTimeUp(false);
                                        setCurrentIndex(0);
                                    }}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 hover:scale-[1.02] transition-transform"
                                >
                                    Bilan de quiz <HelpCircle size={20} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-xs"
                                >
                                    Revenir au menu principal
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bilan Mode Overlay Footer Removed for sidebar integration */}
        </motion.div>
    );
};

export default QuizPlayer;
