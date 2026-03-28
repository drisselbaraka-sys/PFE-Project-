import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import {
    X, ArrowRight, Clock, Trophy, Check, Rocket, Brain, HelpCircle, Download, FileText, FileSpreadsheet, Star
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
                display: none;
                width: 0 !important;
                height: 0 !important;
            }
            .custom-scrollbar {
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
        `}
    </style>
);


const isRTL = (text) => {
    if (!text) return false;
    const arabic = /[؀-ۿ]/;
    return arabic.test(text.substring(0, 50)); // Check first 50 chars for Arabic
};

const normalizeAnswerToken = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[ـ]/g, '')
        .replace(/[{}\[\]()]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

const splitPossibleMultiAnswerString = (value) => {
    const cleaned = String(value || '').trim().replace(/^[{[(]+|[}\])]+$/g, '');
    if (!cleaned) return [];

    const parts = cleaned
        .split(/\s*(?:,|،|;|\||\bet\b|\band\b)\s*/i)
        .map(item => item.trim())
        .filter(Boolean);

    return parts.length > 1 ? parts : [cleaned];
};

const normalizeToArray = (value) => {
    if (Array.isArray(value)) return value.flatMap(item => splitPossibleMultiAnswerString(item));
    if (value === undefined || value === null || value === '') return [];
    return splitPossibleMultiAnswerString(value);
};

const sanitizeAikenLine = (value, fallback = '') => {
    const normalized = String(value ?? fallback)
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized || fallback;
};

const stripOptionPrefix = (value) => String(value || '')
    .replace(/^\s*(?:option|reponse|réponse)\s*[A-Z0-9]+\s*[:)\-.]?\s*/i, '')
    .replace(/^\s*[A-Z]\s*[:)\-.]\s*/i, '')
    .trim();

const extractOptionIndexFromToken = (value, optionsLength) => {
    const raw = String(value || '').trim();
    if (!raw) return -1;

    const compact = raw.replace(/\s+/g, ' ');
    const match = compact.match(/^(?:option|reponse|réponse)?\s*([A-Za-z]|\d+)\s*[:)\-.]?$/i);
    if (!match) return -1;

    const token = match[1];
    if (/^[A-Za-z]$/.test(token)) {
        const idx = token.toUpperCase().charCodeAt(0) - 65;
        return idx >= 0 && idx < optionsLength ? idx : -1;
    }

    const numeric = Number.parseInt(token, 10);
    if (!Number.isFinite(numeric)) return -1;
    const idx = numeric - 1;
    return idx >= 0 && idx < optionsLength ? idx : -1;
};

const resolveAnswerTokenToIndex = (answerToken, options) => {
    if (!Array.isArray(options) || options.length === 0) return -1;

    const directIndex = extractOptionIndexFromToken(answerToken, options.length);
    if (directIndex >= 0) return directIndex;

    const normalizedToken = normalizeAnswerToken(answerToken);
    const normalizedTokenWithoutPrefix = normalizeAnswerToken(stripOptionPrefix(answerToken));

    if (!normalizedToken && !normalizedTokenWithoutPrefix) return -1;

    const normalizedOptions = options.map((option) => ({
        full: normalizeAnswerToken(option),
        stripped: normalizeAnswerToken(stripOptionPrefix(option)),
    }));

    const exactIndex = normalizedOptions.findIndex(({ full, stripped }) => (
        full === normalizedToken
        || stripped === normalizedToken
        || full === normalizedTokenWithoutPrefix
        || stripped === normalizedTokenWithoutPrefix
    ));
    if (exactIndex >= 0) return exactIndex;

    const fuzzyIndex = normalizedOptions.findIndex(({ full, stripped }) => {
        const candidates = [normalizedToken, normalizedTokenWithoutPrefix].filter(Boolean);
        return candidates.some((candidate) => (
            candidate.length > 2
            && (
                full.includes(candidate)
                || stripped.includes(candidate)
                || candidate.includes(full)
                || candidate.includes(stripped)
            )
        ));
    });

    return fuzzyIndex;
};

const resolveAnswerToOptionIndices = (answerValue, options) => {
    const answerTokens = normalizeToArray(answerValue);
    const indexes = answerTokens
        .map((token) => resolveAnswerTokenToIndex(token, options))
        .filter((idx) => idx >= 0 && idx < options.length);

    return [...new Set(indexes)].sort((a, b) => a - b);
};

const isSingleAnswerType = (question) => {
    const typeValue = String(question?.type_question || '').trim().toLowerCase();
    return (
        typeValue.includes('mcq')
        || typeValue.includes('qcm')
        || typeValue.includes('vrai')
        || typeValue.includes('faux')
        || typeValue.includes('true')
        || typeValue.includes('false')
    );
};

const getResolvedCorrectOptionIndices = (question) => {
    const options = Array.isArray(question?.options_reponses) ? question.options_reponses : [];
    const resolved = resolveAnswerToOptionIndices(question?.reponse_correcte, options);

    if (isSingleAnswerType(question) && resolved.length > 1) {
        return [resolved[0]];
    }

    return resolved;
};

const formatClockFromSeconds = (rawSeconds) => {
    const totalSeconds = Math.max(0, Number.parseInt(rawSeconds, 10) || 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const resolveConfiguredTimeSeconds = (quizPayload, mode) => {
    const generation = quizPayload?.parametres_generation || {};
    const rawTimeValue = Number.parseInt(generation?.time_value, 10);
    const timeValueUnit = String(generation?.time_value_unit || '').toLowerCase();

    if (Number.isFinite(rawTimeValue) && rawTimeValue >= 0) {
        if (mode === 'Timer Global') {
            return timeValueUnit === 'seconds' ? rawTimeValue : rawTimeValue * 60;
        }
        if (mode === 'Mode Chrono') {
            return timeValueUnit === 'minutes' ? rawTimeValue * 60 : rawTimeValue;
        }
    }

    if (mode === 'Timer Global') {
        const fallbackMinutes = Number.parseInt(quizPayload?.duree_max_minutes, 10);
        return (Number.isFinite(fallbackMinutes) && fallbackMinutes > 0 ? fallbackMinutes : 10) * 60;
    }

    if (mode === 'Mode Chrono') {
        return 30;
    }

    return 0;
};

const isAnswerCorrectForQuestion = (question, answer) => {
    const options = Array.isArray(question?.options_reponses) ? question.options_reponses : [];
    const correctIndexes = getResolvedCorrectOptionIndices(question);
    const userIndexes = resolveAnswerToOptionIndices(answer, options);

    if (userIndexes.length === 0) return false;
    if (correctIndexes.length > 0) {
        if (isSingleAnswerType(question)) {
            return userIndexes.length === 1 && userIndexes[0] === correctIndexes[0];
        }

        if (userIndexes.length !== correctIndexes.length) return false;

        const correctSet = new Set(correctIndexes);
        return userIndexes.every((idx) => correctSet.has(idx));
    }

    const correctAnswers = normalizeToArray(question?.reponse_correcte)
        .map((item) => normalizeAnswerToken(stripOptionPrefix(item)))
        .filter(Boolean);
    const userAnswerList = normalizeToArray(answer)
        .map((item) => normalizeAnswerToken(stripOptionPrefix(item)))
        .filter(Boolean);

    if (userAnswerList.length === 0) return false;
    if (userAnswerList.length !== correctAnswers.length) return false;

    const correctSet = new Set(correctAnswers);
    if (correctSet.size !== correctAnswers.length) {
        return userAnswerList.every(item => correctAnswers.includes(item));
    }
    return userAnswerList.every(item => correctSet.has(item));
};

const isMultipleAnswerQuestion = (question) => {
    const typeValue = String(question?.type_question || '').trim().toLowerCase();
    if (typeValue.includes('multiple') || typeValue.includes('plusieurs')) return true;
    if (isSingleAnswerType(question)) return false;
    const correctAnswers = normalizeToArray(question?.reponse_correcte);
    return correctAnswers.length > 1;
};

const getQuestionTypeDisplay = (question) => {
    if (!question) return 'QCM';
    if (isMultipleAnswerQuestion(question)) return 'Plusieurs Réponses';

    const typeValue = String(question?.type_question || '').trim().toLowerCase();
    if (typeValue.includes('vrai') || typeValue.includes('faux') || typeValue.includes('true')) return 'Vrai ou Faux';
    if (typeValue === 'mcq' || typeValue === 'qcm') return 'QCM';
    return question?.type_question || 'QCM';
};

const QuizPlayer = ({
    quiz,
    onClose,
    isReview = false,
    onPublish,
    publishLabel = 'PUBLIER',
    liveSessionCode = null,
    liveSessionOptions = null,
    currentUser = null,
    onPublicSubmissionSuccess = null,
}) => {
    const questions = quiz.questions || [];
    const [currentIndex, setCurrentIndex] = useState(0);
    const [chronoActiveIndex, setChronoActiveIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [isGlobalTimeUp, setIsGlobalTimeUp] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [isBilan, setIsBilan] = useState(false);
    const [userRating, setUserRating] = useState(0);
    const [userComment, setUserComment] = useState('');
    const [confirmedMultipleAnswers, setConfirmedMultipleAnswers] = useState({});
    const [submittingPublicFeedback, setSubmittingPublicFeedback] = useState(false);
    const [publicFeedbackSuccess, setPublicFeedbackSuccess] = useState(false);
    const [scoreSubmitted, setScoreSubmitted] = useState(false);
    const [publicFeedbackError, setPublicFeedbackError] = useState('');
    const timerRef = useRef(null);
    const userAnswersRef = useRef({});

    const q = questions[currentIndex];
    const timeMode = (quiz.parametres_generation?.time_mode) || 'Timer Global';
    const isChronoMode = timeMode === 'Mode Chrono';
    const timeLimitSeconds = resolveConfiguredTimeSeconds(quiz, timeMode);
    const showImmediateFeedback = isBilan ? true : ((quiz.parametres_generation?.show_immediate_feedback) ?? true);
    const reportDateLabel = new Date().toLocaleString();
    const participantName = quiz?.createur?.nom_affichage || quiz?.nom_createur || quiz?.id_utilisateur || 'Participant';
    const difficultyLabel = quiz?.difficulte_moyenne || quiz?.parametres_generation?.difficulty || 'Non défini';
    const questionTypeLabel = quiz?.parametres_generation?.question_type || [...new Set(questions.map(item => item?.type_question || 'MCQ'))].join(', ');

    const getQuestionPoints = (question) => {
        const parsed = Number(question?.points);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
    };

    const totalPossibleScore = questions.reduce((acc, question) => acc + getQuestionPoints(question), 0);

    // Logic for scoring
    const score = questions.reduce((acc, currentQ, idx) => {
        const ans = userAnswers[idx];
        if (!ans) return acc;
        const isMatch = isAnswerCorrectForQuestion(currentQ, ans);
        return isMatch ? acc + getQuestionPoints(currentQ) : acc;
    }, 0);

    const answeredCount = questions.reduce((acc, currentQ, idx) => {
        const ans = userAnswers[idx];
        const hasAnswer = Array.isArray(ans) ? ans.length > 0 : !!ans;
        return hasAnswer ? acc + 1 : acc;
    }, 0);

    const correctAnswersCount = questions.reduce((acc, currentQ, idx) => {
        const ans = userAnswers[idx];
        if (!ans) return acc;
        return isAnswerCorrectForQuestion(currentQ, ans) ? acc + 1 : acc;
    }, 0);

    const incorrectAnswersCount = Math.max(0, answeredCount - correctAnswersCount);
    const unansweredCount = Math.max(0, questions.length - answeredCount);

    const accuracy = Math.round((score / Math.max(1, totalPossibleScore)) * 100);
    const revealLiveScore = showImmediateFeedback || isBilan || isFinished;
    const displayedScore = revealLiveScore ? score : '?';
    const displayedTotalScore = revealLiveScore ? totalPossibleScore : '?';
    const displayedScoreProgress = revealLiveScore ? (score / Math.max(1, totalPossibleScore)) * 100 : 0;
    const formattedUserRating = userRating > 0 ? `${Number(userRating).toFixed(1)}/5` : 'Non noté';
    const isLiveSessionParticipant = Boolean(liveSessionCode);
    const hideDetailedLiveReport = isLiveSessionParticipant && (liveSessionOptions?.reports_visible_to_participants === false);
    const canSubmitPublicFeedback = Boolean(
        currentUser?.id_utilisateur
        && quiz?.visibilite === 'public'
        && !isLiveSessionParticipant
        && !isReview
    );

    const isCurrentQuestionMultiple = isMultipleAnswerQuestion(q);
    const isCurrentQuestionConfirmed = !!confirmedMultipleAnswers[currentIndex];
    const shouldRevealFeedbackAtIndex = (index) => {
        if (isGlobalTimeUp || isBilan) return true;
        if (!showImmediateFeedback) return false;

        const question = questions[index];
        if (!isMultipleAnswerQuestion(question)) return true;
        return !!confirmedMultipleAnswers[index];
    };
    const shouldRevealCurrentQuestion = shouldRevealFeedbackAtIndex(currentIndex);

    const getAdvice = () => {
        if (accuracy >= 90) return "Impressionnant ! Vous maîtrisez parfaitement ce sujet. Pourquoi ne pas essayer un niveau plus difficile ou partager votre savoir ?";
        if (accuracy >= 70) return "Très bon travail ! Vous avez une base solide. Révisez les quelques points d'ombre pour atteindre la perfection.";
        if (accuracy >= 50) return "Pas mal ! Vous avez compris l'essentiel, mais une petite révision des concepts clés vous aidera à progresser.";
        return "C'est un début ! Ne vous découragez pas, l'apprentissage est un marathon. Prenez le temps de relire les explications pour chaque erreur.";
    };

    const formatAnswerForDisplay = (value) => {
        if (Array.isArray(value)) return value.join(' | ');
        if (value === undefined || value === null || value === '') return '—';
        return String(value);
    };

    const detailedStats = questions.map((question, index) => {
        const answer = userAnswers[index];
        const questionCorrect = isAnswerCorrectForQuestion(question, answer);
        return {
            index,
            question: question.texte_question,
            explanation: question.explication || 'Aucune explication fournie.',
            userAnswer: formatAnswerForDisplay(answer),
            correctAnswer: formatAnswerForDisplay(question.reponse_correcte),
            result: answer ? (questionCorrect ? 'Correcte' : 'Incorrecte') : 'Non répondue',
            pointsEarned: questionCorrect ? getQuestionPoints(question) : 0,
            pointsTotal: getQuestionPoints(question)
        };
    });

    useEffect(() => {
        if (!isFinished || !canSubmitPublicFeedback || scoreSubmitted || !quiz?.id_quiz) {
            return;
        }

        const questionBreakdown = detailedStats.map((row) => ({
            index: row.index,
            question: row.question,
            user_answer: row.userAnswer,
            correct_answer: row.correctAnswer,
            result: row.result,
            points_earned: row.pointsEarned,
            points_total: row.pointsTotal,
        }));

        let cancelled = false;

        api.post(`/quiz/public/${quiz.id_quiz}/submit`, {
            score,
            total_score: totalPossibleScore,
            note: null,
            commentaire: null,
            question_breakdown: questionBreakdown,
        }).then(() => {
            if (!cancelled) setScoreSubmitted(true);
        }).catch((e) => {
            console.error('Score auto-submit failed', e);
        });

        return () => {
            cancelled = true;
        };
    }, [isFinished, canSubmitPublicFeedback, scoreSubmitted, quiz?.id_quiz, detailedStats, score, totalPossibleScore]);

    const isQuestionAnsweredAtIndex = (index) => {
        const question = questions[index];
        const answer = userAnswers[index];
        if (isMultipleAnswerQuestion(question)) {
            return Array.isArray(answer) && answer.length > 0;
        }
        if (Array.isArray(answer)) return answer.length > 0;
        return !!answer;
    };

    const handleExportQuiz = (format) => {
        if (format === 'excel') {
            const workbook = XLSX.utils.book_new();

            const summaryRows = [
                { Métrique: 'Quiz', Valeur: quiz?.titre || 'Quiz' },
                { Métrique: 'Description', Valeur: quiz?.description || '' },
                { Métrique: 'Date export', Valeur: reportDateLabel },
                { Métrique: 'Nom', Valeur: participantName },
                { Métrique: 'Type de question', Valeur: questionTypeLabel },
                { Métrique: 'Difficulté', Valeur: difficultyLabel },
                { Métrique: 'Nombre de questions', Valeur: questions.length },
                { Métrique: 'Score', Valeur: `${score} / ${totalPossibleScore}` },
                { Métrique: 'Précision', Valeur: `${accuracy}%` },
                { Métrique: 'Réponses correctes', Valeur: correctAnswersCount },
                { Métrique: 'Réponses incorrectes', Valeur: incorrectAnswersCount },
                { Métrique: 'Non répondues', Valeur: unansweredCount },
                { Métrique: 'Note utilisateur', Valeur: formattedUserRating },
                { Métrique: 'Commentaire', Valeur: userComment || 'Aucun commentaire' },
            ];

            const detailsRows = detailedStats.map((row) => ({
                'Question #': row.index + 1,
                'Question': row.question,
                'Votre réponse': row.userAnswer,
                'Bonne réponse': row.correctAnswer,
                'Résultat': row.result,
                'Points gagnés': row.pointsEarned,
                'Points max': row.pointsTotal,
            }));

            const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
            const detailSheet = XLSX.utils.json_to_sheet(detailsRows);

            summarySheet['!cols'] = [{ wch: 24 }, { wch: 56 }];
            detailSheet['!cols'] = [
                { wch: 10 }, { wch: 50 }, { wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }
            ];

            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Résumé');
            XLSX.utils.book_append_sheet(workbook, detailSheet, 'Détails');
            XLSX.writeFile(workbook, `quiz-report-${Date.now()}.xlsx`);
            return;
        }

        if (format === 'aiken') {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const blocks = questions.map((question, index) => {
                const questionTitle = sanitizeAikenLine(
                    question?.texte_question,
                    `Question ${index + 1}`
                );

                const optionValues = (Array.isArray(question?.options_reponses) ? question.options_reponses : [])
                    .map((option) => sanitizeAikenLine(option))
                    .filter(Boolean)
                    .slice(0, 26);

                const uniqueCorrectIndices = resolveAnswerToOptionIndices(
                    question?.reponse_correcte,
                    optionValues
                );

                const optionsToExport = optionValues.length
                    ? optionValues
                    : ['Option indisponible'];

                const answerLetters = uniqueCorrectIndices.length
                    ? uniqueCorrectIndices.map((idx) => alphabet[idx]).join(',')
                    : 'A';

                const optionLines = optionsToExport.map(
                    (option, optionIndex) => `${alphabet[optionIndex]}. ${option}`
                );

                return [
                    questionTitle,
                    ...optionLines,
                    `ANSWER: ${answerLetters}`,
                ].join('\n');
            });

            const aikenContent = [
                `# Quiz: ${sanitizeAikenLine(quiz?.titre, 'Quiz')}`,
                `# Export: ${reportDateLabel}`,
                '# Format: AIKEN',
                '',
                blocks.join('\n\n'),
                '',
            ].join('\n');

            const blob = new Blob([aikenContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `quiz-report-${Date.now()}-aiken.txt`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            return;
        }

        if (format === 'pdf') {
            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            const marginX = 40;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const contentWidth = pageWidth - marginX * 2;
            const innerX = marginX + 14;
            const lineHeight = 14;
            const resolvedCreationType = (quiz?.type_creation || quiz?.parametres_generation?.type_creation || '').toLowerCase();
            const creationTypeLabel = resolvedCreationType === 'ai' ? 'Généré avec IA' : 'Création manuelle';
            let y = 42;

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

            doc.setFillColor(37, 99, 235);
            doc.roundedRect(marginX, y, contentWidth, 82, 10, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('Rapport du Quiz', marginX + 16, y + 28);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.text(`Date: ${reportDateLabel}`, marginX + 16, y + 49);
            doc.text(`Quiz: ${quiz?.titre || 'Quiz'}`, marginX + 16, y + 67);

            y += 100;
            doc.setDrawColor(220, 225, 235);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(marginX, y, contentWidth, 150, 8, 8, 'FD');

            doc.setTextColor(20, 20, 20);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Informations générales', innerX, y + 22);
            doc.setFontSize(10.5);

            let infoY = y + 42;
            infoY = drawLabeledLine('Type de création :', creationTypeLabel, innerX, infoY, contentWidth - 28);
            infoY = drawLabeledLine('Type de question :', questionTypeLabel, innerX, infoY, contentWidth - 28);
            infoY = drawLabeledLine('Difficulté :', difficultyLabel, innerX, infoY, contentWidth - 28);
            infoY = drawLabeledLine('Nombre de questions :', questions.length, innerX, infoY, contentWidth - 28);
            infoY = drawLabeledLine('Score :', `${score} / ${totalPossibleScore}`, innerX, infoY, contentWidth - 28);
            infoY = drawLabeledLine('Précision :', `${accuracy}%`, innerX, infoY, contentWidth - 28);
            drawLabeledLine('Résumé :', `Correctes ${correctAnswersCount} • Incorrectes ${incorrectAnswersCount} • Non répondues ${unansweredCount}`, innerX, infoY, contentWidth - 28);

            y += 174;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(20, 20, 20);
            doc.text('Détails par question', marginX, y);
            y += 16;

            detailedStats.forEach((row) => {
                const rowQuestion = String(row.question || '—');
                const rowUserAnswer = String(row.userAnswer || '—');
                const rowCorrectAnswer = String(row.correctAnswer || '—');
                const rowExplanation = String(row.explanation || '—');

                const questionLines = doc.splitTextToSize(rowQuestion, contentWidth - 220);
                const userAnswerLines = doc.splitTextToSize(rowUserAnswer, contentWidth - 120);
                const correctAnswerLines = doc.splitTextToSize(rowCorrectAnswer, contentWidth - 130);
                const explanationLines = doc.splitTextToSize(rowExplanation, contentWidth - 110);

                const blockHeight =
                    24 +
                    Math.max(1, questionLines.length) * lineHeight +
                    Math.max(1, userAnswerLines.length) * lineHeight +
                    Math.max(1, correctAnswerLines.length) * lineHeight +
                    Math.max(1, explanationLines.length) * lineHeight +
                    28;

                if (y + blockHeight > pageHeight - 36) {
                    doc.addPage();
                    y = 48;
                }

                const isCorrectRow = row.result === 'Correcte';
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(224, 228, 236);
                doc.roundedRect(marginX, y - 8, contentWidth, blockHeight, 6, 6, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(isCorrectRow ? 22 : 185, isCorrectRow ? 163 : 28, isCorrectRow ? 74 : 28);
                doc.text(`Q${row.index + 1} - ${row.result} (${row.pointsEarned}/${row.pointsTotal})`, innerX, y + 8);

                let rowY = y + 26;
                rowY = drawLabeledLine('Question :', rowQuestion, innerX, rowY, contentWidth - 28, [20, 20, 20], 'bold');
                rowY = drawLabeledLine('Votre réponse :', rowUserAnswer, innerX, rowY, contentWidth - 28);
                rowY = drawLabeledLine('Bonne réponse :', rowCorrectAnswer, innerX, rowY, contentWidth - 28, [15, 120, 72], 'bold');
                drawLabeledLine('Explication :', rowExplanation, innerX, rowY, contentWidth - 28);

                y += blockHeight + 10;
            });

            doc.save(`quiz-report-${Date.now()}.pdf`);
        }
    };

    const moveToNextChronoQuestion = (answeredIndex) => {
        const nextIndex = answeredIndex + 1;
        if (nextIndex < questions.length) {
            setChronoActiveIndex(nextIndex);
            setCurrentIndex(nextIndex);
        } else {
            setIsFinished(true);
        }
    };

    useEffect(() => {
        userAnswersRef.current = userAnswers;
    }, [userAnswers]);

    useEffect(() => {
        if (timeMode === 'Pas de limite' || isBilan) return;
        setIsGlobalTimeUp(false);
        if (isChronoMode) setChronoActiveIndex(0);
        setTimeLeft(timeLimitSeconds);
    }, [timeMode, timeLimitSeconds, isBilan, isChronoMode]);

    useEffect(() => {
        if (timeMode !== 'Timer Global' || isGlobalTimeUp || isFinished || isBilan) return;
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setIsGlobalTimeUp(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [timeMode, isGlobalTimeUp, isFinished, isBilan]);

    useEffect(() => {
        if (!isChronoMode || isGlobalTimeUp || isFinished || isBilan) return;
        if (timerRef.current) clearInterval(timerRef.current);

        setTimeLeft(timeLimitSeconds);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    const currentAnswer = userAnswersRef.current?.[chronoActiveIndex];
                    const hasAnswer = Array.isArray(currentAnswer) ? currentAnswer.length > 0 : !!currentAnswer;

                    if (!hasAnswer) {
                        setUserAnswers(existing => ({ ...existing, [chronoActiveIndex]: 'TIMEOUT_NO_ANSWER' }));
                    }

                    moveToNextChronoQuestion(chronoActiveIndex);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [isChronoMode, chronoActiveIndex, timeLimitSeconds, isGlobalTimeUp, isFinished, isBilan]);

    const handleSelectOption = (opt) => {
        if (isBilan) return; // Disable selection in bilan mode
        if (isChronoMode && currentIndex !== chronoActiveIndex) return;
        if (!isChronoMode && !isMultipleAnswerQuestion(q) && userAnswers[currentIndex] && showImmediateFeedback) return;
        if (showImmediateFeedback && isMultipleAnswerQuestion(q) && confirmedMultipleAnswers[currentIndex]) return;
        if (isGlobalTimeUp || isFinished) return;

        if (isMultipleAnswerQuestion(q)) {
            setUserAnswers(prev => {
                const current = prev[currentIndex] || [];
                const updated = current.includes(opt)
                    ? current.filter(o => o !== opt)
                    : [...current, opt];
                return { ...prev, [currentIndex]: updated };
            });
            if (showImmediateFeedback && !isBilan) {
                setConfirmedMultipleAnswers((prev) => ({ ...prev, [currentIndex]: false }));
            }
        } else {
            setUserAnswers(prev => ({ ...prev, [currentIndex]: opt }));
        }
    };

    const handleConfirmMultipleAnswer = () => {
        if (!showImmediateFeedback || isBilan || !isMultipleAnswerQuestion(q)) return;
        const currentAnswer = userAnswers[currentIndex];
        const hasAnswer = Array.isArray(currentAnswer) ? currentAnswer.length > 0 : !!currentAnswer;
        if (!hasAnswer) return;

        setConfirmedMultipleAnswers((prev) => ({ ...prev, [currentIndex]: true }));
    };

    const isAnswered = isQuestionAnsweredAtIndex(currentIndex);
    const isCorrect = isAnswerCorrectForQuestion(q, userAnswers[currentIndex]);

    useEffect(() => {
        if (!isLiveSessionParticipant || isReview) return;

        const syncProgress = async () => {
            try {
                const questionBreakdown = questions.map((question, index) => {
                    const answer = userAnswers[index];
                    const questionCorrect = isAnswerCorrectForQuestion(question, answer);
                    return {
                        index,
                        question: question?.texte_question || '',
                        user_answer: formatAnswerForDisplay(answer),
                        correct_answer: formatAnswerForDisplay(question?.reponse_correcte),
                        is_correct: !!answer && questionCorrect,
                    };
                });

                await api.post(`/session/${liveSessionCode}/progress`, {
                    answered_questions: answeredCount,
                    total_questions: questions.length,
                    current_question_index: currentIndex + 1,
                    score,
                    total_score: totalPossibleScore,
                    is_finished: isFinished,
                    question_breakdown: questionBreakdown,
                });
            } catch (err) {
                console.warn(' [QuizPlayer] Sync progression impossible:', err?.detail || err?.message || err);
            }
        };

        syncProgress();
    }, [isLiveSessionParticipant, isReview, liveSessionCode, answeredCount, questions.length, currentIndex, score, totalPossibleScore, isFinished]);

    const handleSubmitPublicFeedback = async () => {
        if (!canSubmitPublicFeedback || !quiz?.id_quiz) return;

        const cleanComment = String(userComment || '').trim();
        if (!cleanComment) {
            setPublicFeedbackError('Veuillez saisir un commentaire avant l\'envoi.');
            return;
        }

        setSubmittingPublicFeedback(true);
        setPublicFeedbackError('');

        try {
            const questionBreakdown = detailedStats.map((row) => ({
                index: row.index,
                question: row.question,
                user_answer: row.userAnswer,
                correct_answer: row.correctAnswer,
                result: row.result,
                points_earned: row.pointsEarned,
                points_total: row.pointsTotal,
            }));

            await api.post(`/quiz/public/${quiz.id_quiz}/comments`, {
                note: userRating > 0 ? userRating : null,
                contenu: cleanComment,
            });

            setPublicFeedbackSuccess(true);

            if (onPublicSubmissionSuccess) {
                onPublicSubmissionSuccess({ quizId: quiz.id_quiz });
            }
        } catch (err) {
            console.error(' [QuizPlayer] Erreur soumission publique:', err);
            setPublicFeedbackError(err?.detail || err?.message || 'Impossible d\'envoyer votre score et commentaire.');
        } finally {
            setSubmittingPublicFeedback(false);
        }
    };

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
                        <div className="text-2xl font-black mb-1">{displayedScore} <span className="text-xs opacity-60 font-bold">/ {displayedTotalScore}</span></div>
                        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-white" animate={{ width: `${displayedScoreProgress}%` }} />
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
                                {formatClockFromSeconds(timeLeft)}
                            </div>
                        </div>
                    )}

                    {/* Question Indicators */}
                    <div className="grid grid-cols-5 gap-2 pt-4 px-2">
                        {questions.map((_, idx) => {
                            const isAnsweredIdx = isQuestionAnsweredAtIndex(idx);
                            const isCorrectIdx = isAnswerCorrectForQuestion(questions[idx], userAnswers[idx]);
                            const shouldRevealThisQuestion = shouldRevealFeedbackAtIndex(idx);

                            return (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        if (isGlobalTimeUp) return;
                                        if (!isChronoMode) {
                                            setCurrentIndex(idx);
                                            return;
                                        }
                                        if (idx <= chronoActiveIndex) setCurrentIndex(idx);
                                    }}
                                    className={`w-full aspect-square rounded-xl flex items-center justify-center font-bold text-xs transition-all border-2
                                    ${currentIndex === idx ? 'bg-indigo-600 text-white border-indigo-600 scale-110 shadow-lg shadow-indigo-500/20' :
                                            isAnsweredIdx ?
                                                ((shouldRevealThisQuestion || isGlobalTimeUp) ?
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
                            onClick={() => {
                                if (isChronoMode) {
                                    if (currentIndex < chronoActiveIndex) {
                                        setCurrentIndex(prev => Math.min(chronoActiveIndex, prev + 1));
                                    } else if (currentIndex === chronoActiveIndex && isAnswered) {
                                        clearInterval(timerRef.current);
                                        moveToNextChronoQuestion(currentIndex);
                                    }
                                } else {
                                    setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1));
                                }
                            }}
                            disabled={isChronoMode
                                ? (isGlobalTimeUp || (currentIndex === chronoActiveIndex && !isAnswered))
                                : (
                                    currentIndex === questions.length - 1
                                    || (!isAnswered && !showImmediateFeedback && !isGlobalTimeUp)
                                    || (showImmediateFeedback && isCurrentQuestionMultiple && isAnswered && !isCurrentQuestionConfirmed)
                                )}
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
                                    {publishLabel} <Rocket size={16} />
                                </motion.button>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setIsFinished(true)}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black flex items-center justify-center gap-2 text-xs shadow-lg shadow-indigo-500/20"
                            >
                                Terminer <Check size={16} />
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 relative flex flex-col items-center custom-scrollbar">
                <div className="max-w-3xl w-full flex flex-col min-h-full pt-4 md:pt-12 pb-16 md:pb-24">
                    {/* Top Meta info */}
                    <div className="flex justify-between items-center w-full mb-6">
                        <span className="px-3 py-1 text-indigo-500 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                            {getQuestionTypeDisplay(q)}
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
                            <h2 
                                className="text-3xl md:text-4xl font-black leading-tight tracking-tight"
                                dir={isRTL(q?.texte_question) ? 'rtl' : 'ltr'}
                                style={{ textAlign: isRTL(q?.texte_question) ? 'right' : 'left' }}
                            >
                                {q?.texte_question}
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {q?.options_reponses.map((opt, idx) => {
                                    const isSelected = Array.isArray(userAnswers[currentIndex])
                                        ? userAnswers[currentIndex].includes(opt)
                                        : userAnswers[currentIndex] === opt;

                                    const resolvedCorrectIndexes = getResolvedCorrectOptionIndices(q);
                                    const isCorrectOpt = resolvedCorrectIndexes.includes(idx);
                                    const isEditableChronoQuestion = isChronoMode && currentIndex === chronoActiveIndex && !isGlobalTimeUp && !isFinished && !isBilan;

                                    let style = "border-transparent text-slate-800 dark:text-slate-300 hover:border-indigo-500/50 cursor-pointer shadow-sm transition-all duration-300";
                                    let bgStyle = { backgroundColor: 'var(--bg-elevated)' };

                                    if (isAnswered) {
                                        if ((shouldRevealCurrentQuestion || isGlobalTimeUp) && !isEditableChronoQuestion) {
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
                                            disabled={(
                                                (!isChronoMode && isAnswered && showImmediateFeedback && !isMultipleAnswerQuestion(q))
                                                || (showImmediateFeedback && isMultipleAnswerQuestion(q) && isCurrentQuestionConfirmed)
                                                || isGlobalTimeUp
                                                || (isChronoMode && currentIndex !== chronoActiveIndex)
                                            )}
                                            className={`group relative transition-all text-left font-bold flex items-center p-5 rounded-2xl min-h-[90px] text-lg border-2 ${style}`}
                                            style={bgStyle}
                                        >
                                            <div className={`rounded-xl flex items-center justify-center shrink-0 mr-4 font-black text-sm border-2 transition-colors w-10 h-10
                                                ${(isAnswered && (shouldRevealCurrentQuestion || isGlobalTimeUp)) ?
                                                    (isCorrectOpt ? 'bg-green-500 border-green-500 text-white' : isSelected ? 'bg-red-500 border-red-500 text-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400') :
                                                    (isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800/50 border-slate-300 dark:border-white/5 text-slate-700 dark:text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600')}`}>
                                                {String.fromCharCode(65 + idx)}
                                            </div>
                                            <span className="flex-1 leading-snug">{opt}</span>

                                            {(shouldRevealCurrentQuestion || isGlobalTimeUp) && isAnswered && isCorrectOpt && (
                                                <div className="ml-3 p-1.5 bg-green-500 rounded-full text-white shrink-0 shadow-lg">
                                                    <Check size={14} strokeWidth={4} />
                                                </div>
                                            )}
                                            {(shouldRevealCurrentQuestion || isGlobalTimeUp) && isSelected && !isCorrectOpt && (
                                                <div className="ml-3 p-1.5 bg-red-500 rounded-full text-white shrink-0 shadow-lg">
                                                    <X size={14} strokeWidth={4} />
                                                </div>
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {showImmediateFeedback && isCurrentQuestionMultiple && !isBilan && !isGlobalTimeUp && (
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleConfirmMultipleAnswer}
                                        disabled={!isAnswered || isCurrentQuestionConfirmed || (isChronoMode && currentIndex !== chronoActiveIndex)}
                                        className="px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    >
                                        {isCurrentQuestionConfirmed ? 'Réponses confirmées' : 'Confirmer mes réponses'}
                                    </button>
                                </div>
                            )}

                            {/* Feedback Reveal */}
                            {isBilan && (
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
                                                {isGlobalTimeUp && !isAnswered
                                                    ? "Le temps imparti est écoulé."
                                                    : (isBilan
                                                        ? (q?.explication || "Pas d'explication supplémentaire.")
                                                        : (isCorrect
                                                            ? "Bonne réponse validée."
                                                            : "Réponse enregistrée. L'explication sera affichée dans le bilan."))}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {isBilan && <div className="h-5 md:h-8" />}
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
                        className="fixed inset-0 z-100 overflow-y-auto custom-scrollbar"
                        style={{ backgroundColor: 'var(--bg-base)' }}
                    >
                        {hideDetailedLiveReport ? (
                            <motion.section initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="min-h-full w-full px-5 md:px-8 pt-8 pb-10 flex items-center justify-center">
                                <div className="max-w-xl w-full rounded-[28px] p-8 border text-center" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                    <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 flex items-center justify-center mx-auto mb-5">
                                        <Check size={36} className="text-indigo-500" />
                                    </div>
                                    <h2 className="text-3xl font-black mb-3">Quiz terminé</h2>
                                    <p className="opacity-80 font-bold text-sm mb-6">Vos réponses ont été enregistrées. Les résultats détaillés sont visibles uniquement par le créateur.</p>
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black"
                                    >
                                        Retour au lobby
                                    </button>
                                </div>
                            </motion.section>
                        ) : (
                        <motion.section initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="min-h-full w-full px-5 md:px-8 pt-8 pb-10">
                            <div className="max-w-6xl mx-auto space-y-6">
                                <div className="rounded-[28px] p-6 border" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.16))', borderColor: 'rgba(99,102,241,0.3)' }}>
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Rapport final</p>
                                            <h2 className="text-4xl font-black mb-1">Session terminée !</h2>
                                            <p className="opacity-80 font-bold text-sm">Page de résultats, exports et statistiques détaillées.</p>
                                        </div>
                                        <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 flex items-center justify-center">
                                            <Trophy size={40} className="text-indigo-500" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2 space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Score final</p>
                                                <p className="text-2xl font-black text-indigo-500">{score} <span className="text-sm opacity-40">/ {totalPossibleScore}</span></p>
                                            </div>
                                            <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Précision</p>
                                                <p className="text-2xl font-black text-emerald-500">{accuracy}%</p>
                                            </div>
                                            <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Correctes</p>
                                                <p className="text-2xl font-black">{correctAnswersCount}</p>
                                            </div>
                                            <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Non répondues</p>
                                                <p className="text-2xl font-black">{unansweredCount}</p>
                                            </div>
                                        </div>

                                        <div className="rounded-3xl p-5 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <p className="text-sm font-medium leading-relaxed italic opacity-85">"{getAdvice()}"</p>
                                        </div>

                                        <div className="rounded-3xl p-5 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-3">Statistiques détaillées</p>
                                            <div className="max-h-[380px] overflow-y-auto custom-scrollbar space-y-3 pr-1 pb-3">
                                                {detailedStats.map((row) => (
                                                    <div key={row.index} className="rounded-2xl p-3 border" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--bg-surface)' }}>
                                                        <p className="text-xs font-black mb-1">Q{row.index + 1}</p>
                                                        <p className="text-xs opacity-80 mb-2">{row.question}</p>
                                                        <p className="text-[11px] opacity-70">Votre réponse: <span className="font-bold">{row.userAnswer}</span></p>
                                                        <p className="text-[11px] opacity-70">Bonne réponse: <span className="font-bold">{row.correctAnswer}</span></p>
                                                        <p className="text-[11px] opacity-70">Résultat: <span className="font-bold">{row.result}</span> • Points: <span className="font-bold">{row.pointsEarned}/{row.pointsTotal}</span></p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="rounded-3xl p-5 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <Download size={16} className="text-indigo-500" />
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Exports</p>
                                            </div>
                                            <div className="space-y-2">
                                                <button
                                                    onClick={() => handleExportQuiz('excel')}
                                                    className="w-full py-2.5 rounded-xl font-black text-xs border transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                                >
                                                    <FileSpreadsheet size={14} /> Exporter Excel (.xlsx)
                                                </button>
                                                <button
                                                    onClick={() => handleExportQuiz('pdf')}
                                                    className="w-full py-2.5 rounded-xl font-black text-xs border transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                                >
                                                    <FileText size={14} /> Exporter PDF (.pdf)
                                                </button>
                                                <button
                                                    onClick={() => handleExportQuiz('aiken')}
                                                    className="w-full py-2.5 rounded-xl font-black text-xs border transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                                >
                                                    <FileText size={14} /> Exporter Aiken (.txt)
                                                </button>
                                            </div>
                                        </div>

                                        <div className="rounded-3xl p-5 border space-y-4" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Votre avis</p>
                                            <div className="flex items-center gap-2">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <div key={star} className="relative w-[18px] h-[18px]">
                                                        <Star size={18} color="var(--text-secondary)" fill="none" className="absolute inset-0" />
                                                        <div
                                                            className="absolute inset-0 overflow-hidden"
                                                            style={{ width: `${Math.max(0, Math.min(1, userRating - (star - 1))) * 100}%` }}
                                                        >
                                                            <Star size={18} color="#f59e0b" fill="#f59e0b" className="absolute inset-0" />
                                                        </div>
                                                    </div>
                                                ))}
                                                <span className="text-xs font-black ml-1" style={{ color: 'var(--text-primary)' }}>
                                                    {userRating > 0 ? Number(userRating).toFixed(1) : '0.0'} / 5
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={5}
                                                step={0.5}
                                                value={userRating}
                                                onChange={(e) => setUserRating(Number(e.target.value))}
                                                className="w-full accent-amber-500"
                                                aria-label="Note du quiz"
                                            />
                                            <textarea
                                                value={userComment}
                                                onChange={(e) => setUserComment(e.target.value)}
                                                rows={4}
                                                placeholder="Écrire un commentaire (optionnel)..."
                                                className="w-full rounded-2xl border p-3 text-sm outline-none resize-none"
                                                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                                            />

                                            {canSubmitPublicFeedback && (
                                                <button
                                                    type="button"
                                                    onClick={handleSubmitPublicFeedback}
                                                    disabled={submittingPublicFeedback || publicFeedbackSuccess || !String(userComment || '').trim()}
                                                    className="w-full py-3 rounded-2xl font-black text-xs uppercase tracking-wide bg-indigo-600 text-white disabled:opacity-45"
                                                >
                                                    {submittingPublicFeedback
                                                        ? 'Envoi en cours...'
                                                        : publicFeedbackSuccess
                                                            ? 'Score et commentaire envoyes'
                                                            : 'Envoyer score et commentaire'}
                                                </button>
                                            )}

                                            {!currentUser && quiz?.visibilite === 'public' && !isLiveSessionParticipant && (
                                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    Connectez-vous pour enregistrer votre score et publier votre commentaire.
                                                </p>
                                            )}

                                            {publicFeedbackError && (
                                                <p className="text-xs font-bold text-red-500">{publicFeedbackError}</p>
                                            )}
                                        </div>

                                        <div className="rounded-3xl p-5 border space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                            <button
                                                onClick={() => {
                                                    setIsBilan(true);
                                                    setIsFinished(false);
                                                    setIsGlobalTimeUp(false);
                                                    setCurrentIndex(0);
                                                }}
                                                className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 hover:scale-[1.01] transition-transform"
                                            >
                                                Bilan de quiz <HelpCircle size={18} />
                                            </button>
                                            <button
                                                onClick={onClose}
                                                className="w-full py-3 bg-slate-500/10 hover:bg-slate-500/20 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-xs"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Revenir au menu principal
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.section>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bilan Mode Overlay Footer Removed for sidebar integration */}
        </motion.div>
    );
};

export default QuizPlayer;


