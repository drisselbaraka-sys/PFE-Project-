import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Play, Copy, Check, Clock, X, Download, FileText, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import api from '../utils/api';

const SessionLobby = ({ sessionCode, isCreator, currentUserId, onClose, onLaunchGame }) => {
    const [sessionData, setSessionData] = useState(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [startNotice, setStartNotice] = useState('');
    const [sessionSettings, setSessionSettings] = useState(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    const hostName = sessionData?.organisateur?.nom_affichage || 'Créateur';
    const hostPhoto = sessionData?.organisateur?.photo_url;
    const quizInfo = sessionData?.quiz;
    const hostMode = isCreator || (!!sessionData && sessionData.id_utilisateur === currentUserId);
    const timeMode = quizInfo?.time_mode;
    const configuredTimeValue = quizInfo?.time_value;
    const participantStats = sessionData?.stats || {};
    const countdownData = sessionData?.countdown || {};
    const isQuizFinishedForHost = hostMode
        && sessionData?.statut === 'active'
        && (participantStats.participant_count ?? 0) > 0
        && (participantStats.completed_count ?? 0) >= (participantStats.participant_count ?? 0);

    const rankedParticipants = [...(sessionData?.participants || [])]
        .sort((a, b) => {
            const aAccuracy = (a.total_score || 0) > 0 ? (a.score || 0) / a.total_score : 0;
            const bAccuracy = (b.total_score || 0) > 0 ? (b.score || 0) / b.total_score : 0;
            if (bAccuracy !== aAccuracy) return bAccuracy - aAccuracy;
            if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
            return (b.progression_percent || 0) - (a.progression_percent || 0);
        })
        .map((participant, index) => ({ ...participant, rank: index + 1 }));

    const durationLabel = timeMode === 'Timer Global'
        ? 'Durée globale'
        : timeMode === 'Mode Chrono'
            ? 'Durée chrono'
            : 'Durée';

    const durationValue = timeMode === 'Timer Global'
        ? `${configuredTimeValue ?? quizInfo?.duree_max_minutes ?? '-'} min`
        : timeMode === 'Mode Chrono'
            ? `${configuredTimeValue ?? '-'} sec/question`
            : (quizInfo?.duree_max_minutes ? `${quizInfo.duree_max_minutes} min` : 'Libre');

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const response = await api.get(`/session/${sessionCode}`, { cache: 'no-store' });
                setSessionData(response);
                if (!sessionSettings && response?.settings) {
                    setSessionSettings({
                        reports_visible_to_participants: response.settings.reports_visible_to_participants ?? true,
                        auto_start_mode: response.settings.auto_start_mode || 'manual',
                        scheduled_start_at: response.settings.scheduled_start_at ? String(response.settings.scheduled_start_at).slice(0, 16) : '',
                        min_participants_to_start: response.settings.min_participants_to_start ?? 20,
                        countdown_seconds: response.settings.countdown_seconds ?? 10,
                    });
                }
                if (!hostMode && response.statut === 'active') {
                    // Quiz started by creator
                    onLaunchGame(response);
                }
            } catch (err) {
                setError("La session n'existe pas ou est terminée.");
            }
        };

        fetchSession();
        const interval = setInterval(fetchSession, 2000); // Polling every 2s
        return () => clearInterval(interval);
    }, [sessionCode, hostMode, onLaunchGame, sessionSettings]);

    const handleCopy = () => {
        navigator.clipboard.writeText(sessionCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStartQuiz = async () => {
        try {
            setIsStarting(true);
            setStartNotice('');
            await api.put(`/session/${sessionCode}/start`);
            setStartNotice('Session lancée. Suivi en direct activé.');
            setSessionData(prev => prev ? { ...prev, statut: 'active' } : prev);
        } catch (err) {
            alert("Erreur lors du lancement de la session");
        } finally {
            setIsStarting(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!sessionSettings) return;
        try {
            setIsSavingSettings(true);
            const payload = {
                reports_visible_to_participants: !!sessionSettings.reports_visible_to_participants,
                auto_start_mode: sessionSettings.auto_start_mode || 'manual',
                min_participants_to_start: Number(sessionSettings.min_participants_to_start || 20),
                countdown_seconds: Number(sessionSettings.countdown_seconds || 10),
            };

            if (sessionSettings.auto_start_mode === 'scheduled' && sessionSettings.scheduled_start_at) {
                payload.scheduled_start_at = new Date(sessionSettings.scheduled_start_at).toISOString();
            }

            const response = await api.put(`/session/${sessionCode}/settings`, payload);
            setSessionData(response);
            setStartNotice('Paramètres live enregistrés.');
        } catch (err) {
            alert("Impossible d'enregistrer les paramètres live.");
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleExportHostReport = async (format) => {
        if (!isQuizFinishedForHost) {
            alert("L'export sera disponible une fois le quiz terminé pour tous les participants.");
            return;
        }

        const rows = rankedParticipants.map((participant) => {
            const accuracy = (participant.total_score || 0) > 0
                ? Math.round(((participant.score || 0) / participant.total_score) * 100)
                : 0;
            return {
                Rang: participant.rank,
                Participant: participant.nom_affichage,
                Score: `${participant.score || 0}/${participant.total_score || 0}`,
                Precision: `${accuracy}%`,
                Progression: `${participant.progression_percent || 0}%`,
                Repondues: `${participant.answered_questions || 0}/${participant.total_questions || 0}`,
                Statut: participant.is_finished ? 'Terminé' : 'En cours',
            };
        });

        if (format === 'excel') {
            const workbook = XLSX.utils.book_new();
            const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Aucune donnée participant' }]);
            XLSX.utils.book_append_sheet(workbook, sheet, 'Classement');
            XLSX.writeFile(workbook, `session-live-${sessionCode}-classement.xlsx`);
            return;
        }

        let fullQuiz = null;
        try {
            fullQuiz = await api.get(`/session/${sessionCode}/quiz`);
        } catch (err) {
            alert("Impossible de charger les détails du quiz pour le PDF.");
            return;
        }

        const questionRows = (fullQuiz?.questions || []).map((question, questionIndex) => {
            const questionTitle = question?.texte_question || `Question ${questionIndex + 1}`;
            const correctAnswer = Array.isArray(question?.reponse_correcte)
                ? question.reponse_correcte.join(' | ')
                : String(question?.reponse_correcte ?? '—');

            const participantResults = rankedParticipants.map((participant) => {
                const breakdown = Array.isArray(participant.question_breakdown) ? participant.question_breakdown : [];
                const row = breakdown.find((item) => Number(item?.index) === questionIndex);
                const userAnswer = row?.user_answer ?? '—';
                const isCorrect = !!row?.is_correct;
                return {
                    name: participant.nom_affichage,
                    userAnswer,
                    isCorrect,
                };
            });

            return {
                questionIndex,
                questionTitle,
                correctAnswer,
                participantResults,
            };
        });

        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const marginX = 40;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - marginX * 2;
        const innerX = marginX + 14;
        const lineHeight = 14;

        const drawLabeledLine = (label, value, startX, startY, maxWidth, valueColor = [35, 35, 35], valueStyle = 'normal') => {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(25, 25, 25);
            doc.text(label, startX, startY);

            const labelWidth = doc.getTextWidth(label);
            const valueX = startX + labelWidth + 6;
            const available = Math.max(80, maxWidth - labelWidth - 6);
            const valueLines = doc.splitTextToSize(String(value || '—'), available);

            doc.setFont('helvetica', valueStyle);
            doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
            valueLines.forEach((line, index) => {
                doc.text(line, valueX, startY + index * lineHeight);
            });

            doc.setTextColor(20, 20, 20);
            return startY + Math.max(1, valueLines.length) * lineHeight;
        };

        const resolvedCreationType = String(fullQuiz?.type_creation || fullQuiz?.parametres_generation?.type_creation || '').toLowerCase();
        const creationTypeLabel = resolvedCreationType === 'ai' ? 'Généré avec IA' : 'Création manuelle';
        const difficultyLabel = fullQuiz?.difficulte_moyenne || fullQuiz?.parametres_generation?.difficulty || 'Non défini';
        const questionTypeLabel = fullQuiz?.parametres_generation?.question_type || [...new Set((fullQuiz?.questions || []).map(item => item?.type_question || 'MCQ'))].join(', ');
        const reportDateLabel = new Date().toLocaleString();
        const averageAccuracy = rankedParticipants.length > 0
            ? Math.round(rankedParticipants.reduce((acc, participant) => {
                const denominator = Math.max(1, participant.total_score || 0);
                return acc + Math.round(((participant.score || 0) / denominator) * 100);
            }, 0) / rankedParticipants.length)
            : 0;

        let y = 42;

        doc.setFillColor(37, 99, 235);
        doc.roundedRect(marginX, y, contentWidth, 82, 10, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Rapport Session Live', marginX + 16, y + 28);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Date: ${reportDateLabel}`, marginX + 16, y + 49);
        doc.text(`Code session: ${sessionCode}`, marginX + 16, y + 67);

        y += 100;
        doc.setDrawColor(220, 225, 235);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, contentWidth, 170, 8, 8, 'FD');

        doc.setTextColor(20, 20, 20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Informations générales', innerX, y + 22);
        doc.setFontSize(10.5);

        let infoY = y + 42;
        infoY = drawLabeledLine('Quiz :', fullQuiz?.titre || quizInfo?.titre || 'Quiz Live', innerX, infoY, contentWidth - 28);
        infoY = drawLabeledLine('Type de création :', creationTypeLabel, innerX, infoY, contentWidth - 28);
        infoY = drawLabeledLine('Type de question :', questionTypeLabel, innerX, infoY, contentWidth - 28);
        infoY = drawLabeledLine('Difficulté :', difficultyLabel, innerX, infoY, contentWidth - 28);
        infoY = drawLabeledLine('Durée :', durationValue, innerX, infoY, contentWidth - 28);
        infoY = drawLabeledLine('Participants :', rankedParticipants.length, innerX, infoY, contentWidth - 28);
        drawLabeledLine('Précision moyenne :', `${averageAccuracy}%`, innerX, infoY, contentWidth - 28);

        y += 194;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
        doc.text('Classement final', marginX, y);
        y += 16;

        rows.forEach((row) => {
            if (y > pageHeight - 60) {
                doc.addPage();
                y = 48;
            }
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(224, 228, 236);
            doc.roundedRect(marginX, y - 8, contentWidth, 38, 6, 6, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(`#${row.Rang} ${row.Participant}`, innerX, y + 8);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Score: ${row.Score} | Précision: ${row.Precision} | Progression: ${row.Progression} | Répondues: ${row.Repondues} | Statut: ${row.Statut}`, innerX, y + 24);
            y += 48;
        });

        questionRows.forEach((questionItem) => {
            const questionTitle = String(questionItem.questionTitle || '—');
            const correctAnswer = String(questionItem.correctAnswer || '—');

            const participantLines = questionItem.participantResults.map((participantResult) => {
                const stateLabel = participantResult.isCorrect ? 'Correct' : 'Incorrect';
                return `- ${participantResult.name}: ${stateLabel} | Réponse: ${participantResult.userAnswer}`;
            });

            const questionLines = doc.splitTextToSize(`Q${questionItem.questionIndex + 1}: ${questionTitle}`, contentWidth - 28);
            const correctLines = doc.splitTextToSize(`Réponse correcte: ${correctAnswer}`, contentWidth - 28);
            const participantWrappedLines = participantLines.flatMap((line) => doc.splitTextToSize(line, contentWidth - 40));

            const blockHeight =
                24 +
                Math.max(1, questionLines.length) * lineHeight +
                Math.max(1, correctLines.length) * lineHeight +
                Math.max(1, participantWrappedLines.length) * lineHeight +
                22;

            if (y + blockHeight > pageHeight - 36) {
                doc.addPage();
                y = 48;
            }

            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(224, 228, 236);
            doc.roundedRect(marginX, y - 8, contentWidth, blockHeight, 6, 6, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(20, 20, 20);
            let rowY = y + 8;

            questionLines.forEach((line) => {
                doc.text(line, innerX, rowY);
                rowY += lineHeight;
            });

            doc.setFont('helvetica', 'bold');
            correctLines.forEach((line) => {
                doc.text(line, innerX, rowY);
                rowY += lineHeight;
            });

            doc.setFont('helvetica', 'normal');
            participantWrappedLines.forEach((line) => {
                doc.text(line, innerX + 6, rowY);
                rowY += lineHeight;
            });

            y += blockHeight + 10;
        });

        doc.save(`session-live-${sessionCode}-rapport.pdf`);
    };

    if (error) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center">
                    <X size={48} className="mx-auto text-red-500 mb-4" />
                    <h2 className="text-2xl font-black mb-4">{error}</h2>
                    <button onClick={onClose} className="py-3 px-6 bg-slate-200 dark:bg-slate-800 rounded-xl font-bold w-full">Fermer</button>
                </div>
            </div>
        );
    }

    if (!sessionData) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <p className="font-bold">Chargement du lobby...</p>
            </div>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col md:flex-row h-full w-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
        >
            <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-8 border-r text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                <button 
                    onClick={onClose} 
                    className="absolute top-6 left-6 p-2 rounded-xl bg-slate-500/10 hover:bg-slate-500/20 transition-all text-slate-500"
                >
                    <X size={20} />
                </button>
                <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center mb-6">
                    <Users size={32} className="text-indigo-500" />
                </div>
                <h1 className="text-3xl font-black mb-2">{sessionData.titre_session || 'Session Live'}</h1>
                <p className="text-sm opacity-60 font-medium px-4 mb-10">{sessionData.description || 'En attente de participants...'}</p>
                
                <div className="bg-white/5 dark:bg-black/20 p-6 rounded-3xl w-full border border-indigo-500/20 mb-8 relative" onClick={hostMode ? handleCopy : undefined}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">
                        {hostMode ? 'Code de participation' : 'Code session'}
                    </p>
                    <p className="text-5xl font-black tracking-widest">{sessionData.code_session}</p>
                    <div className="absolute top-4 right-4 text-indigo-500 opacity-50 transition-opacity">
                        {hostMode ? (copied ? <Check size={20} /> : <Copy size={20} />) : <Users size={20} />}
                    </div>
                </div>

                {hostMode ? (
                    <button 
                        onClick={handleStartQuiz} 
                        disabled={sessionData.participants.length === 0 || sessionData.statut === 'active' || isStarting}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center justify-center gap-3 transition-colors shadow-xl shadow-indigo-500/20 disabled:opacity-50"
                    >
                        <Play size={20} /> {sessionData.statut === 'active' ? 'SESSION EN COURS' : (isStarting ? 'LANCEMENT...' : 'COMMENCER LE QUIZ')}
                    </button>
                ) : (
                    <div className="flex items-center justify-center gap-2 text-amber-500 font-bold bg-amber-500/10 py-3 px-6 rounded-xl w-full">
                        <Clock size={18} className="animate-pulse" /> En attente du créateur...
                    </div>
                )}

                {hostMode && startNotice && (
                    <p className="text-xs font-bold mt-3 text-emerald-500">{startNotice}</p>
                )}

                {!hostMode && countdownData?.active && (
                    <div className="w-full mt-3 rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                        <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Démarrage automatique</p>
                        <p className="text-2xl font-black text-indigo-500">{countdownData.remaining_seconds ?? 0}s</p>
                    </div>
                )}
            </div>

            <div className="w-full md:w-2/3 p-8 overflow-y-auto" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                {hostMode ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                            <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <p className="text-xs opacity-60 mb-1">Quiz</p>
                                <p className="font-black line-clamp-2">{quizInfo?.titre || 'Quiz Live'}</p>
                            </div>
                            <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <p className="text-xs opacity-60 mb-1">Questions</p>
                                <p className="font-black">{quizInfo?.nombre_questions ?? 0}</p>
                            </div>
                            <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <p className="text-xs opacity-60 mb-1">{durationLabel}</p>
                                <p className="font-black">{durationValue}</p>
                            </div>
                            <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <p className="text-xs opacity-60 mb-1">Connectés</p>
                                <p className="font-black">{participantStats.participant_count ?? sessionData.participants.length}</p>
                            </div>
                            <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <p className="text-xs opacity-60 mb-1">En progression</p>
                                <p className="font-black text-amber-500">{participantStats.in_progress_count ?? 0}</p>
                            </div>
                            <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <p className="text-xs opacity-60 mb-1">Terminés</p>
                                <p className="font-black text-emerald-500">{participantStats.completed_count ?? 0}</p>
                            </div>
                        </div>

                        <div className="rounded-2xl p-4 border mb-8" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm opacity-60">Progression moyenne du groupe</p>
                                <p className="font-black">{participantStats.average_progress ?? 0}%</p>
                            </div>
                            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${participantStats.average_progress ?? 0}%` }} />
                            </div>
                        </div>

                        <div className="rounded-2xl p-4 border mb-8" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                            <div className="flex items-center justify-between mb-3">
                                <p className="font-black">Contrôles Live</p>
                                {countdownData?.active && (
                                    <p className="text-xs font-black text-indigo-500">Compte à rebours: {countdownData.remaining_seconds ?? 0}s</p>
                                )}
                            </div>

                            {sessionSettings && (
                                <div className="space-y-3">
                                    <label className="flex items-center justify-between text-sm">
                                        <span className="opacity-80">Afficher rapports/stats aux participants</span>
                                        <input
                                            type="checkbox"
                                            checked={!!sessionSettings.reports_visible_to_participants}
                                            onChange={(e) => setSessionSettings(prev => ({ ...prev, reports_visible_to_participants: e.target.checked }))}
                                        />
                                    </label>

                                    <div>
                                        <p className="text-xs opacity-60 mb-1">Méthode de démarrage</p>
                                        <select
                                            value={sessionSettings.auto_start_mode || 'manual'}
                                            onChange={(e) => setSessionSettings(prev => ({ ...prev, auto_start_mode: e.target.value }))}
                                            className="w-full rounded-xl border px-3 py-2"
                                            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                                        >
                                            <option value="manual">Manuel (bouton créateur)</option>
                                            <option value="scheduled">Date/heure planifiée</option>
                                            <option value="participant_threshold">Seuil de participants</option>
                                        </select>
                                    </div>

                                    {sessionSettings.auto_start_mode === 'scheduled' && (
                                        <div>
                                            <p className="text-xs opacity-60 mb-1">Date de démarrage</p>
                                            <input
                                                type="datetime-local"
                                                value={sessionSettings.scheduled_start_at || ''}
                                                onChange={(e) => setSessionSettings(prev => ({ ...prev, scheduled_start_at: e.target.value }))}
                                                className="w-full rounded-xl border px-3 py-2"
                                                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                                            />
                                        </div>
                                    )}

                                    {sessionSettings.auto_start_mode === 'participant_threshold' && (
                                        <div>
                                            <p className="text-xs opacity-60 mb-1">Démarrer à partir de X participants</p>
                                            <input
                                                type="number"
                                                min={1}
                                                value={sessionSettings.min_participants_to_start ?? 20}
                                                onChange={(e) => setSessionSettings(prev => ({ ...prev, min_participants_to_start: Number(e.target.value) }))}
                                                className="w-full rounded-xl border px-3 py-2"
                                                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-xs opacity-60 mb-1">Compte à rebours avant démarrage (secondes)</p>
                                        <input
                                            type="number"
                                            min={1}
                                            value={sessionSettings.countdown_seconds ?? 10}
                                            onChange={(e) => setSessionSettings(prev => ({ ...prev, countdown_seconds: Number(e.target.value) }))}
                                            className="w-full rounded-xl border px-3 py-2"
                                            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                                        />
                                    </div>

                                    <button
                                        onClick={handleSaveSettings}
                                        disabled={isSavingSettings}
                                        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black disabled:opacity-50"
                                    >
                                        {isSavingSettings ? 'Enregistrement...' : 'Enregistrer les paramètres live'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {isQuizFinishedForHost && (
                        <div className="rounded-2xl p-4 border mb-8" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                            <div className="flex items-center justify-between mb-3">
                                <p className="font-black">Exports créateur</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleExportHostReport('excel')}
                                    className="py-2.5 rounded-xl border font-black text-xs flex items-center justify-center gap-2"
                                    style={{ borderColor: 'var(--border)' }}
                                >
                                    <FileSpreadsheet size={14} /> Exporter Excel
                                </button>
                                <button
                                    onClick={() => handleExportHostReport('pdf')}
                                    className="py-2.5 rounded-xl border font-black text-xs flex items-center justify-center gap-2"
                                    style={{ borderColor: 'var(--border)' }}
                                >
                                    <FileText size={14} /> Exporter PDF
                                </button>
                            </div>
                        </div>
                        )}

                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black">Participants ({sessionData.participants.length})</h2>
                        </div>

                        {sessionData.participants.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-center opacity-40">
                                <Users size={48} className="mb-4" />
                                <p className="font-bold">Aucun participant n'a encore rejoint.</p>
                                <p className="text-sm mt-2">Partagez le code {sessionData.code_session} pour qu'ils vous rejoignent.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {sessionData.participants.map(p => (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        key={p.id_utilisateur} 
                                        className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center text-center shadow-sm"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 border-2 border-indigo-500 mb-3 overflow-hidden">
                                            {p.photo_url ? (
                                                <img src={p.photo_url} alt={p.nom_affichage} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-indigo-500 font-black text-xl">
                                                    {p.nom_affichage?.charAt(0).toUpperCase() || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <p className="font-bold text-sm line-clamp-1">{p.nom_affichage}</p>
                                        <div className="w-full mt-3">
                                            <div className="flex items-center justify-between text-[10px] opacity-70 mb-1">
                                                <span>{p.answered_questions ?? 0}/{p.total_questions ?? 0}</span>
                                                <span>{p.progression_percent ?? 0}%</span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${p.progression_percent ?? 0}%` }} />
                                            </div>
                                            <div className="flex items-center justify-between mt-2 text-[10px] font-bold">
                                                <span className="opacity-60">Score: {p.score ?? 0}/{p.total_score ?? 0}</span>
                                                <span className={p.is_finished ? 'text-emerald-500' : 'text-amber-500'}>{p.is_finished ? 'Terminé' : 'En cours'}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {rankedParticipants.length > 0 && (
                            <div className="rounded-2xl p-4 border mt-8" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                                <h3 className="text-lg font-black mb-4">Classement & notes</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left opacity-60">
                                                <th className="py-2 pr-2">#</th>
                                                <th className="py-2 pr-2">Participant</th>
                                                <th className="py-2 pr-2">Score</th>
                                                <th className="py-2 pr-2">Précision</th>
                                                <th className="py-2 pr-2">Progression</th>
                                                <th className="py-2 pr-2">Statut</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rankedParticipants.map((participant) => {
                                                const accuracy = (participant.total_score || 0) > 0
                                                    ? Math.round(((participant.score || 0) / participant.total_score) * 100)
                                                    : 0;
                                                return (
                                                    <tr key={`rank-${participant.id_utilisateur}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                                        <td className="py-2 pr-2 font-black">{participant.rank}</td>
                                                        <td className="py-2 pr-2 font-bold">{participant.nom_affichage}</td>
                                                        <td className="py-2 pr-2">{participant.score || 0}/{participant.total_score || 0}</td>
                                                        <td className="py-2 pr-2">{accuracy}%</td>
                                                        <td className="py-2 pr-2">{participant.progression_percent || 0}%</td>
                                                        <td className="py-2 pr-2">
                                                            <span className={participant.is_finished ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                                                                {participant.is_finished ? 'Terminé' : 'En cours'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="max-w-xl mx-auto mt-10 rounded-3xl p-8 border text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                        <p className="text-xs uppercase tracking-widest opacity-60 mb-3">Créateur de la session</p>
                        <div className="w-20 h-20 rounded-full mx-auto mb-4 overflow-hidden border-2 border-indigo-500 bg-indigo-100 dark:bg-indigo-900">
                            {hostPhoto ? (
                                <img src={hostPhoto} alt={hostName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-indigo-500 font-black text-2xl">
                                    {hostName?.charAt(0).toUpperCase() || '?'}
                                </div>
                            )}
                        </div>
                        <h3 className="text-2xl font-black mb-2">{hostName}</h3>
                        <p className="opacity-70 mb-6">Vous êtes dans le lobby. Le quiz commencera quand le créateur appuie sur démarrer.</p>
                        <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
                            <p className="text-sm opacity-60">Quiz</p>
                            <p className="font-black">{quizInfo?.titre || 'Quiz Live'}</p>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default SessionLobby;