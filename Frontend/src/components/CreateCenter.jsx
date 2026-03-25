import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Sparkles, FileText, Plus, Users, ArrowLeft,
    ArrowRight, Upload, ChevronRight, Settings,
    Clock, Trophy, Image as ImageIcon,
    Check, Rocket, Brain, Lock, Globe, Share2, Tag, Play, Download
} from 'lucide-react';
import api from '../utils/api';
import QuizPlayer from './QuizPlayer';

// Professional Typography Import
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
        `}
    </style>
);



const CreateCenter = ({ onClose, currentUser, editingQuiz, onLaunchQuiz, onLaunchLiveSession, onJoinLiveSession }) => {
    const [step, setStep] = useState(editingQuiz ? 'manual_editor' : 'main_choice');
    const [creationMode, setCreationMode] = useState(editingQuiz ? 'manual' : null);
    const [isSession, setIsSession] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [generatedQuizId, setGeneratedQuizId] = useState(null);
    const [manualLanguage, setManualLanguage] = useState('Français');

    // Quiz Metadata
    const [quizData, setQuizData] = useState({
        titre: '',
        description: '',
        difficulte_moyenne: 'Moyen',
        duree_max_minutes: 10,
        visibilite: 'public',
        peut_etre_clone: true,
        tags: [],
        image_couverture_url: ''
    });

    const [questions, setQuestions] = useState([]);
    const [optionCount, setOptionCount] = useState(2);
    const [aiInput, setAiInput] = useState('');
    const [aiProgress, setAiProgress] = useState(0);
    const [aiLoadingMessage, setAiLoadingMessage] = useState("L'IA prépare son cerveau...");
    const [sessionJoinCode, setSessionJoinCode] = useState('');
    const [isJoiningSession, setIsJoiningSession] = useState(false);
    const [joinSessionError, setJoinSessionError] = useState('');

    // AI Specific Settings
    const [aiSettings, setAiSettings] = useState({
        num_questions: 10,
        difficulty: 'Moyen',
        language: 'Français',
        tone: 'Fun',
        question_type: 'Mélangé',
        time_mode: 'Pas de limite',
        time_value: 30,
        show_immediate_feedback: false
    });
    const [files, setFiles] = useState([]);
    const [savedDocuments, setSavedDocuments] = useState([]);
    const [aiConfigBaseline, setAiConfigBaseline] = useState(null);
    const [thumbnailFile, setThumbnailFile] = useState(null); // Raw File object for server upload
    const fileInputRef = useRef(null);
    const abortControllerRef = useRef(null);

    function getCorrectIndexes(question) {
        const options = Array.isArray(question?.options_reponses) ? question.options_reponses : [];
        const maxIndex = options.length - 1;

        let indexes = [];
        if (Array.isArray(question?.reponses_correctes_idx)) {
            indexes = question.reponses_correctes_idx.filter(i => Number.isInteger(i));
        } else {
            const rawCorrect = question?.reponse_correcte;
            const correctValues = Array.isArray(rawCorrect) ? rawCorrect : [rawCorrect];
            indexes = correctValues
                .map((value) => options.findIndex(opt => opt === value))
                .filter(i => i >= 0);
        }

        const uniqueIndexes = [...new Set(indexes)].filter(i => i >= 0 && i <= maxIndex);
        const optionLength = options.length;

        if (optionLength <= 0) return [];
        if (uniqueIndexes.length === 0) return [0];

        const maxSelectable = Math.max(1, optionLength - 1);
        if (uniqueIndexes.length > maxSelectable) {
            return uniqueIndexes.slice(0, maxSelectable);
        }
        return uniqueIndexes;
    }

    function normalizeManualQuestion(question) {
        const options = Array.isArray(question?.options_reponses) ? question.options_reponses : [];
        const correctIndexes = getCorrectIndexes(question);
        const correctTexts = correctIndexes
            .map((index) => options[index])
            .filter((value) => value !== undefined);

        return {
            ...question,
            type_question: correctTexts.length > 1 ? 'Multiple' : 'MCQ',
            reponses_correctes_idx: correctIndexes,
            reponse_correcte: correctTexts.length > 1 ? correctTexts : (correctTexts[0] ?? ''),
        };
    }

    function createManualQuestion(count) {
        return normalizeManualQuestion({
            texte_question: '',
            type_question: 'MCQ',
            options_reponses: Array.from({ length: count }, () => ''),
            reponse_correcte: '',
            reponses_correctes_idx: [0],
            explication: '',
            points: 1
        });
    }

    function sanitizeQuestionForApi(question) {
        const normalized = normalizeManualQuestion(question);
        const { reponses_correctes_idx, ...cleaned } = normalized;
        return cleaned;
    }

    // ── INITIALIZE EDIT MODE ──
    useEffect(() => {
        if (editingQuiz) {
            const isAI = editingQuiz.type_creation === 'ai';
            setQuizData({
                titre: editingQuiz.titre || '',
                description: editingQuiz.description || '',
                visibilite: editingQuiz.visibilite || 'public',
                est_corrige_auto: editingQuiz.est_corrige_auto ?? true,
                tags: editingQuiz.tags || [],
                image_couverture_url: editingQuiz.image_couverture_url || '',
                difficulte_moyenne: editingQuiz.difficulte_moyenne || 'Moyen',
                duree_max_minutes: editingQuiz.duree_max_minutes || 10,
                peut_etre_clone: editingQuiz.peut_etre_clone ?? true,
                parametres_generation: editingQuiz.parametres_generation || {}
            });
            const initialQuestions = editingQuiz.questions || [];
            setQuestions(isAI ? initialQuestions : initialQuestions.map(normalizeManualQuestion));
            const initialOptionCount = Math.min(6, Math.max(2, editingQuiz.questions?.[0]?.options_reponses?.length || 2));
            setOptionCount(initialOptionCount);
            setManualLanguage(editingQuiz.parametres_generation?.language || 'Français');
            if (!isAI && typeof editingQuiz.parametres_generation?.show_immediate_feedback === 'boolean') {
                setAiSettings(prev => ({
                    ...prev,
                    show_immediate_feedback: editingQuiz.parametres_generation.show_immediate_feedback
                }));
            }

            if (isAI && editingQuiz.parametres_generation) {
                const mergedAiSettings = {
                    ...aiSettings,
                    ...editingQuiz.parametres_generation
                };
                const existingPrompt = editingQuiz.parametres_generation.prompt || '';
                const existingSavedDocs = editingQuiz.parametres_generation.saved_documents || [];

                setAiSettings(mergedAiSettings);
                setAiInput(existingPrompt);
                setSavedDocuments(existingSavedDocs);
                setAiConfigBaseline(buildAIConfigSnapshot({
                    quizState: {
                        titre: editingQuiz.titre || '',
                        description: editingQuiz.description || '',
                        visibilite: editingQuiz.visibilite || 'public',
                        peut_etre_clone: editingQuiz.peut_etre_clone ?? true,
                        tags: editingQuiz.tags || [],
                        image_couverture_url: editingQuiz.image_couverture_url || '',
                    },
                    inputState: existingPrompt,
                    aiSettingsState: mergedAiSettings,
                    savedDocsState: existingSavedDocs,
                    filesState: [],
                    thumbnailState: null,
                }));
            } else {
                setAiConfigBaseline(null);
            }

            setCreationMode(isAI ? 'ai_prompt' : 'manual');
            setStep(isAI ? 'ai_config' : 'manual_editor');
        }
    }, [editingQuiz]);

    const applyOptionCountToQuestions = (count) => {
        setQuestions(prev => prev.map((question) => {
            const updatedOptions = Array.from({ length: count }, (_, index) => question.options_reponses?.[index] ?? '');
            return normalizeManualQuestion({
                ...question,
                options_reponses: updatedOptions,
            });
        }));
    };

    const handleOptionCountChange = (rawValue) => {
        const parsedValue = Number.parseInt(rawValue, 10);
        const nextCount = Math.min(6, Math.max(2, Number.isNaN(parsedValue) ? 2 : parsedValue));
        setOptionCount(nextCount);
        applyOptionCountToQuestions(nextCount);
    };

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length + files.length > 5) {
            alert("Vous pouvez sélectionner jusqu'à 5 fichiers maximum.");
            return;
        }
        setFiles([...files, ...selectedFiles].slice(0, 5));
    };

    const handleRemoveFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const handleRemoveSavedDocument = (index) => {
        setSavedDocuments(prev => prev.filter((_, i) => i !== index));
    };

    const aiSourceTab = useState('prompt'); // prompt, document

    const buildAIConfigSnapshot = ({
        quizState = quizData,
        inputState = aiInput,
        aiSettingsState = aiSettings,
        savedDocsState = savedDocuments,
        filesState = files,
        thumbnailState = thumbnailFile,
    } = {}) => ({
        quizData: {
            titre: quizState?.titre || '',
            description: quizState?.description || '',
            visibilite: quizState?.visibilite || 'public',
            peut_etre_clone: !!quizState?.peut_etre_clone,
            tags: Array.isArray(quizState?.tags) ? quizState.tags.map(tag => String(tag || '').trim()).filter(Boolean) : [],
            image_couverture_url: quizState?.image_couverture_url || '',
        },
        aiInput: String(inputState || '').trim(),
        aiSettings: {
            num_questions: aiSettingsState?.num_questions,
            difficulty: aiSettingsState?.difficulty,
            language: aiSettingsState?.language,
            tone: aiSettingsState?.tone,
            question_type: aiSettingsState?.question_type,
            time_mode: aiSettingsState?.time_mode,
            time_value: aiSettingsState?.time_value,
            show_immediate_feedback: !!aiSettingsState?.show_immediate_feedback,
        },
        savedDocuments: (savedDocsState || []).map(doc => ({
            id: doc?.id || '',
            name: doc?.name || '',
            url: doc?.url || '',
        })),
        files: (filesState || []).map(file => ({
            name: file?.name || '',
            size: file?.size || 0,
            type: file?.type || '',
        })),
        hasPendingThumbnail: !!thumbnailState,
    });

    const isEditingAI = !!editingQuiz && (creationMode || '').startsWith('ai');
    const hasGenerationSource = !!(String(aiInput || '').trim() || files.length > 0 || savedDocuments.length > 0);

    const hasAIConfigChanges = useMemo(() => {
        if (!isEditingAI || !aiConfigBaseline) return false;
        const current = buildAIConfigSnapshot();
        return JSON.stringify(current) !== JSON.stringify(aiConfigBaseline);
    }, [
        isEditingAI,
        aiConfigBaseline,
        quizData,
        aiInput,
        aiSettings,
        savedDocuments,
        files,
        thumbnailFile,
    ]);

    const canRegenerate = !!(quizData.titre && hasGenerationSource && (!isEditingAI || hasAIConfigChanges));
    const hasIncompleteManualQuestions = questions.some((question) => {
        const questionText = String(question?.texte_question || '').trim();
        const options = Array.isArray(question?.options_reponses) ? question.options_reponses : [];
        if (!questionText || options.length < 2) return true;
        return options.some((option) => !String(option || '').trim());
    });
    const canSubmitManualQuiz = !!(String(quizData.titre || '').trim() && questions.length > 0 && !hasIncompleteManualQuestions);

    const aiMessages = [
        "L'IA prépare son cerveau...",
        "Extraction des concepts clés...",
        "Rédaction des questions pièges...",
        "Génération des explications lumineuses...",
        "Polissage des diamants pédagogiques..."
    ];

    const fetchSavedDocumentAsFile = async (doc) => {
        const response = await fetch(doc.url);
        if (!response.ok) {
            throw new Error(`Impossible de charger le document: ${doc.name || doc.url}`);
        }
        const blob = await response.blob();
        const filename = doc.name || 'document';
        const mimeType = blob.type || 'application/octet-stream';
        return new File([blob], filename, { type: mimeType });
    };

    const handleAIGenerate = async () => {
        // Vérifier que l'utilisateur est connecté
        const token = localStorage.getItem('qvibe_token');
        if (!token) {
            alert("❌ Vous devez être connecté pour générer un quiz avec l'IA.\n\nMerci de vous connecter d'abord.");
            return;
        }

        if (!aiInput.trim() && files.length === 0 && savedDocuments.length === 0) {
            alert("❌ Veuillez entrer un texte ou charger un document avant de générer.");
            return;
        }

        setIsLoading(true);
        setAiProgress(5);

        let progressInterval;
        let msgInterval;
        let currentMsgIndex = 0;

        try {
            progressInterval = setInterval(() => {
                setAiProgress(prev => (prev < 90 ? prev + Math.random() * 5 : prev));
            }, 800);

            msgInterval = setInterval(() => {
                currentMsgIndex = (currentMsgIndex + 1) % aiMessages.length;
                setAiLoadingMessage(aiMessages[currentMsgIndex]);
            }, 3000);

            const settingsPayload = {
                prompt: aiInput,
                num_questions: aiSettings.num_questions,
                difficulty: aiSettings.difficulty,
                language: aiSettings.language,
                question_type: aiSettings.question_type,
                time_mode: aiSettings.time_mode,
                time_value: aiSettings.time_value,
                tone: aiSettings.tone,
                show_immediate_feedback: aiSettings.show_immediate_feedback
            };

            const formData = new FormData();
            formData.append('settings_json', JSON.stringify(settingsPayload));

            const requestFiles = [...files];
            if (files.length === 0 && savedDocuments.length > 0) {
                const restoredFiles = await Promise.all(savedDocuments.map(fetchSavedDocumentAsFile));
                requestFiles.push(...restoredFiles);
            }

            if (requestFiles.length > 5) {
                alert("❌ Maximum 5 documents autorisés pour la génération.");
                setIsLoading(false);
                setAiProgress(0);
                return;
            }

            requestFiles.forEach(file => formData.append('files', file));

            abortControllerRef.current = new AbortController();
            const response = await api.post('/quiz/generate/ai', formData, {
                signal: abortControllerRef.current.signal
            });
            console.log(" [AI Draft Response]", response);

            const generatedQuestions = response.questions || response.data?.questions;
            const suggestedMeta = response.metadata || response.data?.metadata;

            if (generatedQuestions && generatedQuestions.length > 0) {
                setAiProgress(100);
                setQuestions(generatedQuestions);

                // Pre-fill metadata if suggested and current is empty
                const mergedQuizData = {
                    ...quizData,
                    titre: quizData.titre || suggestedMeta?.titre || '',
                    description: quizData.description || suggestedMeta?.description || ''
                };
                setQuizData(mergedQuizData);

                if (isSession) {
                    await handlePublish({
                        launchAfterPublish: true,
                        forcedQuestions: generatedQuestions,
                        forcedQuizData: mergedQuizData,
                    });
                    return;
                }

                setStep('review_generated');
                setIsLoading(false);

                if (isEditingAI) {
                    setAiConfigBaseline(buildAIConfigSnapshot());
                }

                // ── AUTO-SAVE IN BACKGROUND ──
                // Even if user doesn't finish the review, the quiz is saved to database
                const autoSave = async () => {
                    try {
                        let finalImageUrl = '';

                        // 1. If user picked a thumbnail, upload it first
                        if (thumbnailFile) {
                            const thumbForm = new FormData();
                            thumbForm.append('file', thumbnailFile);
                            try {
                                const thumbResp = await api.post('/quiz/upload-thumbnail', thumbForm);
                                finalImageUrl = thumbResp.image_couverture_url;
                            } catch (thumbErr) {
                                console.warn('[AI Auto-Save] Thumbnail upload failed:', thumbErr);
                            }
                        }

                        const finalTitle = quizData.titre || suggestedMeta?.titre || `Quiz IA - ${new Date().toLocaleDateString()}`;
                        const finalDesc = quizData.description || suggestedMeta?.description || "Généré automatiquement par Qvibe AI";

                        const publishPayload = {
                            titre: finalTitle,
                            description: finalDesc,
                            difficulte_moyenne: aiSettings.difficulty,
                            duree_max_minutes: aiSettings.time_mode === 'Timer Global' ? aiSettings.time_value : 10,
                            visibilite: quizData.visibilite,
                            peut_etre_clone: quizData.peut_etre_clone,
                            tags: quizData.tags,
                            image_couverture_url: finalImageUrl,
                            questions: generatedQuestions,
                            parametres_generation: {
                                ...aiSettings,
                                prompt: aiInput,
                                saved_documents: suggestedMeta?.saved_documents || [],
                                type_creation: 'ai'
                            }
                        };

                        const response = await api.post('/quiz/manual', publishPayload);
                        console.log(" [AI Auto-Save] Quiz persisted successfully to database.", response);

                        // Track the ID to avoid duplicates on manual publish
                        if (response.id_quiz || response.data?.id_quiz) {
                            setGeneratedQuizId(response.id_quiz || response.data?.id_quiz);
                        }
                    } catch (saveErr) {
                        console.error(" [AI Auto-Save] Failed to persist quiz:", saveErr);
                    }
                };

                autoSave();

            } else {
                alert("L'IA n'a pas pu générer de questions. Réessayez avec un texte plus long.");
                setIsLoading(false);
                setAiProgress(0);
            }
        } catch (err) {
            if (err.name === 'AbortError' || err.code === 'ERR_CANCELED' || err.message === 'canceled') {
                console.log("Génération annulée par l'utilisateur.");
                return;
            }
            console.error("AI Generation failed:", err);
            // Normalize error message from different shapes (thrown object, fetch error, axios-like)
            const errMsg = (err && (err.detail || err.message || err.error)) || (err?.response?.data?.detail) || JSON.stringify(err);
            alert("Erreur lors de la génération : " + errMsg);
            setIsLoading(false);
            setAiProgress(0);
        } finally {
            clearInterval(progressInterval);
            clearInterval(msgInterval);
        }
    };

    const maybeTranslateManualQuiz = async (baseQuizData, baseQuestions) => {
        if ((creationMode || '').startsWith('ai')) {
            return { titre: baseQuizData.titre, description: baseQuizData.description, questions: baseQuestions };
        }

        const targetLanguage = (manualLanguage || 'Français').trim();
        const isFrench = ['fr', 'français', 'francais', 'french'].includes(targetLanguage.toLowerCase());
        if (isFrench) {
            return { titre: baseQuizData.titre, description: baseQuizData.description, questions: baseQuestions };
        }

        const translated = await api.post('/quiz/translate/manual', {
            titre: baseQuizData.titre,
            description: baseQuizData.description,
            questions: baseQuestions,
            target_language: targetLanguage
        });

        return {
            titre: translated?.titre || baseQuizData.titre,
            description: translated?.description || baseQuizData.description,
            questions: Array.isArray(translated?.questions) && translated.questions.length > 0 ? translated.questions : baseQuestions,
        };
    };

    const handlePublish = async ({ launchAfterPublish = false, forcedQuestions = null, forcedQuizData = null } = {}) => {
        setIsLoading(true);
        try {
            const sourceQuizData = forcedQuizData || quizData;
            const sourceQuestions = Array.isArray(forcedQuestions) ? forcedQuestions : questions;

            let finalImageUrl = sourceQuizData.image_couverture_url || '';

            // If user picked a thumbnail file, upload it to the server first
            if (thumbnailFile) {
                const thumbForm = new FormData();
                thumbForm.append('file', thumbnailFile);
                try {
                    const thumbResp = await api.post('/quiz/upload-thumbnail', thumbForm);
                    finalImageUrl = thumbResp.image_couverture_url;
                } catch (thumbErr) {
                    console.warn('[Publish] Thumbnail upload failed, saving without image:', thumbErr);
                    finalImageUrl = ''; // Don't block publish because of thumbnail
                }
            }

            const isAICreation = (creationMode || '').startsWith('ai');
            const normalizedManualQuestions = sourceQuestions.map(sanitizeQuestionForApi);
            const translatedManual = await maybeTranslateManualQuiz(sourceQuizData, normalizedManualQuestions);
            const finalQuizData = isAICreation
                ? sourceQuizData
                : {
                    ...sourceQuizData,
                    titre: translatedManual.titre,
                    description: translatedManual.description,
                };
            const finalQuestions = isAICreation ? sourceQuestions : translatedManual.questions;
            const selectedTimeMode = aiSettings.time_mode;
            const selectedTimeValue = Number.isFinite(Number(aiSettings.time_value)) ? Number(aiSettings.time_value) : null;
            const computedDurationMinutes = selectedTimeMode === 'Timer Global'
                ? (selectedTimeValue ?? sourceQuizData.duree_max_minutes)
                : null;

            const payload = {
                ...finalQuizData,
                duree_max_minutes: computedDurationMinutes,
                type_creation: editingQuiz ? (editingQuiz.type_creation || (isAICreation ? 'ai' : 'manual')) : (isAICreation ? 'ai' : 'manual'),
                image_couverture_url: finalImageUrl,
                questions: finalQuestions,
                parametres_generation: isAICreation
                    ? {
                        ...aiSettings,
                        type_creation: 'ai',
                        prompt: aiInput,
                        saved_documents: savedDocuments
                    }
                    : {
                        type_creation: 'manual',
                        language: manualLanguage,
                        time_mode: aiSettings.time_mode,
                        time_value: aiSettings.time_value,
                        show_immediate_feedback: aiSettings.show_immediate_feedback
                    }
            };

            let response;
            if (editingQuiz) {
                response = await api.put(`/quiz/${editingQuiz.id_quiz}`, payload);
            } else if (generatedQuizId) {
                // Update the auto-saved draft instead of creating a new one
                response = await api.put(`/quiz/${generatedQuizId}`, payload);
            } else {
                response = await api.post('/quiz/manual', payload);
            }

            const publishedQuizId = response?.id_quiz || response?.data?.id_quiz || editingQuiz?.id_quiz || generatedQuizId;

            if (launchAfterPublish && publishedQuizId) {
                if (isSession && onLaunchLiveSession) {
                    try {
                        const sessionResponse = await api.post('/session/', {
                            id_quiz: publishedQuizId,
                            mode_acces: sourceQuizData.visibilite || 'private'
                        });
                        onLaunchLiveSession(sessionResponse.code_session, true);
                    } catch (sessionErr) {
                        console.error("Failed to create live session:", sessionErr);
                        alert("Erreur lors de la création de la session live.");
                    }
                } else if (onLaunchQuiz) {
                    await onLaunchQuiz(publishedQuizId);
                }
                return response;
            }

            setStep('success');
            setTimeout(() => onClose(), 2000);
            return response;
        } catch (err) {
            console.error("Publication failed:", err);
            if (err.status !== 401) {
                alert("Erreur lors de la publication : " + (err.response?.data?.detail || err.message || "Erreur inconnue"));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartAI = (mode) => {
        setCreationMode(mode);
        setStep('ai_config');
    };

    const handleStartManual = () => {
        setCreationMode('manual');
        setStep('manual_editor');
        setOptionCount(2);
        setManualLanguage('Français');
        // Add first empty question
        setQuestions([createManualQuestion(2)]);
    };

    const handleJoinSessionByCode = async () => {
        if (isJoiningSession) return;

        const code = String(sessionJoinCode || '').trim().toUpperCase();
        if (!code) {
            setJoinSessionError('Entrez un code de session.');
            return;
        }

        setJoinSessionError('');
        setIsJoiningSession(true);

        try {
            const joinResponse = await api.post(`/session/${code}/join`, {});

            const isCreatorRole = joinResponse?.role === 'creator';

            if (isCreatorRole) {
                if (onLaunchLiveSession) {
                    onLaunchLiveSession(code, true);
                } else if (onJoinLiveSession) {
                    onJoinLiveSession(code, true);
                }
                return;
            }

            if (onJoinLiveSession) {
                onJoinLiveSession(code, false);
            } else if (onLaunchLiveSession) {
                onLaunchLiveSession(code, false);
            }
        } catch (err) {
            setJoinSessionError(err?.detail || err?.message || "Impossible de rejoindre cette session.");
        } finally {
            setIsJoiningSession(false);
        }
    };

    const handleBack = () => {
        if (isLoading) {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            setIsLoading(false);
            setAiProgress(0);
        }

        if (step === 'main_choice') onClose();
        else if (step === 'selector') setStep('main_choice');
        else if (step === 'join_session') setStep('selector');
        else if (step === 'ai_config') setStep('selector');
        else if (step === 'manual_editor') setStep('main_choice');
        else if (step === 'success') onClose();
        else setStep('main_choice');
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto overflow-x-hidden transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col relative"
            >
                {/* Back Button (instead of close) - Hidden during review to avoid overlap */}
                {step !== 'review_generated' && (
                    <button
                        onClick={handleBack}
                        className="fixed top-8 left-8 p-3 rounded-full transition-all z-[100] flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 backdrop-blur-md shadow-lg group"
                        style={{ color: 'var(--text-primary)' }}
                        aria-label={step === 'main_choice' ? 'Quitter' : 'Retour'}
                    >
                        {step === 'main_choice' ? <X size={24} className="group-hover:rotate-90 transition-transform" /> : <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />}
                    </button>
                )}

                {step === 'main_choice' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-3xl w-full"
                        >
                            <h1 className="text-5xl font-black mb-4 transition-colors" style={{ color: 'var(--text-primary)' }}>Que voulez-vous créer ?</h1>
                            <p className="text-xl mb-16 transition-colors" style={{ color: 'var(--text-secondary)' }}>Choisissez le mode qui correspond à votre expérience.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* Solo Mode */}
                                <motion.div
                                    whileHover={{ y: -5, scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    onClick={() => { setIsSession(false); setStep('selector'); }}
                                    className="p-8 rounded-[32px] bg-linear-to-br from-purple-600 to-indigo-700 text-white cursor-pointer group shadow-2xl shadow-purple-200 text-left relative overflow-hidden"
                                >
                                    <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform">
                                        <Plus size={240} />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-[20px] flex items-center justify-center mb-6 shadow-xl group-hover:rotate-6 transition-transform">
                                            <FileText size={32} />
                                        </div>
                                        <h3 className="text-3xl font-black mb-3">Mode Solo</h3>
                                        <p className="text-purple-100 text-lg leading-relaxed mb-12 max-w-sm">
                                            Créez un quiz personnel. Utilisez l'IA ou votre expertise pour bâtir le défi parfait.
                                        </p>
                                        <div className="flex items-center gap-3 font-black text-lg">
                                            Continuer <ArrowRight size={24} />
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Session Mode */}
                                <motion.div
                                    whileHover={{ y: -5, scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    onClick={() => { setIsSession(true); setStep('selector'); }}
                                    className="p-8 rounded-[32px] bg-linear-to-br from-amber-400 via-yellow-500 to-orange-600 text-white cursor-pointer group shadow-2xl shadow-amber-100 text-left relative overflow-hidden"
                                >
                                    <div className="absolute -right-10 -bottom-10 opacity-15 text-white">
                                        <Users size={240} />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-[20px] flex items-center justify-center mb-6 shadow-xl group-hover:rotate-6 transition-transform">
                                            <Users size={32} className="text-white" />
                                        </div>
                                        <h3 className="text-3xl font-black mb-3">Session Live</h3>
                                        <p className="text-amber-50 text-lg leading-relaxed mb-12 max-w-sm">
                                            Créez un événement en direct. Défiez vos amis ou vos collègues en temps réel.
                                        </p>
                                        <div className="flex items-center gap-3 font-black text-lg text-white">
                                            Créer une session <ChevronRight size={24} />
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {step === 'selector' && (
                    <div className="flex-1 overflow-y-auto p-12 py-12">
                        {/* Selector Content */}
                        <div className="max-w-4xl mx-auto">
                            <h1 className="text-4xl font-black mb-2 transition-colors" style={{ color: 'var(--text-primary)' }}>
                                {isSession ? 'Create Live Session' : 'Create Solo Quiz'}
                            </h1>
                            <p className="text-lg mb-8 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                                {isSession ? 'Lancez un défi en temps réel pour votre communauté.' : 'Transformez vos idées en défis interactifs.'}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* IA Card */}
                                <motion.div
                                    whileHover={{ y: -5, scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    onClick={() => handleStartAI('ai_prompt')}
                                    className="p-8 rounded-[32px] bg-linear-to-br from-purple-600 to-indigo-700 text-white cursor-pointer group relative overflow-hidden shadow-xl shadow-purple-200"
                                >
                                    <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                                        <Sparkles size={120} />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                                            <Brain size={32} />
                                        </div>
                                        <h3 className="text-2xl font-black mb-2">Génération IA</h3>
                                        <p className="text-purple-100 text-sm leading-relaxed mb-8">
                                            L'IA analyse vos documents ou sujets pour créer un quiz complet en secondes.
                                        </p>
                                        <div className="flex items-center gap-2 font-bold text-sm">
                                            Essayer la génération <ArrowRight size={18} />
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Manual Card */}
                                <motion.div
                                    whileHover={{ y: -5, scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    onClick={handleStartManual}
                                    className="p-8 rounded-[32px] bg-linear-to-br from-emerald-500 to-teal-600 text-white cursor-pointer group relative overflow-hidden shadow-xl shadow-emerald-200"
                                >
                                    <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                                        <FileText size={120} />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                                            <FileText size={32} />
                                        </div>
                                        <h3 className="text-2xl font-black mb-2">Création Manuelle</h3>
                                        <p className="text-emerald-100 text-sm leading-relaxed mb-8">
                                            Contrôlez chaque détail. Ajoutez vos propres questions, images et explications.
                                        </p>
                                        <div className="flex items-center gap-2 font-bold text-sm">
                                            Devenir artisan <ChevronRight size={18} />
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Community Card */}
                                <motion.div
                                    whileHover={{ y: -5, scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    onClick={() => {
                                        if (isSession) {
                                            setSessionJoinCode('');
                                            setJoinSessionError('');
                                            setStep('join_session');
                                        }
                                    }}
                                    className="p-8 rounded-[32px] bg-linear-to-br from-blue-500 to-cyan-600 text-white cursor-pointer group relative overflow-hidden shadow-xl shadow-blue-200"
                                >
                                    <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                                        <Users size={120} />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                                            <Users size={32} />
                                        </div>
                                        <h3 className="text-2xl font-black mb-2">{isSession ? 'Accéder à une session' : 'Cloner / Importer'}</h3>
                                        <p className="text-blue-100 text-sm leading-relaxed mb-8">
                                            {isSession
                                                ? 'Entrez un code de session pour rejoindre la salle d\'attente en direct.'
                                                : 'Partez d\'un quiz existant de la communauté et adaptez-le à vos besoins.'}
                                        </p>
                                        <div className="flex items-center gap-2 font-bold text-sm">
                                            {isSession ? 'Rejoindre' : 'Explorer'} <ChevronRight size={18} />
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'join_session' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-2xl w-full"
                        >
                            <div className="mx-auto w-20 h-20 rounded-3xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center mb-6">
                                <Users size={36} />
                            </div>

                            <h1 className="text-5xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>Accéder à une session</h1>
                            <p className="text-lg mb-10" style={{ color: 'var(--text-secondary)' }}>
                                Entrez le code de session partagé par le créateur pour rejoindre la salle d'attente.
                            </p>

                            <div className="mx-auto max-w-xl p-8 rounded-[32px] border shadow-2xl" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <label className="text-[10px] font-black uppercase tracking-widest opacity-60" style={{ color: 'var(--text-secondary)' }}>
                                    Code session
                                </label>

                                <input
                                    type="text"
                                    maxLength={6}
                                    value={sessionJoinCode}
                                    onChange={(e) => {
                                        setSessionJoinCode(e.target.value.toUpperCase());
                                        if (joinSessionError) setJoinSessionError('');
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleJoinSessionByCode();
                                        }
                                    }}
                                    placeholder="ABC123"
                                    className="w-full mt-3 mb-3 border-2 border-transparent rounded-2xl px-5 py-4 text-center text-4xl font-black tracking-[0.35em] uppercase outline-none focus:border-cyan-500 transition-all"
                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                />

                                {joinSessionError && (
                                    <p className="text-sm font-bold text-red-500 mb-4">{joinSessionError}</p>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleJoinSessionByCode}
                                    disabled={isJoiningSession || !sessionJoinCode.trim()}
                                    className="w-full py-4 rounded-2xl font-black text-lg text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 transition-all shadow-xl shadow-cyan-500/20"
                                >
                                    {isJoiningSession ? 'Connexion...' : 'Entrer dans la session'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {step === 'ai_config' && !isLoading && (
                    <div className="flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar font-inter transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)' }}>
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-[84rem] w-full"
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                {/* Column 1: Metadata (Aesthetics & Identity) */}
                                <div className="space-y-6 glass-card p-6 rounded-[32px] shadow-2xl transition-all duration-500"
                                    style={{ borderColor: 'var(--glass-border)' }}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 enthusiast-gradient text-white rounded-xl flex items-center justify-center shadow-lg">
                                            <ImageIcon size={20} />
                                        </div>
                                        <h3 className="font-outfit text-xl font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>Identité du Quiz</h3>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Titre du Quiz</label>
                                            <input
                                                type="text"
                                                value={quizData.titre}
                                                onChange={(e) => setQuizData({ ...quizData, titre: e.target.value })}
                                                className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-4 py-3 outline-none focus:border-indigo-400 transition-all font-bold"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                placeholder="Ex: Voyage au centre de la Terre"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Description</label>
                                            <textarea
                                                value={quizData.description}
                                                onChange={(e) => setQuizData({ ...quizData, description: e.target.value })}
                                                className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-4 py-3 outline-none focus:border-indigo-400 transition-all font-medium text-sm resize-none h-24"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                placeholder="Décrivez votre quiz en quelques mots..."
                                            />
                                        </div>

                                        {/* Thumbnail Upload with YouTube-style hover preview */}
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Miniature (Thumbnail)</label>
                                            <div className="mt-2 relative group cursor-pointer overflow-hidden rounded-2xl aspect-4/3 border-2 border-dashed hover:border-indigo-400 transition-all"
                                                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                                                {quizData.image_couverture_url ? (
                                                    <>
                                                        <img src={quizData.image_couverture_url} alt="Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button onClick={(e) => {
                                                                e.stopPropagation();
                                                                setQuizData({ ...quizData, image_couverture_url: '' });
                                                                setThumbnailFile(null);
                                                                if (document.getElementById('thumb-upload')) {
                                                                    document.getElementById('thumb-upload').value = '';
                                                                }
                                                            }} className="p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4" onClick={() => document.getElementById('thumb-upload').click()}>
                                                        <Upload size={24} className="mb-2" />
                                                        <p className="text-[10px] font-bold text-center">CLIQUEZ POUR UPLOADER (PNG, JPG)</p>
                                                    </div>
                                                )}
                                                <input id="thumb-upload" type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        setThumbnailFile(file); // Keep raw file for server upload
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => setQuizData({ ...quizData, image_couverture_url: ev.target.result });
                                                        reader.readAsDataURL(file);
                                                    }
                                                }} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Visibilité</label>
                                                <select
                                                    value={quizData.visibilite}
                                                    onChange={(e) => setQuizData({ ...quizData, visibilite: e.target.value })}
                                                    className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-400 transition-all"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                >
                                                    <option value="public" className="bg-white dark:bg-[#161b27]">Public</option>
                                                    <option value="private" className="bg-white dark:bg-[#161b27]">Privé</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Clonable</label>
                                                <div className="mt-1.5 flex items-center h-[42px] px-3 border-2 border-transparent rounded-2xl transition-all"
                                                    style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={quizData.peut_etre_clone}
                                                        onChange={(e) => setQuizData({ ...quizData, peut_etre_clone: e.target.checked })}
                                                        className="w-4 h-4 accent-indigo-600"
                                                    />
                                                    <span className="ml-2 text-xs font-bold opacity-70">Oui</span>
                                                </div>
                                            </div>
                                        </div>

                                        {quizData.visibilite === 'public' && (
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                                    <Tag size={10} /> Tags (Séparez par virgule)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={quizData.tags.join(', ')}
                                                    onChange={(e) => setQuizData({ ...quizData, tags: e.target.value.split(',').map(t => t.trim()) })}
                                                    className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-4 py-2.5 outline-none focus:border-indigo-400 transition-all font-bold text-xs"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--accent)' }}
                                                    placeholder="Histoire, Science, Fun..."
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Column 2: Source (Content & Files) */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                                            <Sparkles size={24} />
                                        </div>
                                        <div>
                                            <h2 className="font-outfit text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Source du Savoir</h2>
                                            <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest opacity-80">Le contenu qui alimente l'IA</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="relative">
                                            <textarea
                                                className="w-full h-48 border-2 border-transparent rounded-[32px] p-6 outline-none focus:border-indigo-400 shadow-2xl text-lg font-medium resize-none font-inter transition-all duration-500"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                                                placeholder="Décrivez le sujet ou copiez un texte ici..."
                                                value={aiInput}
                                                onChange={(e) => setAiInput(e.target.value)}
                                            />
                                            <div className="absolute bottom-4 right-6 text-[10px] font-bold uppercase italic opacity-30" style={{ color: 'var(--text-secondary)' }}>Texte optionnel</div>
                                        </div>

                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            className="hidden"
                                            multiple
                                            accept=".pdf,.txt,.doc,.docx"
                                        />

                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full border-4 border-dashed rounded-[32px] flex flex-col items-center justify-center p-8 transition-all cursor-pointer group shadow-sm"
                                            style={{ backgroundColor: 'var(--bg-elevated)', borderStyle: 'dashed', borderColor: 'var(--glass-border)' }}
                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                                        >
                                            <div className="w-14 h-14 enthusiast-gradient text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
                                                <Upload size={28} />
                                            </div>
                                            <p className="font-outfit text-lg font-bold text-slate-700">Exploitez vos documents</p>
                                            <p className="text-xs text-slate-400 font-medium mt-1">PDF, TXT, DOCX (Max 5Mo)</p>
                                        </div>

                                        {files.length > 0 && (
                                            <div className="grid grid-cols-1 gap-2 mt-4">
                                                {files.map((file, idx) => (
                                                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={idx}
                                                        className="flex items-center justify-between p-3 border rounded-2xl shadow-sm"
                                                        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--accent)' }}>
                                                                <FileText size={16} />
                                                            </div>
                                                            <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</span>
                                                        </div>
                                                        <button onClick={() => handleRemoveFile(idx)} className="opacity-50 hover:opacity-100 hover:text-red-500 p-2 transition-colors" style={{ color: 'var(--text-muted)' }}>
                                                            <X size={18} />
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}

                                        {savedDocuments.length > 0 && (
                                            <div className="grid grid-cols-1 gap-2 mt-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50 mb-2 mt-4" style={{ color: 'var(--text-secondary)' }}>Fichiers déjà envoyés</p>
                                                {savedDocuments.map((doc, idx) => (
                                                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={`saved-${idx}`}
                                                        className="flex items-center justify-between p-3 border rounded-2xl shadow-sm"
                                                        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600">
                                                                <FileText size={16} />
                                                            </div>
                                                            <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{doc.name}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <a href={doc.url} download={doc.name} className="p-2 border rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--glass-border)' }} title="Télécharger">
                                                                <Download size={16} className="text-emerald-500" />
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveSavedDocument(idx)}
                                                                className="p-2 border rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                                                style={{ borderColor: 'var(--glass-border)' }}
                                                                title="Retirer de la génération"
                                                            >
                                                                <X size={16} className="text-red-500" />
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Column 3: AI Settings (Parameters) */}
                                <div className="space-y-6 glass-card p-6 rounded-[32px] shadow-2xl transition-all duration-500"
                                    style={{ borderColor: 'var(--glass-border)' }}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                                            <Settings size={20} />
                                        </div>
                                        <h3 className="font-outfit text-xl font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>Intelligence IA</h3>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Feedback Toggle */}
                                        <div className="p-4 rounded-2xl border transition-all duration-500"
                                            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                                                    <Sparkles size={12} /> Correction Immédiate
                                                </label>
                                                <div
                                                    onClick={() => setAiSettings({ ...aiSettings, show_immediate_feedback: !aiSettings.show_immediate_feedback })}
                                                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ${aiSettings.show_immediate_feedback ? 'bg-indigo-600' : 'bg-slate-500/30'}`}
                                                >
                                                    <motion.div
                                                        animate={{ x: aiSettings.show_immediate_feedback ? 24 : 0 }}
                                                        className="w-4 h-4 bg-white rounded-full shadow-sm"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] font-medium leading-tight opacity-50" style={{ color: 'var(--text-secondary)' }}>Affiche la réponse et l'explication après chaque clic.</p>
                                        </div>

                                        {/* Question Type */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Type de Défi</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {['QCM', 'Vrai ou Faux', 'Mélangé', 'Plusieurs Réponses'].map(t => (
                                                    <button
                                                        key={t}
                                                        onClick={() => setAiSettings({ ...aiSettings, question_type: t })}
                                                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border-2 duration-300 ${aiSettings.question_type === t ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl' : 'hover:border-indigo-400/30'}`}
                                                        style={{ backgroundColor: aiSettings.question_type === t ? '' : 'var(--bg-elevated)', borderColor: aiSettings.question_type === t ? '' : 'transparent', color: aiSettings.question_type === t ? '' : 'var(--text-secondary)' }}
                                                    >
                                                        {t}
                                                        {aiSettings.question_type === t && <Check size={14} className="text-white" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Difficulty Selector */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Niveau de Difficulté</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {['Débutant', 'Moyen', 'Expert'].map(d => (
                                                    <button
                                                        key={d}
                                                        onClick={() => setAiSettings({ ...aiSettings, difficulty: d })}
                                                        className={`py-2 rounded-xl text-[10px] font-bold transition-all border duration-300 ${aiSettings.difficulty === d ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                        style={{ backgroundColor: aiSettings.difficulty === d ? '' : 'var(--bg-elevated)', color: aiSettings.difficulty === d ? '' : 'var(--text-primary)' }}
                                                    >
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Number of Questions */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Volume</label>
                                                <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm font-black shadow-lg shadow-indigo-500/10">{aiSettings.num_questions} Questions</span>
                                            </div>
                                            <input
                                                type="range" min="5" max="25" step="5"
                                                value={aiSettings.num_questions}
                                                onChange={(e) => setAiSettings({ ...aiSettings, num_questions: parseInt(e.target.value) })}
                                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                            />
                                        </div>

                                        {/* Time Management */}
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Pression Temporelle</label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {['Pas de limite', 'Mode Chrono', 'Timer Global'].map(m => (
                                                    <button
                                                        key={m}
                                                        onClick={() => setAiSettings({ ...aiSettings, time_mode: m })}
                                                        className={`py-2 px-4 rounded-xl text-[10px] font-bold transition-all border-2 ${aiSettings.time_mode === m ? 'bg-white text-[#0d1117] border-white shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                        style={{ backgroundColor: aiSettings.time_mode === m ? '' : 'var(--bg-elevated)', color: aiSettings.time_mode === m ? '' : 'var(--text-primary)' }}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>

                                            {aiSettings.time_mode !== 'Pas de limite' && (
                                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                                    className="flex items-center gap-3 p-4 rounded-2xl border transition-all duration-500"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                    <Clock size={20} className="text-indigo-500" />
                                                    <input
                                                        type="number"
                                                        value={aiSettings.time_value}
                                                        onChange={(e) => setAiSettings({ ...aiSettings, time_value: parseInt(e.target.value) })}
                                                        className="w-full bg-transparent outline-none font-black text-lg"
                                                        style={{ color: 'var(--text-primary)' }}
                                                    />
                                                    <span className="text-xs font-black uppercase opacity-50">
                                                        {aiSettings.time_mode === 'Mode Chrono' ? 'Sec/Q' : 'Min'}
                                                    </span>
                                                </motion.div>
                                            )}
                                        </div>

                                        {/* Tone */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Style de Discours</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {['Fun', 'Académique', 'Explorateur'].map(tone => (
                                                    <button
                                                        key={tone}
                                                        onClick={() => setAiSettings({ ...aiSettings, tone })}
                                                        className={`py-2 rounded-xl text-[10px] font-bold transition-all border duration-300 ${aiSettings.tone === tone ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                        style={{ backgroundColor: aiSettings.tone === tone ? '' : 'var(--bg-elevated)', color: aiSettings.tone === tone ? '' : 'var(--text-primary)' }}
                                                    >
                                                        {tone}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Language */}
                                        <div className="pt-4 border-t border-indigo-500/10 space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: 'var(--text-secondary)' }}>Langue du Quiz</label>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { name: 'Français', icon: '🇫🇷' },
                                                        { name: 'English', icon: '🇬🇧' },
                                                        { name: 'Arabe', icon: '🇸🇦' },
                                                        { name: 'Espagnol', icon: '🇪🇸' }
                                                    ].map((lang) => (
                                                        <button
                                                            key={lang.name}
                                                            onClick={() => setAiSettings({ ...aiSettings, language: lang.name })}
                                                            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition-all duration-300 font-bold text-xs ${aiSettings.language === lang.name ? 'shadow-lg ring-2 ring-indigo-500' : 'opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                            style={{ 
                                                                backgroundColor: aiSettings.language === lang.name ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                                                                color: aiSettings.language === lang.name ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                            }}
                                                        >
                                                            <span className="text-base">{lang.icon}</span> {lang.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Controls */}
                            <div className="mt-12 flex items-center justify-between border-t pt-8 pb-12 transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                                <button
                                    onClick={() => setStep(editingQuiz ? 'selector' : 'selector')} // Still go back to selector or main_choice
                                    className="px-8 py-4 font-bold transition-colors flex items-center gap-2 opacity-50 hover:opacity-100"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <ChevronRight size={20} className="rotate-180" /> Retour
                                </button>

                                <div className="flex gap-4">
                                    {editingQuiz && (
                                        <div className="flex gap-3">
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={handlePublish}
                                                disabled={isLoading || !quizData.titre}
                                                className="px-6 py-4 bg-white/5 border border-indigo-500/30 text-indigo-500 rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-indigo-500/10 transition-all"
                                            >
                                                {isLoading ? '...' : 'Sauvegarder'} <Check size={18} />
                                            </motion.button>

                                        </div>
                                    )}

                                    <motion.button
                                        whileHover={{ scale: 1.05, y: -2 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handleAIGenerate}
                                        disabled={!canRegenerate}
                                        className={`px-12 py-5 rounded-full font-outfit font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4 ${canRegenerate ? 'enthusiast-gradient text-white shadow-indigo-500/20' : 'opacity-20 pointer-events-none'}`}
                                        style={{ backgroundColor: canRegenerate ? '' : 'var(--bg-elevated)', color: canRegenerate ? '' : 'var(--text-muted)' }}
                                    >
                                        {editingQuiz ? 'Régénérer' : (isSession ? 'Créer le quiz' : 'Générer')} <Sparkles size={24} />
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {step === 'ai_config' && isLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)' }}>
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="max-w-md w-full space-y-12"
                        >
                            <div className="relative w-48 h-48 mx-auto">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-0 rounded-full border-t-4 border-purple-500 border-opacity-30"
                                />
                                <motion.div
                                    animate={{ rotate: -360 }}
                                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-4 rounded-full border-l-4 border-indigo-500 border-opacity-40"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                        className="w-24 h-24 bg-linear-to-br from-purple-600 to-indigo-600 rounded-[32px] flex items-center justify-center shadow-2xl shadow-purple-200"
                                    >
                                        <Sparkles size={48} className="text-white" />
                                    </motion.div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-3xl font-black leading-tight transition-colors" style={{ color: 'var(--text-primary)' }}>
                                    Création de la magie...
                                </h3>
                                <p className="font-medium text-lg h-8 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                                    {aiLoadingMessage}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-black uppercase tracking-widest px-2" style={{ color: 'var(--accent)' }}>
                                    <span>Génération</span>
                                    <span>{Math.round(aiProgress)}%</span>
                                </div>
                                <div className="w-full h-3 rounded-full overflow-hidden shadow-inner" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                    <motion.div
                                        className="h-full bg-linear-to-r from-purple-600 to-indigo-600"
                                        animate={{ width: `${aiProgress}%` }}
                                        transition={{ ease: "easeInOut", duration: 0.5 }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {step === 'review_generated' && (
                    <QuizPlayer
                        quiz={{
                            titre: quizData.titre,
                            description: quizData.description,
                            type_creation: 'ai',
                            questions,
                            duree_max_minutes: quizData.duree_max_minutes,
                            parametres_generation: {
                                ...aiSettings,
                                type_creation: 'ai'
                            }
                        }}
                        onClose={() => setStep('ai_config')}
                        isReview={true}
                        publishLabel={isSession ? 'CRÉER LE LOBBY' : 'PUBLIER'}
                        onPublish={() => handlePublish({ launchAfterPublish: isSession })}
                    />
                )}

                {step === 'manual_editor' && (
    <div className="flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar font-inter transition-colors duration-500" style={{ backgroundColor: 'var(--bg-base)' }}>
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[84rem] w-full"
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
<div className="space-y-6 glass-card p-6 rounded-[32px] shadow-2xl transition-all duration-500"
                                    style={{ borderColor: 'var(--glass-border)' }}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 enthusiast-gradient text-white rounded-xl flex items-center justify-center shadow-lg">
                                            <ImageIcon size={20} />
                                        </div>
                                        <h3 className="font-outfit text-xl font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>Identité du Quiz</h3>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Titre du Quiz</label>
                                            <input
                                                type="text"
                                                value={quizData.titre}
                                                onChange={(e) => setQuizData({ ...quizData, titre: e.target.value })}
                                                className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-4 py-3 outline-none focus:border-indigo-400 transition-all font-bold"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                placeholder="Ex: Voyage au centre de la Terre"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Description</label>
                                            <textarea
                                                value={quizData.description}
                                                onChange={(e) => setQuizData({ ...quizData, description: e.target.value })}
                                                className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-4 py-3 outline-none focus:border-indigo-400 transition-all font-medium text-sm resize-none h-24"
                                                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                placeholder="Décrivez votre quiz en quelques mots..."
                                            />
                                        </div>

                                        {/* Thumbnail Upload with YouTube-style hover preview */}
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Miniature (Thumbnail)</label>
                                            <div className="mt-2 relative group cursor-pointer overflow-hidden rounded-2xl aspect-4/3 border-2 border-dashed hover:border-indigo-400 transition-all"
                                                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                                                {quizData.image_couverture_url ? (
                                                    <>
                                                        <img src={quizData.image_couverture_url} alt="Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button onClick={(e) => {
                                                                e.stopPropagation();
                                                                setQuizData({ ...quizData, image_couverture_url: '' });
                                                                setThumbnailFile(null);
                                                                if (document.getElementById('thumb-upload')) {
                                                                    document.getElementById('thumb-upload').value = '';
                                                                }
                                                            }} className="p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4" onClick={() => document.getElementById('thumb-upload').click()}>
                                                        <Upload size={24} className="mb-2" />
                                                        <p className="text-[10px] font-bold text-center">CLIQUEZ POUR UPLOADER (PNG, JPG)</p>
                                                    </div>
                                                )}
                                                <input id="thumb-upload" type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        setThumbnailFile(file); // Keep raw file for server upload
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => setQuizData({ ...quizData, image_couverture_url: ev.target.result });
                                                        reader.readAsDataURL(file);
                                                    }
                                                }} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Visibilité</label>
                                                <select
                                                    value={quizData.visibilite}
                                                    onChange={(e) => setQuizData({ ...quizData, visibilite: e.target.value })}
                                                    className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-400 transition-all"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                                >
                                                    <option value="public" className="bg-white dark:bg-[#161b27]">Public</option>
                                                    <option value="private" className="bg-white dark:bg-[#161b27]">Privé</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Clonable</label>
                                                <div className="mt-1.5 flex items-center h-[42px] px-3 border-2 border-transparent rounded-2xl transition-all"
                                                    style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={quizData.peut_etre_clone}
                                                        onChange={(e) => setQuizData({ ...quizData, peut_etre_clone: e.target.checked })}
                                                        className="w-4 h-4 accent-indigo-600"
                                                    />
                                                    <span className="ml-2 text-xs font-bold opacity-70">Oui</span>
                                                </div>
                                            </div>
                                        </div>

                                        {quizData.visibilite === 'public' && (
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                                    <Tag size={10} /> Tags (Séparez par virgule)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={quizData.tags.join(', ')}
                                                    onChange={(e) => setQuizData({ ...quizData, tags: e.target.value.split(',').map(t => t.trim()) })}
                                                    className="w-full mt-1.5 border-2 border-transparent rounded-2xl px-4 py-2.5 outline-none focus:border-indigo-400 transition-all font-bold text-xs"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--accent)' }}
                                                    placeholder="Histoire, Science, Fun..."
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                
                {/* Column 2: Manual Questions Editor */}
                <div className="space-y-6 lg:max-h-[800px] overflow-y-auto overflow-x-hidden custom-scrollbar p-2 min-w-0">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="font-outfit text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Contenu du Quiz</h2>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest opacity-80">Rédigez vos questions</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h2 className="text-xl font-black transition-colors" style={{ color: 'var(--text-primary)' }}>Questions ({questions.length})</h2>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-transparent transition-all" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: 'var(--text-secondary)' }}>Options</span>
                                    <input
                                        type="number"
                                        min={2}
                                        max={6}
                                        step={1}
                                        value={optionCount}
                                        onChange={(e) => handleOptionCountChange(e.target.value)}
                                        className="w-14 bg-transparent border-none outline-none font-black text-center text-sm"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                </div>

                                <button
                                    onClick={() => setQuestions([...questions, createManualQuestion(optionCount)])}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all duration-300 shadow-lg"
                                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--emerald-500)' }}
                                >
                                    <Plus size={16} /> Ajouter
                                </button>
                            </div>
                        </div>

                        <AnimatePresence>
                            {questions.map((q, idx) => {
                                const correctIndexes = getCorrectIndexes(q);
                                return (
                                <motion.div
                                    key={idx}
                                    variants={{
                                        hidden: { opacity: 0, y: 20 },
                                        visible: { opacity: 1, y: 0 }
                                    }}
                                    initial="hidden" animate="visible" exit="hidden"
                                    className="p-6 rounded-[24px] border-2 transition-all hover:border-emerald-500/30 relative shadow-sm group"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                >
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="w-8 h-8 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0 bg-emerald-500 shadow-lg">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <textarea
                                                placeholder="Votre question ici..."
                                                className="w-full text-xl font-bold bg-transparent border-none outline-none resize-none min-h-[64px] transition-colors"
                                                style={{ color: 'var(--text-primary)' }}
                                                rows={3}
                                                value={q.texte_question}
                                                onChange={(e) => {
                                                    const newQs = [...questions];
                                                    newQs[idx].texte_question = e.target.value;
                                                    setQuestions(newQs);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {q.options_reponses.map((opt, optIdx) => (
                                            (() => {
                                                const isChecked = correctIndexes.includes(optIdx);
                                                return (
                                            <div
                                                key={optIdx}
                                                className={`relative flex items-center gap-3 p-3 rounded-xl border-2 overflow-hidden transition-all duration-500 ${isChecked ? 'border-green-500 shadow-md bg-green-500/5' : 'border-transparent'}`}
                                                style={{ backgroundColor: isChecked ? '' : 'var(--bg-elevated)' }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newQs = [...questions];
                                                        const currentQuestion = newQs[idx];
                                                        const currentIndexes = getCorrectIndexes(currentQuestion);
                                                        const currentlyChecked = currentIndexes.includes(optIdx);
                                                        const optionLength = currentQuestion.options_reponses?.length || 0;
                                                        const maxSelectable = Math.max(1, optionLength - 1);

                                                        let nextIndexes = currentIndexes;
                                                        if (currentlyChecked) {
                                                            if (currentIndexes.length > 1) {
                                                                nextIndexes = currentIndexes.filter(index => index !== optIdx);
                                                            }
                                                        } else if (currentIndexes.length < maxSelectable) {
                                                            nextIndexes = [...currentIndexes, optIdx].sort((a, b) => a - b);
                                                        } else if (maxSelectable === 1) {
                                                            nextIndexes = [optIdx];
                                                        }

                                                        newQs[idx] = normalizeManualQuestion({
                                                            ...currentQuestion,
                                                            reponses_correctes_idx: nextIndexes,
                                                        });
                                                        setQuestions(newQs);
                                                    }}
                                                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all duration-300 ${isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-slate-500/40'}`}
                                                    title="Marquer comme bonne réponse"
                                                >
                                                    {isChecked && <Check size={12} strokeWidth={4} />}
                                                </button>
                                                <input
                                                    placeholder={`Option ${optIdx + 1}`}
                                                    value={opt}
                                                    onChange={(e) => {
                                                        const newQs = [...questions];
                                                        const currentQuestion = {
                                                            ...newQs[idx],
                                                            options_reponses: [...newQs[idx].options_reponses]
                                                        };
                                                        currentQuestion.options_reponses[optIdx] = e.target.value;
                                                        newQs[idx] = normalizeManualQuestion(currentQuestion);
                                                        setQuestions(newQs);
                                                    }}
                                                    className="flex-1 min-w-0 bg-transparent border-none outline-none font-medium h-6 transition-colors text-base"
                                                    style={{ color: 'var(--text-primary)' }}
                                                />
                                            </div>
                                                );
                                            })()
                                        ))}
                                    </div>

                                    <div className="mt-4 pt-4 border-t flex items-center gap-4 justify-between transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                <Trophy size={14} className="text-orange-400" />
                                                <input
                                                    type="number"
                                                    value={q.points}
                                                    onChange={(e) => {
                                                        const newQs = [...questions];
                                                        newQs[idx].points = parseInt(e.target.value) || 0;
                                                        setQuestions(newQs);
                                                    }}
                                                    className="w-10 bg-transparent border-none outline-none font-black text-center text-sm"
                                                    style={{ color: 'var(--text-primary)' }}
                                                />
                                                <span className="text-[10px] font-black uppercase opacity-50" style={{ color: 'var(--text-secondary)' }}>Points</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                                            className="opacity-50 hover:opacity-100 font-bold text-[10px] uppercase tracking-wider transition-colors text-red-500"
                                        >
                                            Supprimer
                                        </button>
                                    </div>
                                </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
{/* Column 3: AI Settings (Parameters) */}
                                <div className="space-y-6 glass-card p-6 rounded-[32px] shadow-2xl transition-all duration-500"
                                    style={{ borderColor: 'var(--glass-border)' }}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                                            <Settings size={20} />
                                        </div>
                                        <h3 className="font-outfit text-xl font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>Paramètres du Quiz</h3>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Feedback Toggle */}
                                        <div className="p-4 rounded-2xl border transition-all duration-500"
                                            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                                                    <Sparkles size={12} /> Correction Immédiate
                                                </label>
                                                <div
                                                    onClick={() => setAiSettings({ ...aiSettings, show_immediate_feedback: !aiSettings.show_immediate_feedback })}
                                                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ${aiSettings.show_immediate_feedback ? 'bg-indigo-600' : 'bg-slate-500/30'}`}
                                                >
                                                    <motion.div
                                                        animate={{ x: aiSettings.show_immediate_feedback ? 24 : 0 }}
                                                        className="w-4 h-4 bg-white rounded-full shadow-sm"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] font-medium leading-tight opacity-50" style={{ color: 'var(--text-secondary)' }}>Affiche la réponse et l'explication après chaque clic.</p>
                                        </div>


                                        {/* Time Management */}
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50" style={{ color: 'var(--text-secondary)' }}>Pression Temporelle</label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {['Pas de limite', 'Mode Chrono', 'Timer Global'].map(m => (
                                                    <button
                                                        key={m}
                                                        onClick={() => setAiSettings({ ...aiSettings, time_mode: m })}
                                                        className={`py-2 px-4 rounded-xl text-[10px] font-bold transition-all border-2 ${aiSettings.time_mode === m ? 'bg-white text-[#0d1117] border-white shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                        style={{ backgroundColor: aiSettings.time_mode === m ? '' : 'var(--bg-elevated)', color: aiSettings.time_mode === m ? '' : 'var(--text-primary)' }}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>

                                            {aiSettings.time_mode !== 'Pas de limite' && (
                                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                                    className="flex items-center gap-3 p-4 rounded-2xl border transition-all duration-500"
                                                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                    <Clock size={20} className="text-indigo-500" />
                                                    <input
                                                        type="number"
                                                        value={aiSettings.time_value}
                                                        onChange={(e) => setAiSettings({ ...aiSettings, time_value: parseInt(e.target.value) })}
                                                        className="w-full bg-transparent outline-none font-black text-lg"
                                                        style={{ color: 'var(--text-primary)' }}
                                                    />
                                                    <span className="text-xs font-black uppercase opacity-50">
                                                        {aiSettings.time_mode === 'Mode Chrono' ? 'Sec/Q' : 'Min'}
                                                    </span>
                                                </motion.div>
                                            )}
                                        </div>

                                        {/* Language */}
                                        <div className="pt-4 border-t border-indigo-500/10 space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: 'var(--text-secondary)' }}>Langue du Quiz</label>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { name: 'Français', icon: '🇫🇷' },
                                                        { name: 'English', icon: '🇬🇧' },
                                                        { name: 'Arabe', icon: '🇸🇦' },
                                                        { name: 'Espagnol', icon: '🇪🇸' }
                                                    ].map((lang) => (
                                                        <button
                                                            key={lang.name}
                                                            onClick={() => setManualLanguage(lang.name)}
                                                            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition-all duration-300 font-bold text-xs ${manualLanguage === lang.name ? 'shadow-lg ring-2 ring-indigo-500' : 'opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                            style={{ 
                                                                backgroundColor: manualLanguage === lang.name ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                                                                color: manualLanguage === lang.name ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                            }}
                                                        >
                                                            <span className="text-base">{lang.icon}</span> {lang.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            
            {/* Footer */}
            <div className="mt-12 flex items-center justify-between border-t pt-8 pb-12 transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                <button
                    onClick={() => setStep('selector')}
                    className="px-8 py-4 font-bold transition-colors flex items-center gap-2 opacity-50 hover:opacity-100"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <ChevronRight size={20} className="rotate-180" /> Retour
                </button>

                <div className="flex items-center gap-3">
                    <motion.button
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handlePublish()}
                        disabled={isLoading || !canSubmitManualQuiz}
                        className={`px-8 py-4 rounded-full font-outfit font-black text-lg shadow-2xl transition-all flex items-center justify-center gap-3 ${canSubmitManualQuiz ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'opacity-50 bg-slate-500 text-white pointer-events-none'}`}
                    >
                        {isLoading ? 'Enregistrement...' : (editingQuiz ? 'Sauvegarder' : 'Publier Quiz')} <Check size={20} />
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handlePublish({ launchAfterPublish: true })}
                        disabled={isLoading || !canSubmitManualQuiz}
                        className={`px-8 py-4 rounded-full font-outfit font-black text-lg shadow-2xl transition-all flex items-center justify-center gap-3 ${canSubmitManualQuiz ? 'bg-indigo-600 text-white shadow-indigo-500/20' : 'opacity-50 bg-slate-500 text-white pointer-events-none'}`}
                    >
                        {isLoading ? 'Préparation...' : (isSession ? 'Aller au lobby' : 'Jouer')} <Play size={20} />
                    </motion.button>
                </div>
            </div>
        </motion.div>
    </div>
)
}
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
