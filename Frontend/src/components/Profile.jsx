import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../utils/api';
import {
    Camera,
    ArrowLeft,
    User,
    Mail,
    FileText,
    Save,
    Sun,
    Moon,
    Monitor,
    Globe,
    Zap,
    ZapOff,
    Trophy,
    History,
    Trash2,
    CheckCircle,
    ChevronDown
} from 'lucide-react';

const Profile = ({ user, onClose, onUpdateUser, onUpdateUserLocal, onThemePreview }) => {
    const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'preferences', 'stats'
    const [formData, setFormData] = useState({
        nom_affichage: user?.nom_affichage || user?.email?.split('@')[0] || 'Utilisateur',
        bio: user?.preferences?.bio || '',
    });
    const [theme, setTheme] = useState(user?.preferences?.theme || 'light');
    const [language, setLanguage] = useState(user?.preferences?.language || 'Français');
    const [isModified, setIsModified] = useState(false);
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleAvatarClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);

        try {
            const response = await api.post('/auth/avatar', formDataUpload);
            // On met à jour l'utilisateur localement instantanément pour éviter le race condition
            // Une update ultérieure via ProfileUpdate pourrait écraser photo_url si on ne synchronise pas localStorage
            if (onUpdateUserLocal) {
                onUpdateUserLocal({ ...user, photo_url: response.photo_url });
            } else {
                onUpdateUser({ ...user, photo_url: response.photo_url });
            }
        } catch (error) {
            console.error(' [Profile] Erreur upload avatar:', error);
            alert("Erreur lors de l'upload de l'image.");
        } finally {
            setIsUploading(false);
        }
    };

    const colorMap = {
        violet: {
            bg: 'bg-violet-50',
            text: 'text-violet-600',
            icon: 'text-violet-500',
            indicator: 'bg-violet-500',
            button: 'bg-violet-600',
            from: 'from-violet-600',
            to: 'to-indigo-500',
            avatar: 'from-violet-500 to-indigo-600'
        },
        blue: {
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            icon: 'text-blue-500',
            indicator: 'bg-blue-500',
            button: 'bg-blue-600',
            from: 'from-blue-600',
            to: 'to-cyan-500',
            avatar: 'from-blue-500 to-cyan-600'
        },
        orange: {
            bg: 'bg-orange-50',
            text: 'text-orange-600',
            icon: 'text-orange-500',
            indicator: 'bg-orange-500',
            button: 'bg-orange-600',
            from: 'from-orange-500',
            to: 'to-yellow-500',
            avatar: 'from-orange-500 to-yellow-600'
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setIsModified(true);
    };

    const handleSave = () => {
        const updatedUser = {
            ...user,
            nom_affichage: formData.nom_affichage,
            preferences: {
                ...user?.preferences,
                bio: formData.bio,
                theme,
                language
            }
        };
        onUpdateUser(updatedUser);
        setIsModified(false);
    };

    const stats = [
        { label: 'Quiz Créés', value: user?.stats?.quizzes_created || 12, icon: <FileText className="text-orange-500" /> },
        { label: 'Score Moyen', value: `${user?.stats?.average_score || 85}%`, icon: <Trophy className="text-yellow-500" /> },
        { label: 'Dernière Activité', value: 'Il y a 2h', icon: <History className="text-amber-500" /> },
    ];

    const navItems = [
        { id: 'personal', label: 'Infos Personnelles', icon: <User size={20} />, color: 'violet' },
        { id: 'preferences', label: 'Apparence', icon: <Sun size={20} />, color: 'blue' },
        { id: 'stats', label: 'Statistiques', icon: <Zap size={20} />, color: 'orange' },
    ];

    const activeColor = colorMap[navItems.find(i => i.id === activeTab)?.color || 'violet'];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex transition-colors duration-500"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
        >
            {/* Sidebar Navigation */}
            <aside className="w-96 border-r flex flex-col fixed h-full z-20 backdrop-blur-xl transition-all duration-500"
                style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}>
                <div className="p-8">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="h-10 w-10 bg-linear-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center text-white">
                            <Monitor size={20} />
                        </div>
                        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Mon Espace</h1>
                    </div>

                    <nav className="space-y-2">
                        {navItems.map((item) => {
                            const isTabActive = activeTab === item.id;
                            const colors = colorMap[item.color];
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${isTabActive
                                        ? 'font-black'
                                        : 'hover:text-gray-900 dark:hover:text-white font-bold'
                                        }`}
                                    style={{
                                        backgroundColor: isTabActive ? colors.bg : 'transparent',
                                        color: isTabActive ? colors.text : 'var(--text-secondary)'
                                    }}
                                    onMouseEnter={(e) => !isTabActive && (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
                                    onMouseLeave={(e) => !isTabActive && (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <span className={`transition-colors duration-300 ${isTabActive ? colors.icon : 'opacity-50 group-hover:opacity-100'}`}>
                                        {item.icon}
                                    </span>
                                    <span className={`text-sm uppercase tracking-wide ${isTabActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                                        {item.label}
                                    </span>
                                    {isTabActive && (
                                        <motion.div
                                            layoutId="activeNavIndicator"
                                            className={`ml-auto w-1.5 h-6 rounded-full ${colors.indicator}`}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="mt-auto p-8 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                    <motion.button
                        whileHover={{ scale: 1.02, x: 2 }}
                        onClick={onClose}
                        className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
                    >
                        <ArrowLeft size={18} /> Accueil
                    </motion.button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 ml-96 min-h-screen transition-all duration-500" style={{ color: 'var(--text-primary)' }}>
                {/* Hero Top Bar */}
                <div className={`h-40 bg-linear-to-r transition-all duration-700 ${activeColor.from} ${activeColor.to}`}>
                    <div className="max-w-4xl mx-auto px-8 pt-16">
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="p-6 rounded-3xl shadow-2xl border flex items-center gap-6 transition-all duration-500"
                            style={{
                                backgroundColor: 'var(--bg-surface)',
                                borderColor: 'var(--glass-border)',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                            }}
                        >
                            <div className="relative group">
                                {user?.photo_url ? (
                                    <div className="h-28 w-28 rounded-full p-[3px] shadow-lg" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b, #8b5cf6)' }}>
                                        <img src={user.photo_url} alt="" className="h-full w-full rounded-full object-cover border-[3px] border-white" />
                                    </div>
                                ) : (
                                    <div className="h-28 w-28 rounded-full p-[3px] shadow-lg" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b, #8b5cf6)' }}>
                                        <div className={`h-full w-full rounded-full bg-linear-to-br flex items-center justify-center text-white text-4xl font-black transition-all duration-700 ${activeColor.avatar}`}>
                                            {(user?.nom_affichage || user?.email || "U")[0].toUpperCase()}
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={handleAvatarClick}
                                    disabled={isUploading}
                                    className={`absolute -bottom-1 -right-1 p-2 rounded-full text-white shadow-lg transition-all border-2 border-white ${activeColor.button} ${isUploading ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                    <Camera size={16} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className="hidden"
                                    accept="image/*"
                                />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{user?.nom_affichage}</h2>
                                <p className="text-sm font-bold text-gray-400 mt-0.5">Étudiant • Membre depuis 2026</p>
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                disabled={!isModified}
                                onClick={handleSave}
                                className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${isModified
                                    ? `bg-gray-900 text-white shadow-lg hover:bg-gray-800`
                                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                    }`}
                            >
                                <Save size={16} className="inline mr-2" /> Sauvegarder
                            </motion.button>
                        </motion.div>
                    </div>
                </div>

                <div className="max-w-4xl mx-auto px-8 mt-24 pb-20">
                    <AnimatePresence mode="wait">
                        {activeTab === 'personal' && (
                            <motion.section
                                key="personal"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="p-10 rounded-[2.5rem] shadow-xl border relative overflow-hidden transition-all duration-500"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full -mr-16 -mt-16 blur-2xl opacity-50" />
                                    <div className="flex items-center gap-4 mb-10">
                                        <div className="p-4 bg-violet-500/10 text-violet-500 rounded-2xl">
                                            <User size={28} />
                                        </div>
                                        <h3 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Mes Informations</h3>
                                    </div>

                                    <div className="space-y-8 max-w-xl">
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Nom affiché</label>
                                            <input
                                                type="text"
                                                name="nom_affichage"
                                                value={formData.nom_affichage}
                                                onChange={handleInputChange}
                                                className="w-full border-2 border-transparent focus:border-violet-500/30 rounded-2xl py-4 px-6 outline-none font-bold transition-all text-lg"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Votre Email</label>
                                            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                <Mail size={18} style={{ color: 'var(--text-muted)' }} />
                                                <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>{user?.email}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Bio & Présentation</label>
                                            <textarea
                                                name="bio"
                                                value={formData.bio}
                                                onChange={handleInputChange}
                                                rows="4"
                                                className="w-full border-2 border-transparent focus:border-violet-500/30 rounded-2xl p-6 outline-none font-bold transition-all resize-none"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                placeholder="Partagez votre passion pour les quiz..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'preferences' && (
                            <motion.section
                                key="preferences"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="p-10 rounded-[2.5rem] shadow-xl border relative overflow-hidden transition-all duration-500"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-2xl opacity-50" />
                                    <div className="flex items-center gap-4 mb-10">
                                        <div className="p-4 bg-blue-500/10 text-blue-500 rounded-2xl">
                                            <Sun size={28} />
                                        </div>
                                        <h3 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Préférences de Style</h3>
                                    </div>

                                    <div className="space-y-10 max-w-2xl">
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-5">Thème de l'interface</label>
                                            <div className="grid grid-cols-3 gap-4">
                                                {[
                                                    { id: 'light', icon: <Sun />, label: 'Clair' },
                                                    { id: 'dark', icon: <Moon />, label: 'Sombre' },
                                                    { id: 'system', icon: <Monitor />, label: 'Auto' },
                                                ].map((t) => (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => { setTheme(t.id); setIsModified(true); onThemePreview(t.id); }}
                                                        className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 duration-300 ${theme === t.id
                                                            ? 'border-blue-600 scale-105 shadow-2xl font-black'
                                                            : 'border-transparent font-bold transition-all'
                                                            }`}
                                                        style={{
                                                            backgroundColor: theme === t.id ? 'var(--bg-elevated)' : 'transparent',
                                                            color: theme === t.id ? 'var(--accent)' : 'var(--text-muted)',
                                                            boxShadow: theme === t.id ? '0 10px 30px -10px var(--accent)' : 'none'
                                                        }}
                                                    >
                                                        {t.icon}
                                                        <span className="text-xs uppercase tracking-widest">{t.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Langue</label>
                                            <div className="relative">
                                                <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                                <select
                                                    value={language}
                                                    onChange={(e) => { setLanguage(e.target.value); setIsModified(true); }}
                                                    className="w-full border-2 border-transparent focus:border-blue-500/30 rounded-2xl py-4 pl-14 pr-10 outline-none font-bold transition-all appearance-none cursor-pointer"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                >
                                                    <option>Français</option>
                                                    <option>Arabe</option>
                                                    <option>Anglais</option>
                                                </select>
                                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'stats' && (
                            <motion.section
                                key="stats"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="p-10 rounded-[2.5rem] shadow-xl border relative overflow-hidden transition-all duration-500"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 blur-2xl opacity-50" />
                                    <div className="flex items-center gap-4 mb-10">
                                        <div className="p-4 bg-orange-500/10 text-orange-500 rounded-2xl">
                                            <Trophy size={28} />
                                        </div>
                                        <h3 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Mes Accomplissements</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                                        {stats.map((stat, idx) => (
                                            <div key={idx} className="p-8 rounded-4xl border flex flex-col items-center text-center gap-4 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2"
                                                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                <div className="p-4 rounded-2xl mb-2" style={{ backgroundColor: 'var(--bg-surface)' }}>
                                                    {stat.icon}
                                                </div>
                                                <div>
                                                    <p className="text-4xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
                                                    <p className="text-xs font-black opacity-40 uppercase tracking-widest mt-1" style={{ color: 'var(--text-primary)' }}>{stat.label}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="p-8 rounded-3xl border flex flex-col md:flex-row md:items-center justify-between gap-6"
                                        style={{
                                            background: 'linear-gradient(to right, var(--accent-soft), transparent)',
                                            borderColor: 'var(--accent)'
                                        }}>
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 rounded-2xl shadow-lg" style={{ backgroundColor: 'var(--bg-surface)' }}>
                                                <CheckCircle size={24} style={{ color: 'var(--accent)' }} />
                                            </div>
                                            <div>
                                                <p className="font-black uppercase text-xs tracking-wider" style={{ color: 'var(--text-primary)' }}>État de Progression</p>
                                                <p className="font-bold mt-1" style={{ color: 'var(--text-secondary)' }}>Vous avez généré plus de <span className="text-orange-500 font-black">10 quiz</span> ce mois-ci ! 💪</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-center pt-10">
                                    <button className="flex items-center gap-3 text-red-400 hover:text-red-600 transition-all font-black text-xs uppercase tracking-[0.2em] group">
                                        <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                                        <span>Supprimer Definitivement le Compte</span>
                                    </button>
                                </div>
                            </motion.section>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </motion.div>
    );
};

export default Profile;
