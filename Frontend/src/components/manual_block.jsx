import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings,
    Eye,
    X,
    Clock,
    Check,
    Rocket,
    Plus,
    Trophy,
} from 'lucide-react';

const CreateCenter = ({
    step,
    quizData,
    setQuizData,
    questions,
    setQuestions,
    handlePublish,
    isLoading,
    editingQuiz,
}) => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col relative"
            >
{step === 'manual_editor' && (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Sidebar Configuration */}
                        <aside className="w-80 border-r flex flex-col p-8 transition-colors duration-500"
                            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                            <div className="flex items-center gap-3 mb-8" style={{ color: 'var(--text-primary)' }}>
                                <Settings size={20} style={{ color: 'var(--accent)' }} />
                                <h2 className="font-black text-lg">Configuration</h2>
                            </div>

                            <div className="space-y-6 flex-1 overflow-y-auto">
                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest mb-2 opacity-50" style={{ color: 'var(--text-secondary)' }}>Titre du Quiz</label>
                                    <input
                                        type="text"
                                        value={quizData.titre}
                                        onChange={(e) => setQuizData({ ...quizData, titre: e.target.value })}
                                        className="w-full border-2 border-transparent rounded-xl px-4 py-3 outline-none focus:border-purple-300 transition-all font-bold"
                                        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                        placeholder="Ex: Les secrets de Mars"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest mb-2 opacity-50" style={{ color: 'var(--text-secondary)' }}>Difficulté</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['Facile', 'Moyen', 'Difficile'].map(d => (
                                            <button
                                                key={d}
                                                onClick={() => setQuizData({ ...quizData, difficulte_moyenne: d })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all border duration-300 ${quizData.difficulte_moyenne === d ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                style={{ backgroundColor: quizData.difficulte_moyenne === d ? '' : 'var(--bg-elevated)', color: quizData.difficulte_moyenne === d ? '' : 'var(--text-primary)' }}
                                            >
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest mb-2 opacity-50" style={{ color: 'var(--text-secondary)' }}>Visibilité</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setQuizData({ ...quizData, visibilite: 'public' })}
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-300 ${quizData.visibilite === 'public' ? 'border-indigo-600 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                            style={{ backgroundColor: quizData.visibilite === 'public' ? 'rgba(79, 70, 229, 0.1)' : 'var(--bg-elevated)', color: quizData.visibilite === 'public' ? 'var(--accent)' : 'var(--text-primary)' }}
                                        >
                                            <Eye size={16} /> <span className="text-xs font-bold">Public</span>
                                        </button>
                                        <button
                                            onClick={() => setQuizData({ ...quizData, visibilite: 'private' })}
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-300 ${quizData.visibilite === 'private' ? 'border-indigo-600 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                            style={{ backgroundColor: quizData.visibilite === 'private' ? 'rgba(79, 70, 229, 0.1)' : 'var(--bg-elevated)', color: quizData.visibilite === 'private' ? 'var(--accent)' : 'var(--text-primary)' }}
                                        >
                                            <X size={16} /> <span className="text-xs font-bold">Privé</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest mb-2 opacity-50" style={{ color: 'var(--text-secondary)' }}>Temps (min)</label>
                                    <div className="flex items-center gap-4 p-3 rounded-xl border-2 border-transparent transition-all"
                                        style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                        <Clock size={18} className="opacity-50" style={{ color: 'var(--text-secondary)' }} />
                                        <input
                                            type="number"
                                            value={quizData.duree_max_minutes}
                                            onChange={(e) => setQuizData({ ...quizData, duree_max_minutes: parseInt(e.target.value) })}
                                            className="w-full outline-none font-bold bg-transparent"
                                            style={{ color: 'var(--text-primary)' }}
                                            min="1"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t mt-6 space-y-3 transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handlePublish}
                                    disabled={isLoading || !quizData.titre || questions.length === 0}
                                    className="w-full py-4 enthusiast-gradient text-white rounded-2xl font-black shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 disabled:opacity-20"
                                >
                                    {isLoading ? 'Enregistrement...' : (
                                        editingQuiz ? <>Sauvegarder les modifications <Check size={20} /></> : <>Publier Quiz <Rocket size={20} /></>
                                    )}
                                </motion.button>

                            </div>
                        </aside>

                        {/* Editor Main Area */}
                        <main className="flex-1 overflow-y-auto p-12 flex flex-col items-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)' }}>
                            <motion.div
                                className="w-full max-w-3xl space-y-12"
                                initial="hidden"
                                animate="visible"
                                variants={{
                                    visible: { transition: { staggerChildren: 0.1 } }
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <h2 className="text-3xl font-black transition-colors" style={{ color: 'var(--text-primary)' }}>Questions ({questions.length})</h2>
                                    <button
                                        onClick={() => setQuestions([...questions, { texte_question: '', type_question: 'MCQ', options_reponses: ['', '', '', ''], reponse_correcte: '', explication: '', points: 1 }])}
                                        className="flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-indigo-500/10"
                                        style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', color: 'var(--accent)' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(79, 70, 229, 0.2)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(79, 70, 229, 0.1)'}
                                    >
                                        <Plus size={20} /> Ajouter
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {questions.map((q, idx) => (
                                        <motion.div
                                            key={idx}
                                            variants={{
                                                hidden: { opacity: 0, y: 20 },
                                                visible: { opacity: 1, y: 0 }
                                            }}
                                            className="p-8 rounded-[32px] border-4 border-transparent transition-all hover:border-indigo-500/20 relative group"
                                            style={{ backgroundColor: 'var(--bg-surface)' }}
                                        >
                                            <div className="flex items-start gap-6 mb-6">
                                                <div className="w-12 h-12 text-white rounded-2xl flex items-center justify-center font-black text-xl shrink-0 enthusiast-gradient shadow-lg">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <textarea
                                                        placeholder="Votre question ici..."
                                                        className="w-full text-2xl font-bold bg-transparent border-none outline-none resize-none h-auto min-h-[60px] transition-colors"
                                                        style={{ color: 'var(--text-primary)' }}
                                                        rows="2"
                                                        value={q.texte_question}
                                                        onChange={(e) => {
                                                            const newQs = [...questions];
                                                            newQs[idx].texte_question = e.target.value;
                                                            setQuestions(newQs);
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {q.options_reponses.map((opt, optIdx) => (
                                                    <div
                                                        key={optIdx}
                                                        className={`relative flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-500 ${q.reponse_correcte === opt && opt !== '' ? 'border-green-500 shadow-lg shadow-green-500/10' : 'border-transparent'}`}
                                                        style={{ backgroundColor: q.reponse_correcte === opt && opt !== '' ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-elevated)' }}
                                                    >
                                                        <div
                                                            onClick={() => {
                                                                const newQs = [...questions];
                                                                newQs[idx].reponse_correcte = opt;
                                                                setQuestions(newQs);
                                                            }}
                                                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all duration-300 ${q.reponse_correcte === opt && opt !== '' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-500/30'}`}
                                                        >
                                                            {q.reponse_correcte === opt && opt !== '' && <Check size={14} strokeWidth={4} />}
                                                        </div>
                                                        <input
                                                            placeholder={`Option ${optIdx + 1}`}
                                                            value={opt}
                                                            onChange={(e) => {
                                                                const newQs = [...questions];
                                                                newQs[idx].options_reponses[optIdx] = e.target.value;
                                                                setQuestions(newQs);
                                                            }}
                                                            className="flex-1 bg-transparent border-none outline-none font-medium h-6 transition-colors"
                                                            style={{ color: 'var(--text-primary)' }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-8 pt-8 border-t flex items-center gap-6 justify-between transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                                                <div className="flex items-center gap-6">
                                                    <div className="flex items-center gap-3 px-4 py-2 rounded-xl transition-all" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                        <Trophy size={18} className="text-orange-400" />
                                                        <input
                                                            type="number"
                                                            value={q.points}
                                                            onChange={(e) => {
                                                                const newQs = [...questions];
                                                                newQs[idx].points = parseInt(e.target.value);
                                                                setQuestions(newQs);
                                                            }}
                                                            className="w-12 bg-transparent border-none outline-none font-black text-center"
                                                            style={{ color: 'var(--text-primary)' }}
                                                        />
                                                        <span className="text-xs font-black uppercase opacity-50" style={{ color: 'var(--text-secondary)' }}>Points</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                                                    className="opacity-50 hover:opacity-100 font-bold text-sm transition-colors text-red-500"
                                                >
                                                    Supprimer
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </motion.div>
                        </main>
                    </div>
                )}

                {step === 'success' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)' }}>
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="space-y-8"
                        >
                            <div className="w-40 h-40 bg-white/5 backdrop-blur-xl border-4 text-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl"
                                style={{ borderColor: 'var(--glass-border)' }}>
                                <Check size={80} strokeWidth={3} className="text-green-500" />
                            </div>
                            <div className="space-y-4">
                                <h1 className="text-6xl font-black font-outfit" style={{ color: 'var(--text-primary)' }}>BRAVO !</h1>
                                <h2 className="text-3xl font-black opacity-90" style={{ color: 'var(--accent)' }}>Quiz publié avec succès</h2>
                                <p className="text-xl font-medium max-w-md mx-auto opacity-70" style={{ color: 'var(--text-secondary)' }}>Votre défi magistral est maintenant prêt à conquérir le monde.</p>
                            </div>

                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="pt-8"
                            >
                                <Rocket size={48} className="mx-auto opacity-50" />
                            </motion.div>
                        </motion.div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default CreateCenter;