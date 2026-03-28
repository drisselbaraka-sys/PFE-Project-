import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../utils/api';
import { Check, ArrowRight, Sparkles, Rocket } from 'lucide-react';

const CATEGORIES = [
    { id: 'tech', label: 'Tech & Innovation', image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=400', icon: '💻' },
    { id: 'cinema', label: 'Cinéma & Séries', image: 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?auto=format&fit=crop&q=80&w=400', icon: '🎬' },
    { id: 'history', label: 'Histoire', image: 'https://images.unsplash.com/photo-1447069387593-a5de0862481e?auto=format&fit=crop&q=80&w=400', icon: '🏛️' },
    { id: 'science', label: 'Sciences', image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=400', icon: '🧪' },
    { id: 'sport', label: 'Sports', image: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=400', icon: '⚽' },
    { id: 'art', label: 'Art & Design', image: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&q=80&w=400', icon: '🎨' },
    { id: 'music', label: 'Musique', image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400', icon: '🎵' },
    { id: 'gaming', label: 'Gaming', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=400', icon: '🎮' }
];

const CATEGORY_FALLBACK_IMAGES = {
    tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=400',
    cinema: 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?auto=format&fit=crop&q=80&w=400',
    history: 'https://images.unsplash.com/photo-1447069387593-a5de0862481e?auto=format&fit=crop&q=80&w=400',
    science: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=400',
    sport: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=400',
    art: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&q=80&w=400',
    music: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400',
    gaming: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=400',
};

const ONBOARDING_STEPS = 4;

const Onboarding = ({ user, onComplete }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        frequency: '', // occasional, regular, passionate
        interests: [],
        goal: '' // learn, create, challenge
    });
    const [isLoading, setIsLoading] = useState(false);

    const toggleInterest = (id) => {
        setFormData(prev => ({
            ...prev,
            interests: prev.interests.includes(id)
                ? prev.interests.filter(i => i !== id)
                : [...prev.interests, id]
        }));
    };

    const handleNext = () => setStep(prev => Math.min(prev + 1, ONBOARDING_STEPS));
    const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

    const handleFinish = async () => {
        setIsLoading(true);
        try {
            const updatedUser = await api.put('/auth/preferences', {
                preferences: {
                    ...formData,
                    onboarding_completed: true,
                    date_completed: new Date().toISOString()
                }
            });

            sessionStorage.setItem('qvibe_user', JSON.stringify(updatedUser));
            onComplete(updatedUser);
        } catch (err) {
            console.error("Failed to save preferences:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const progressPercentage = (step / ONBOARDING_STEPS) * 100;

    return (
        <div className="fixed inset-0 z-1000 flex flex-col overflow-hidden hide-scrollbar transition-colors duration-500"
            style={{ backgroundColor: 'var(--bg-base)' }}>
            {/* Ultra Thin Progress Bar at the very top */}
            <div className="fixed top-0 left-0 w-full h-1 z-50" style={{ backgroundColor: 'var(--bg-surface)' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    className="h-full bg-linear-to-r from-purple-600 to-indigo-600 transition-all duration-500"
                />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 py-20 overflow-y-auto hide-scrollbar">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -30 }}
                            className="text-center max-w-2xl"
                        >
                            <div className="relative inline-block mb-10">
                                <div className="w-40 h-40 rounded-full overflow-hidden border-8 transition-all duration-500"
                                    style={{ borderColor: 'var(--glass-border)' }}>
                                    <img
                                        src={user?.photo_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user?.id_utilisateur}
                                        alt="Profile"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <motion.div
                                    animate={{ rotate: [0, 15, 0], scale: [1, 1.2, 1] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="absolute -bottom-2 -right-2 rounded-full p-3 border text-3xl transition-colors duration-500"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                >
                                    🚀
                                </motion.div>
                            </div>

                            <h1 className="text-5xl font-black mb-6 bg-linear-to-r from-purple-500 via-indigo-500 to-blue-500 bg-clip-text text-transparent leading-tight pb-2">
                                C'est le début de l'aventure, {user?.nom_affichage || 'Aventurier'} !
                            </h1>
                            <h2 className="text-2xl mb-12 font-medium transition-colors duration-500" style={{ color: 'var(--text-secondary)' }}>
                                Personnalisons ton univers Qvibe en quelques secondes.
                            </h2>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleNext}
                                className="px-12 py-5 bg-indigo-600 text-white rounded-3xl font-black text-xl transition-all flex items-center gap-4 mx-auto"
                            >
                                C'est parti <ArrowRight size={26} />
                            </motion.button>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="w-full max-w-4xl text-center"
                        >
                            <h2 className="text-4xl font-black mb-4 transition-colors" style={{ color: 'var(--text-primary)' }}>Quel est ton rythme de jeu ?</h2>
                            <p className="text-xl mb-12 opacity-70 transition-colors" style={{ color: 'var(--text-secondary)' }}>Cela nous aide à te proposer les bons défis au bon moment.</p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 items-stretch">
                                {[
                                    { id: 'occasional', label: 'Occasionnel', icon: '☕', desc: 'Quelques quiz par semaine pour se détendre.' },
                                    { id: 'regular', label: 'Régulier', icon: '⚡', desc: 'Un quiz par jour pour garder la forme.' },
                                    { id: 'passionate', label: 'Passionné', icon: '🔥', desc: 'Prêt à tout dévorer et monter au classement.' }
                                ].map(opt => (
                                    <motion.div
                                        key={opt.id}
                                        whileHover={{ y: -8 }}
                                        onClick={() => setFormData(prev => ({ ...prev, frequency: opt.id }))}
                                        className={`p-8 rounded-4xl border-4 transition-all cursor-pointer text-left flex flex-col h-[280px] duration-500 ${formData.frequency === opt.id
                                            ? 'border-indigo-600 scale-[1.02]'
                                            : 'border-transparent'
                                            }`}
                                        style={{
                                            backgroundColor: formData.frequency === opt.id ? 'rgba(79, 70, 229, 0.1)' : 'var(--bg-surface)',
                                            borderColor: formData.frequency === opt.id ? 'var(--accent)' : 'var(--glass-border)'
                                        }}
                                    >
                                        <span className="text-4xl mb-4 block">{opt.icon}</span>
                                        <h3 className="text-xl font-black mb-2 transition-colors" style={{ color: 'var(--text-primary)' }}>{opt.label}</h3>
                                        <p className="text-sm font-medium leading-relaxed flex-1 opacity-50 transition-colors" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</p>
                                        <div className="h-6 flex items-center">
                                            {formData.frequency === opt.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="font-bold flex items-center gap-2 text-sm"
                                                    style={{ color: 'var(--accent)' }}
                                                >
                                                    <Check size={16} strokeWidth={3} /> Sélectionné
                                                </motion.div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="flex justify-center items-center gap-6">
                                <button onClick={handleBack} className="px-8 py-4 font-bold transition-all opacity-50 hover:opacity-100" style={{ color: 'var(--text-primary)' }}>Retour</button>
                                <motion.button
                                    disabled={!formData.frequency}
                                    whileHover={formData.frequency ? { scale: 1.05 } : {}}
                                    onClick={handleNext}
                                    className={`px-12 py-4 rounded-2xl font-black text-lg transition-all ${formData.frequency ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/20'
                                        }`}
                                >
                                    Suivant
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="w-full max-w-5xl"
                        >
                            <div className="text-center mb-12">
                                <h2 className="text-4xl font-black mb-4 transition-colors" style={{ color: 'var(--text-primary)' }}>Tes centres d'intérêt</h2>
                                <p className="text-xl opacity-70 transition-colors" style={{ color: 'var(--text-secondary)' }}>Choisis au moins 3 thèmes pour ton flux personnalisé.</p>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                                {CATEGORIES.map((cat) => (
                                    <motion.div
                                        key={cat.id}
                                        whileHover={{ scale: 1.02, y: -5 }}
                                        onClick={() => toggleInterest(cat.id)}
                                        className={`relative aspect-video rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 border-2 ${formData.interests.includes(cat.id)
                                            ? 'border-indigo-600 scale-105 z-10'
                                            : 'border-transparent'
                                            }`}
                                    >
                                        <img
                                            src={cat.image}
                                            alt={cat.label}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            onError={(event) => {
                                                if (event.currentTarget.dataset.fallbackApplied === '1') return;
                                                event.currentTarget.dataset.fallbackApplied = '1';
                                                event.currentTarget.src = CATEGORY_FALLBACK_IMAGES[cat.id] || CATEGORY_FALLBACK_IMAGES.tech;
                                            }}
                                        />
                                        <div className={`absolute inset-0 transition-all duration-500 ${formData.interests.includes(cat.id) ? 'bg-indigo-900/40 backdrop-blur-xs' : 'bg-black/40'}`} />
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                                            <span className="text-3xl mb-1">{cat.icon}</span>
                                            <h3 className="text-white font-black">{cat.label}</h3>
                                            {formData.interests.includes(cat.id) && <Check className="text-white mt-1" size={24} strokeWidth={4} />}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="flex flex-col items-center gap-6">
                                <div className="flex items-center gap-8">
                                    <button
                                        onClick={handleBack}
                                        className="px-8 py-4 font-bold transition-all opacity-50 hover:opacity-100"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        Retour
                                    </button>
                                    <motion.button
                                        disabled={formData.interests.length < 3}
                                        whileHover={formData.interests.length >= 3 ? { scale: 1.05 } : {}}
                                        onClick={handleNext}
                                        className={`px-16 py-4 rounded-2xl font-black text-lg transition-all ${formData.interests.length >= 3 ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/20'
                                            }`}
                                    >
                                        Continuer
                                    </motion.button>
                                </div>
                                <div className="h-6 overflow-hidden">
                                    <p className={`text-sm font-bold transition-all duration-300 ${formData.interests.length < 3 ? 'opacity-50' : 'text-indigo-400'}`}
                                        style={{ color: formData.interests.length < 3 ? 'var(--text-secondary)' : '' }}>
                                        {formData.interests.length < 3 ? `Encore ${3 - formData.interests.length} thèmes pour débloquer` : "C'est bon ! On peut y aller."}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div
                            key="step4"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="w-full max-w-3xl text-center"
                        >
                            <h2 className="text-4xl font-black mb-4 transition-colors" style={{ color: 'var(--text-primary)' }}>Dernière étape !</h2>
                            <p className="text-xl mb-12 opacity-70 transition-colors" style={{ color: 'var(--text-secondary)' }}>Quel est ton objectif principal sur Qvibe ?</p>

                            <div className="space-y-4 mb-14">
                                {[
                                    { id: 'learn', label: "Apprendre & m'instruire", icon: '🎓' },
                                    { id: 'challenge', label: 'Défier mes amis', icon: '🏆' },
                                    { id: 'create', label: 'Créer mes propres quiz', icon: '🎨' }
                                ].map(opt => (
                                    <motion.div
                                        key={opt.id}
                                        whileHover={{ x: 10 }}
                                        onClick={() => setFormData(prev => ({ ...prev, goal: opt.id }))}
                                        className={`p-6 rounded-3xl border-3 flex items-center justify-between cursor-pointer transition-all duration-500 ${formData.goal === opt.id ? 'border-indigo-600' : 'border-transparent'
                                            }`}
                                        style={{
                                            backgroundColor: formData.goal === opt.id ? 'rgba(79, 70, 229, 0.1)' : 'var(--bg-surface)',
                                            borderColor: formData.goal === opt.id ? 'var(--accent)' : 'var(--glass-border)'
                                        }}
                                    >
                                        <div className="flex items-center gap-6">
                                            <span className="text-3xl">{opt.icon}</span>
                                            <span className="text-xl font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                                        </div>
                                        {formData.goal === opt.id && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="p-2 rounded-full text-white"
                                                style={{ backgroundColor: 'var(--accent)' }}
                                            >
                                                <Check size={20} strokeWidth={3} />
                                            </motion.div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>

                            <div className="flex justify-center items-center gap-10">
                                <button onClick={handleBack} className="font-bold py-4 px-6 transition-all opacity-50 hover:opacity-100" style={{ color: 'var(--text-primary)' }}>Retour</button>
                                <motion.button
                                    disabled={!formData.goal || isLoading}
                                    whileHover={formData.goal ? { scale: 1.05 } : {}}
                                    onClick={handleFinish}
                                    className={`px-16 py-5 rounded-3xl font-black text-xl transition-all flex items-center gap-4 ${formData.goal ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white' : 'bg-white/5 text-white/20'
                                        }`}
                                >
                                    {isLoading ? 'Finalisation...' : <>Lancer Qvibe ! <Rocket size={24} /></>}
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Onboarding;
