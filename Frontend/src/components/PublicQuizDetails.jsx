import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  Pencil,
  Copy,
  Users,
  Star,
  MessageCircle,
  Send,
  Trophy,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import api from '../utils/api';

const formatDate = (value) => {
  if (!value) return 'Date inconnue';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return String(value);
  }
};

const avatarLabel = (user) => {
  const text = user?.nom_affichage || 'U';
  return String(text).trim().charAt(0).toUpperCase() || 'U';
};

const UserAvatar = ({ user, size = 42 }) => {
  const style = { width: size, height: size };
  if (user?.photo_url) {
    return (
      <img
        src={user.photo_url}
        alt={user.nom_affichage || 'Utilisateur'}
        style={style}
        className="rounded-full object-cover border"
      />
    );
  }
  return (
    <div
      style={style}
      className="rounded-full bg-indigo-600 text-white font-black flex items-center justify-center border"
    >
      {avatarLabel(user)}
    </div>
  );
};

const RatingStars = ({ value, onChange, readonly = false, size = 18 }) => {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const fillWidth = `${Math.max(0, Math.min(1, Number(value || 0) - (star - 1))) * 100}%`;
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => {
              if (!readonly && onChange) onChange(star);
            }}
            className={`relative transition-transform ${readonly ? 'cursor-default' : 'hover:scale-110'}`}
            aria-label={`Note ${star}`}
          >
            <Star size={size} color="var(--text-muted)" fill="none" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: fillWidth }}>
              <Star size={size} color="#f59e0b" fill="#f59e0b" />
            </span>
          </button>
        );
      })}
    </div>
  );
};

const CommentNode = ({
  comment,
  currentUser,
  replyDrafts,
  setReplyDrafts,
  replyingIds,
  setReplyingIds,
  onSubmitReply,
  onAskLogin,
  depth = 0,
}) => {
  const isReplying = replyingIds.includes(comment.id_commentaire);
  const replyValue = replyDrafts[comment.id_commentaire] || '';

  return (
    <div className={`rounded-2xl border p-4 ${depth > 0 ? 'ml-8 mt-3' : ''}`} style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
      <div className="flex items-start gap-3">
        <UserAvatar user={comment.auteur} size={38} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-sm" style={{ color: 'var(--text-primary)' }}>
              {comment.auteur?.nom_affichage || 'Utilisateur'}
            </p>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatDate(comment.date_publication)}
            </span>
          </div>

          {comment.note ? (
            <div className="mt-1">
              <RatingStars value={comment.note} readonly={true} size={14} />
            </div>
          ) : null}

          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {comment.contenu}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide"
              style={{ color: 'var(--accent)' }}
              onClick={() => {
                if (!currentUser) {
                  onAskLogin();
                  return;
                }
                if (isReplying) {
                  setReplyingIds((prev) => prev.filter((id) => id !== comment.id_commentaire));
                } else {
                  setReplyingIds((prev) => [...prev, comment.id_commentaire]);
                }
              }}
            >
              <MessageCircle size={13} /> Repondre
            </button>
          </div>

          <AnimatePresence>
            {isReplying && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="mt-3 space-y-2"
              >
                <textarea
                  rows={3}
                  value={replyValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setReplyDrafts((prev) => ({ ...prev, [comment.id_commentaire]: value }));
                  }}
                  placeholder="Ecrire une reponse..."
                  className="w-full rounded-xl border p-3 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onSubmitReply(comment.id_commentaire, replyValue)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white"
                  >
                    <Send size={14} /> Envoyer
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {Array.isArray(comment.replies) && comment.replies.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id_commentaire}
              comment={reply}
              currentUser={currentUser}
              replyDrafts={replyDrafts}
              setReplyDrafts={setReplyDrafts}
              replyingIds={replyingIds}
              setReplyingIds={setReplyingIds}
              onSubmitReply={onSubmitReply}
              onAskLogin={onAskLogin}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PublicQuizDetails = ({
  quizId,
  currentUser,
  onBack,
  onPlayQuiz,
  onRequestEdit,
  onOpenAuth,
  refreshSignal = 0,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentRating, setCommentRating] = useState(0);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingIds, setReplyingIds] = useState([]);

  const loadDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/quiz/public/${quizId}/details`);
      setDetail(data);
    } catch (err) {
      console.error('[PublicQuizDetails] Erreur:', err);
      setError('Impossible de charger les details du quiz pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!quizId) return;
    loadDetails();
  }, [quizId, refreshSignal]);

  const stats = detail?.stats || {};
  const quiz = detail?.quiz;
  const creator = detail?.createur;

  const isOwner = Boolean(currentUser?.id_utilisateur && quiz?.id_utilisateur === currentUser.id_utilisateur);
  const canRequestEdit = Boolean(detail?.can_clone);

  const topPlayers = useMemo(() => {
    const values = Array.isArray(detail?.players) ? detail.players : [];
    return values.slice(0, 12);
  }, [detail?.players]);

  const ratingScale = useMemo(() => {
    return Array.from({ length: 10 }, (_, index) => (index + 1) / 2);
  }, []);

  const askLogin = () => {
    if (onOpenAuth) onOpenAuth('login');
  };

  const submitComment = async () => {
    if (!currentUser) {
      askLogin();
      return;
    }

    const content = String(commentText || '').trim();
    if (!content) return;

    setSubmittingComment(true);
    try {
      await api.post(`/quiz/public/${quizId}/comments`, {
        contenu: content,
        note: commentRating > 0 ? commentRating : null,
      });

      setCommentText('');
      setCommentRating(0);
      await loadDetails();
    } catch (err) {
      console.error('[PublicQuizDetails] Erreur commentaire:', err);
      alert(err?.detail || err?.message || 'Impossible de publier ce commentaire.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const submitReply = async (parentId, value) => {
    if (!currentUser) {
      askLogin();
      return;
    }

    const content = String(value || '').trim();
    if (!content) return;

    try {
      await api.post(`/quiz/public/${quizId}/comments`, {
        contenu: content,
        id_parent: parentId,
      });

      setReplyDrafts((prev) => ({ ...prev, [parentId]: '' }));
      setReplyingIds((prev) => prev.filter((id) => id !== parentId));
      await loadDetails();
    } catch (err) {
      console.error('[PublicQuizDetails] Erreur reponse:', err);
      alert(err?.detail || err?.message || 'Impossible de publier cette reponse.');
    }
  };

  return (
    <section className="pt-8 md:pt-10 px-6 pb-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black"
            style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}
          >
            <ArrowLeft size={16} /> Retour
          </button>

          <button
            onClick={loadDetails}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase"
            style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="h-[340px] animate-pulse rounded-3xl border lg:col-span-2" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }} />
            <div className="h-[340px] animate-pulse rounded-3xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }} />
          </div>
        ) : error ? (
          <div className="rounded-3xl border p-8 text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
            <p className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <article className="relative overflow-hidden rounded-[32px] border lg:col-span-2" style={{ borderColor: 'var(--glass-border)' }}>
                {quiz?.image_couverture_url ? (
                  <img
                    src={quiz.image_couverture_url}
                    alt={quiz?.titre || 'Quiz'}
                    className="h-[360px] w-full object-cover"
                  />
                ) : (
                  <div className="h-[360px] w-full bg-linear-to-br from-indigo-600 via-purple-600 to-pink-500" />
                )}

                <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent" />

                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <h1 className="text-3xl font-black md:text-4xl">{quiz?.titre}</h1>
                  {quiz?.description ? (
                    <p className="mt-2 max-w-2xl text-sm font-medium text-white/85">{quiz.description}</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-wide">
                    <span className="rounded-full bg-white/15 px-3 py-1.5">{quiz?.nombre_questions || 0} questions</span>
                    <span className="rounded-full bg-white/15 px-3 py-1.5">{quiz?.difficulte_moyenne || 'Moyen'}</span>
                    <span className="rounded-full bg-white/15 px-3 py-1.5">{formatDate(quiz?.date_creation)}</span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={() => onPlayQuiz(quiz?.id_quiz)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black"
                    >
                      <Play size={16} className="fill-current" /> Rejouer ce quiz
                    </button>

                    <button
                      onClick={() => {
                        if (!currentUser) {
                          askLogin();
                          return;
                        }
                        if (!canRequestEdit) {
                          alert('Le createur a desactive le clonage de ce quiz.');
                          return;
                        }
                        onRequestEdit(quiz?.id_quiz, detail);
                      }}
                      disabled={!canRequestEdit}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-black text-white disabled:opacity-45"
                    >
                      {isOwner ? <Pencil size={16} /> : <Copy size={16} />}
                      {isOwner ? 'Modifier mon quiz' : 'Cloner et modifier'}
                    </button>
                  </div>
                </div>
              </article>

              <aside className="space-y-4">
                <div className="rounded-3xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Createur
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <UserAvatar user={creator} size={44} />
                    <div>
                      <p className="font-black" style={{ color: 'var(--text-primary)' }}>
                        {creator?.nom_affichage || 'Utilisateur'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {quiz?.visibilite === 'public' ? 'Quiz public' : 'Quiz prive'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Note moyenne</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Star size={18} className="text-amber-500" fill="#f59e0b" />
                      <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{Number(stats.average_rating || 0).toFixed(2)}</p>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{stats.total_reviews || 0} avis</p>
                  </div>

                  <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Moyenne score</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Trophy size={18} className="text-indigo-500" />
                      <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{Number(stats.average_score || 0).toFixed(1)}</p>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{stats.total_participations || 0} passages</p>
                  </div>

                  <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Commentaires</p>
                    <div className="mt-2 flex items-center gap-2">
                      <MessageCircle size={18} className="text-emerald-500" />
                      <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{stats.total_comments || 0}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Joueurs</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Users size={18} className="text-orange-500" />
                      <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                        {stats.total_players ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className="rounded-3xl border p-5 lg:col-span-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                <div className="mb-4 flex items-center gap-2">
                  <Trophy size={18} className="text-indigo-500" />
                  <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Scores des participants</h2>
                </div>

                {topPlayers.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Aucun score enregistre pour le moment.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {topPlayers.map((player, index) => (
                      <div key={`${player.id_utilisateur}-${index}`} className="rounded-2xl border p-3" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--bg-base)' }}>
                        <div className="flex items-start gap-3">
                          <UserAvatar user={player} size={36} />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{player.nom_affichage || 'Participant'}</p>
                            <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                              <span className="inline-flex items-center gap-1"><Trophy size={12} /> {player.best_score}</span>
                              <span>{player.attempts} passages</span>
                            </div>
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              <Calendar size={11} /> {formatDate(player.last_played_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-3xl border p-5 lg:col-span-2" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}>
                <div className="mb-4 flex items-center gap-2">
                  <MessageCircle size={18} className="text-indigo-500" />
                  <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Commentaires</h2>
                </div>

                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {Array.isArray(detail?.comments) && detail.comments.length > 0 ? (
                    detail.comments.map((comment) => (
                      <CommentNode
                        key={comment.id_commentaire}
                        comment={comment}
                        currentUser={currentUser}
                        replyDrafts={replyDrafts}
                        setReplyDrafts={setReplyDrafts}
                        replyingIds={replyingIds}
                        setReplyingIds={setReplyingIds}
                        onSubmitReply={submitReply}
                        onAskLogin={askLogin}
                      />
                    ))
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Aucun commentaire pour ce quiz. Soyez le premier a partager votre avis.
                    </p>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--glass-border)' }}>
                  {currentUser ? (
                    <>
                      <div className="mb-3">
                        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Votre note
                        </p>
                        <div className="mt-2 overflow-x-auto pb-1">
                          <div className="flex min-w-max items-center gap-2">
                            {ratingScale.map((value) => {
                              const isActive = Number(commentRating) === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setCommentRating(value)}
                                  className="rounded-full border px-3 py-1 text-xs font-black transition"
                                  style={{
                                    borderColor: isActive ? '#6366f1' : 'var(--glass-border)',
                                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                                    backgroundColor: isActive ? '#6366f1' : 'var(--bg-surface)',
                                  }}
                                >
                                  {value.toFixed(1)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <RatingStars value={commentRating} readonly={true} size={16} />
                          <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                            {commentRating > 0 ? `${Number(commentRating).toFixed(1)} / 5` : 'Aucune note'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <UserAvatar user={currentUser} size={34} />
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (!submittingComment && String(commentText || '').trim()) {
                                submitComment();
                              }
                            }
                          }}
                          placeholder="Ajoutez un commentaire..."
                          className="h-11 flex-1 rounded-full border px-4 text-sm outline-none"
                          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                        />
                        <button
                          type="button"
                          onClick={submitComment}
                          disabled={submittingComment || !String(commentText || '').trim()}
                          className="inline-flex h-11 items-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-black text-white disabled:opacity-50"
                        >
                          <Send size={14} /> Publier
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Connectez-vous pour noter ce quiz et publier un commentaire.
                      </p>
                      <button
                        onClick={askLogin}
                        className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white"
                      >
                        Se connecter
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default PublicQuizDetails;
