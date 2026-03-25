import React, { useState } from 'react';
import { Search, Home, Compass, LogOut, ChevronDown, Plus, User, Layout, History, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../../images/logo.png';

const Header = ({ onSearchFocusChange, onOpenAuth, currentUser, onLogout, onCreateClick, onProfileClick, onMyQuizzesClick }) => {
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

    const handleSearchFocus = () => {
        setIsSearchFocused(true);
        if (onSearchFocusChange) onSearchFocusChange(true);
    };

    const handleSearchBlur = () => {
        setIsSearchFocused(false);
        if (onSearchFocusChange) onSearchFocusChange(false);
    };

    const menuItems = [
        { icon: <User size={18} />, label: 'Mon Profil', onClick: () => onProfileClick() },
        { icon: <Layout size={18} />, label: 'Mes Quiz', onClick: () => { if (onMyQuizzesClick) onMyQuizzesClick(); } },
        { icon: <History size={18} />, label: 'Historique', onClick: () => console.log('Historique') },
        { icon: <Settings size={18} />, label: 'Paramètres', onClick: () => console.log('Paramètres') },
    ];

    return (
        <header className="fixed top-0 left-0 w-full z-100 glass-header border-b border-white/20 transition-all duration-300">
            <div className="max-w-[1920px] mx-auto px-6 h-32 flex items-center justify-between gap-8">

                {/* Left: Identity */}
                <div className="flex items-center gap-8 shrink-0">
                    <a href="#" className="flex items-center gap-4 group">
                        <motion.img
                            src={logo}
                            alt="Qvibe Icon"
                            className="h-20 w-auto"
                            style={{
                                filter: "drop-shadow(0 0 15px rgba(139, 92, 246, 0.4)) drop-shadow(0 0 5px rgba(249, 115, 22, 0.3))"
                            }}
                            animate={{ y: [-5, 5, -5] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <span className="text-3xl font-black tracking-tighter bg-linear-to-r from-violet-600 via-pink-500 to-orange-500 bg-clip-text text-transparent uppercase">
                            Qvibe
                        </span>
                    </a>
                    <nav className="hidden lg:flex items-center gap-6">
                        <motion.a
                            whileHover={{ scale: 1.05, y: -2 }}
                            href="#"
                            id="nav-home"
                            className="text-sm font-semibold transition-all flex items-center gap-2 dark:text-gray-300 dark:hover:text-violet-400"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            <Home size={18} className="text-purple-500 dark:text-violet-400" /> Accueil
                        </motion.a>
                        <motion.a
                            whileHover={{ scale: 1.05, y: -2 }}
                            href="#"
                            id="nav-explorer"
                            className="text-sm font-semibold transition-all flex items-center gap-2 dark:text-gray-300 dark:hover:text-violet-400"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            <Compass size={18} className="text-purple-500 dark:text-violet-400" /> Explorer
                        </motion.a>
                    </nav>
                </div>

                {/* Center: Search Bar + Create Button */}
                <div className="flex-1 flex items-center justify-center gap-6">
                    <div className="w-full max-w-xl relative">
                        <motion.div
                            animate={{
                                scale: isSearchFocused ? 1.02 : 1,
                                boxShadow: isSearchFocused ? "0 10px 25px -5px rgba(139, 92, 246, 0.15)" : "0 0px 0px rgba(0,0,0,0)"
                            }}
                            className="relative flex items-center group"
                        >
                            <Search className={`absolute left-4 transition-colors duration-300 ${isSearchFocused ? 'text-purple-500 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}`} size={20} />
                            <input
                                id="header-search"
                                type="text"
                                placeholder="Chercher un quiz sur l'histoire, la tech..."
                                onFocus={(e) => { handleSearchFocus(); e.target.style.backgroundColor = 'var(--bg-surface)'; }}
                                onBlur={(e) => { handleSearchBlur(); e.target.style.backgroundColor = 'var(--bg-elevated)'; }}
                                className="w-full border-2 border-transparent rounded-2xl py-3 pl-12 pr-4 focus:border-purple-200 dark:focus:border-violet-700/50 transition-all outline-none text-base font-medium placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                            />
                        </motion.div>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onCreateClick}
                        className="group relative flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-orange-500 text-white px-4 py-2 rounded-xl font-black text-sm transition-all duration-300 shrink-0 border-none"
                        style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                        {/* Outer Gradient Hover Layer (for border) */}
                        <div className="absolute inset-0 bg-linear-to-r from-violet-600 to-orange-500 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-2xl" />

                        {/* Inner Hover Layer */}
                        <div className="absolute inset-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-[10px]" style={{ backgroundColor: 'var(--glass-bg)' }} />

                        {/* Content */}
                        <div className="relative flex items-center gap-2">
                            <Plus size={15} strokeWidth={3} className="shrink-0 transition-colors duration-300 group-hover:text-violet-600" />
                            <span className="hidden sm:inline transition-all duration-300 group-hover:bg-linear-to-r group-hover:from-violet-600 group-hover:to-orange-500 group-hover:bg-clip-text group-hover:text-transparent">
                                Créer
                            </span>
                        </div>
                    </motion.button>

                </div>

                {/* Right: Auth */}
                <div className="flex items-center gap-6 shrink-0">
                    {currentUser ? (
                        /* Logged in: show avatar + name */
                        <div className="relative">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                id="user-profile-button"
                                className="flex items-center gap-4 transition-all py-1"
                            >
                                {currentUser.photo_url ? (
                                    <div className="h-16 w-16 rounded-full p-[2.5px] transition-all duration-300" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)' }}>
                                        <img src={currentUser.photo_url} alt="" className="h-full w-full rounded-full object-cover border-2 border-white" />
                                    </div>
                                ) : (
                                    <div className="h-16 w-16 rounded-full p-[2.5px] transition-all duration-300" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)' }}>
                                        <div className="h-full w-full rounded-full bg-linear-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-lg font-black">
                                            {(currentUser.nom_affichage || currentUser.email)[0].toUpperCase()}
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-black uppercase tracking-tight" style={{ color: 'var(--accent)' }}>
                                        {currentUser.nom_affichage || currentUser.email.split('@')[0]}
                                    </span>
                                    <ChevronDown size={18} className={`transition-transform duration-300 dark:text-gray-500 text-gray-400 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                                </div>
                            </motion.button>

                            {/* Dropdown */}
                            <AnimatePresence>
                                {isUserMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                        className="absolute right-0 top-full mt-3 w-60 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden z-50 p-2 border"
                                        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                                    >
                                        <div className="px-4 py-3 mb-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--text-muted)' }}>Menu Utilisateur</p>
                                            <div className="h-0.5 w-8 bg-linear-to-r from-violet-500 to-transparent rounded-full" />
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            {menuItems.map((item, index) => (
                                                <React.Fragment key={index}>
                                                    <motion.button
                                                        whileHover={{ x: 4 }}
                                                        onClick={() => { item.onClick(); setIsUserMenuOpen(false); }}
                                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:text-violet-600 dark:hover:text-violet-400 rounded-2xl transition-all duration-300 font-bold group"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-soft)'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <span className="transition-colors duration-300 group-hover:text-violet-500 dark:group-hover:text-violet-400" style={{ color: 'var(--text-muted)' }}>
                                                            {item.icon}
                                                        </span>
                                                        {item.label}
                                                    </motion.button>
                                                    {index !== menuItems.length - 1 && (
                                                        <div className="mx-4 h-px my-0.5" style={{ backgroundColor: 'var(--border)' }} />
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>

                                        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                                            <motion.button
                                                whileHover={{ x: 4 }}
                                                onClick={() => { onLogout(); setIsUserMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500/80 hover:text-red-600 dark:text-red-400/80 dark:hover:text-red-400 rounded-2xl transition-all duration-300 font-bold group"
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <LogOut size={18} className="text-red-400 group-hover:text-red-500 transition-colors" />
                                                <span>Se déconnecter</span>
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        /* Not logged in: show login/register buttons */
                        <>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                onClick={() => onOpenAuth('login')}
                                className="text-sm font-bold text-gray-800 hover:text-purple-600 transition-colors"
                            >
                                Se connecter
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.05, boxShadow: "0 10px 15px -3px rgba(139, 92, 246, 0.3)" }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => onOpenAuth('register')}
                                className="bg-linear-to-r from-purple-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                            >
                                S'inscrire
                            </motion.button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
