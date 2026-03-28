import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import logo from '../../images/logo.png';

const AuthModal = ({ isOpen, onClose, initialMode = 'login', onAuthSuccess }) => {
    const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'forgot_password' | 'reset_password'
    const [formData, setFormData] = useState({
        email: '',
        mot_de_passe: '',
        nom_affichage: '',
        code: '',
        nouveau_mot_de_passe: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Synchroniser le mode si la prop change (ex: clic sur "S'inscrire" puis "Connexion")
    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setError('');
        }
    }, [initialMode, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        let endpoint = '';
        let body = {};

        if (mode === 'login') {
            endpoint = '/auth/login';
            body = { email: formData.email, mot_de_passe: formData.mot_de_passe };
        } else if (mode === 'register') {
            endpoint = '/auth/register';
            body = { email: formData.email, mot_de_passe: formData.mot_de_passe, nom_affichage: formData.nom_affichage };
        } else if (mode === 'forgot_password') {
            endpoint = '/auth/request-reset';
            body = { email: formData.email };
        } else if (mode === 'reset_password') {
            endpoint = '/auth/reset-password';
            body = {
                email: formData.email,
                code: formData.code,
                nouveau_mot_de_passe: formData.nouveau_mot_de_passe
            };
        }

        try {
            const data = await api.post(endpoint, body);

            if (mode === 'forgot_password') {
                setMode('reset_password');
                setError('');
                return;
            }

            if (mode === 'reset_password') {
                setMode('login');
                setError('');
                alert("Votre mot de passe a été réinitialisé !");
                return;
            }

            // Store token for this tab only
            sessionStorage.setItem('qvibe_token', data.access_token);
            api.setToken(data.access_token);
            // Use the user object returned directly from login/register (no extra round-trip)
            const userData = data.user;
            sessionStorage.setItem('qvibe_user', JSON.stringify(userData));

            onAuthSuccess(userData);
            onClose();
        } catch (err) {
            setError(err.message || 'Une erreur est survenue');
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = (newMode) => {
        setMode(newMode);
        setError('');
        setFormData({
            email: formData.email, // Garder l'email pour plus de confort
            mot_de_passe: '',
            nom_affichage: '',
            code: '',
            nouveau_mot_de_passe: ''
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                        style={{ zIndex: 200 }}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-0 flex items-center justify-center p-4"
                        style={{ zIndex: 201 }}
                    >
                        <div className="rounded-3xl shadow-2xl w-full max-w-md p-8 relative border transition-all duration-500"
                            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>

                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="absolute top-5 right-5 transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                                <X size={22} />
                            </button>

                            <div className="flex flex-col items-center mb-8">
                                <img src={logo} alt="Qvibe" className="h-14 w-auto mb-4" />
                                <h2 className="text-2xl font-black transition-colors" style={{ color: 'var(--text-primary)' }}>
                                    {mode === 'login' && 'Bon retour ! 👋'}
                                    {mode === 'register' && 'Créer un compte'}
                                    {mode === 'forgot_password' && 'Mot de passe oublié'}
                                    {mode === 'reset_password' && 'Réinitialisation'}
                                </h2>
                                <p className="text-sm mt-1 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                                    {mode === 'login' && 'Connectez-vous à votre compte Qvibe'}
                                    {mode === 'register' && 'Rejoignez la communauté Qvibe'}
                                    {mode === 'forgot_password' && "Entrez votre email pour recevoir un code"}
                                    {mode === 'reset_password' && "Entrez le code reçu et votre nouveau mot de passe"}
                                </p>
                            </div>

                            {/* Error */}
                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-5 border"
                                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                    >
                                        <AlertCircle size={16} className="shrink-0" />
                                        {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {mode === 'register' && (
                                    <div className="relative">
                                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            name="nom_affichage"
                                            placeholder="Nom d'affichage"
                                            value={formData.nom_affichage}
                                            onChange={handleChange}
                                            className="w-full border-2 border-transparent focus:border-purple-500/30 rounded-xl py-3 pl-12 pr-4 outline-none text-sm font-medium transition-all"
                                            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                        />
                                    </div>
                                )}

                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                    <input
                                        type="email"
                                        name="email"
                                        placeholder="Adresse email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                        className="w-full border-2 border-transparent focus:border-purple-500/30 rounded-xl py-3 pl-12 pr-4 outline-none text-sm font-medium transition-all"
                                        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    />
                                </div>

                                {(mode === 'login' || mode === 'register') && (
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            name="mot_de_passe"
                                            placeholder="Mot de passe"
                                            value={formData.mot_de_passe}
                                            onChange={handleChange}
                                            required
                                            className="w-full border-2 border-transparent focus:border-purple-500/30 rounded-xl py-3 pl-12 pr-12 outline-none text-sm font-medium transition-all"
                                            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                )}

                                {mode === 'login' && (
                                    <div className="flex justify-end px-1">
                                        <button
                                            type="button"
                                            onClick={() => switchMode('forgot_password')}
                                            className="text-xs font-semibold hover:opacity-80 transition-colors"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            Mot de passe oublié ?
                                        </button>
                                    </div>
                                )}

                                {mode === 'reset_password' && (
                                    <>
                                        <div className="relative">
                                            <AlertCircle size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                name="code"
                                                placeholder="Code à 6 chiffres"
                                                value={formData.code}
                                                onChange={handleChange}
                                                required
                                                maxLength={6}
                                                className="w-full border-2 border-transparent focus:border-purple-500/30 rounded-xl py-3 pl-12 pr-4 outline-none text-sm font-medium transition-all text-center tracking-widest"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div className="relative">
                                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                name="nouveau_mot_de_passe"
                                                placeholder="Nouveau mot de passe"
                                                value={formData.nouveau_mot_de_passe}
                                                onChange={handleChange}
                                                required
                                                className="w-full border-2 border-transparent focus:border-purple-500/30 rounded-xl py-3 pl-12 pr-12 outline-none text-sm font-medium transition-all"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                    </>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-linear-to-r from-purple-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                                >
                                    {isLoading
                                        ? 'Chargement...'
                                        : mode === 'login' ? 'Se connecter'
                                            : mode === 'register' ? "S'inscrire"
                                                : mode === 'forgot_password' ? 'Envoyer le code'
                                                    : 'Réinitialiser'}
                                </motion.button>
                            </form>

                            <p className="text-center text-sm mt-6" style={{ color: 'var(--text-secondary)' }}>
                                {(mode === 'login' || mode === 'forgot_password' || mode === 'reset_password') && (
                                    <>
                                        Pas encore de compte ?{" "}
                                        <button
                                            onClick={() => switchMode('register')}
                                            className="font-semibold hover:underline"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            S'inscrire
                                        </button>
                                    </>
                                )}
                                {mode === 'register' && (
                                    <>
                                        Déjà un compte ?{" "}
                                        <button
                                            onClick={() => switchMode('login')}
                                            className="font-semibold hover:underline"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            Se connecter
                                        </button>
                                    </>
                                )}
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default AuthModal;
