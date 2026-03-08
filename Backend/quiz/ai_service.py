import json
import re
import time

# Prefer httpx, fall back to requests, finally to urllib if neither is available
_HTTP_LIB = None
try:
    import httpx as _http_lib
    _HTTP_LIB = 'httpx'
except Exception:
    try:
        import requests as _http_lib
        _HTTP_LIB = 'requests'
    except Exception:
        # Last-resort: use urllib (std lib)
        import urllib.request as _urllib_request
        import urllib.error as _urllib_error
        _HTTP_LIB = 'urllib'

from typing import List, Dict, Optional
from database.config import settings as app_settings

MAX_CONTEXT_CHARS = 40_000
DEFAULT_BATCH_SIZE = 10
QWEN_REQUEST_TIMEOUT = 70
QWEN_MAX_RETRIES = 3
MAX_TOTAL_AI_SECONDS = 170


def _safe_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _prepare_context(context: str, max_chars: int = MAX_CONTEXT_CHARS) -> str:
    cleaned = (context or "").replace("\x00", " ").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    head = int(max_chars * 0.7)
    tail = max_chars - head
    return f"{cleaned[:head]}\n\n[...]\n\n{cleaned[-tail:]}"




def _strip_document_markers(context: str) -> str:
    cleaned_lines = []
    for line in (context or '').splitlines():
        line_strip = line.strip()
        if not line_strip:
            continue
        if line_strip.startswith('--- Contenu de'):
            continue
        if line_strip.startswith('[DOCUMENT'):
            continue
        cleaned_lines.append(line_strip)
    return '\n'.join(cleaned_lines)


def _looks_like_noise(sentence: str) -> bool:
    s = sentence.strip()
    if len(s) < 35:
        return True
    if re.search(r'(?:\.pdf|\.docx|\.txt|oct/char|nchar|raw|unicode)', s, flags=re.IGNORECASE):
        return True
    if sum(ch.isalpha() for ch in s) < 20:
        return True
    return False


def _generate_questions_fallback(context: str, num_questions: int) -> List[Dict]:
    """Fallback: génère des questions par extraction locale si Qwen échoue."""
    cleaned_context = _strip_document_markers(context)
    sentences = re.split(r'[.!?]+', cleaned_context)
    sentences = [
        s.strip()
        for s in sentences
        if len(s.strip()) > 20 and "http" not in s and "www" not in s and not _looks_like_noise(s)
    ]

    if not sentences:
        sentences = [s.strip() for s in re.split(r'[.!?]+', cleaned_context) if len(s.strip()) > 0 and not _looks_like_noise(s)]
        if not sentences:
            raise ValueError("Contenu insuffisant pour générer des questions")

    questions = []
    start_idx = min(len(sentences) // 4, 10)
    sentences_pool = sentences[start_idx:] or sentences

    for i in range(num_questions):
        sentence = sentences_pool[i % len(sentences_pool)]
        q_text = f"Selon le contenu étudié, quelle affirmation est correcte à propos de : '{sentence[:80]}...' ?"
        correct_answer = sentence[:120] if len(sentence) > 120 else sentence

        options = [
            correct_answer,
            "Cette affirmation est contredite par le texte.",
            "Le document ne mentionne pas cette information.",
            "Il s'agit d'une interprétation erronée du sujet."
        ]

        import random
        random.shuffle(options)

        questions.append({
            "texte_question": q_text,
            "type_question": "MCQ",
            "options_reponses": options,
            "reponse_correcte": correct_answer,
            "explication": "Réponse extraite du corps du document.",
            "points": 1
        })
    return questions


def _is_valid_question(question: Dict) -> bool:
    if not isinstance(question, dict):
        return False
    required = ["texte_question", "type_question", "options_reponses", "reponse_correcte"]
    return all(question.get(field) for field in required)


class AIService:
    @staticmethod
    def generate_questions_qwen(
        context: str,
        settings: Dict,
        num_questions_override: Optional[int] = None,
        request_timeout: int = QWEN_REQUEST_TIMEOUT,
        max_retries: int = QWEN_MAX_RETRIES,
    ) -> List[Dict]:
        """Génère des questions avec Qwen via HF Router."""
        hf_token = app_settings.HF_TOKEN
        if not hf_token:
            print("WARNING: HF_TOKEN missing, fallback local")
            return None

        num_questions = num_questions_override or settings.get('num_questions', 5)
        difficulty = settings.get('difficulty', 'Moyen')
        language = settings.get('language', 'Français')
        question_type = settings.get('question_type', 'Mélangé')
        tone = settings.get('tone', 'Fun')

        diff_instructions = {
            "Débutant": "Concepts de base, questions directes, distracteurs très évidents.",
            "Moyen": "Nécessite une bonne compréhension du texte, distracteurs plausibles.",
            "Expert": "Analyse critique, détails subtils, distracteurs sophistiqués."
        }

        tone_instructions = {
            "Fun": "Style décontracté et motivant.",
            "Académique": "Style formel et rigoureux.",
            "Mystérieux": "Style intrigue/énigme."
        }

        show_immediate_feedback = settings.get('show_immediate_feedback', True)

        type_constraint = ""
        if question_type == "Vrai ou Faux":
            type_constraint = (
                "Toutes les questions doivent être de type 'Vrai ou Faux'. "
                "options_reponses = [\"Vrai\", \"Faux\"], reponse_correcte = 'Vrai' ou 'Faux'."
            )
        elif question_type == "QCM":
            type_constraint = "Toutes les questions doivent être des MCQ avec exactement 4 options."
        elif question_type == "Plusieurs Réponses":
            type_constraint = (
                "Questions à choix multiples avec plusieurs réponses correctes. "
                "options_reponses: 4 choix, reponse_correcte: liste de réponses exactes."
            )
        elif question_type == "Mélangé":
            type_constraint = "Mélange QCM/VF/Multiple réponses de façon équilibrée."

        feedback_instruction = (
            "Correction immédiate activée: explications courtes et percutantes."
            if show_immediate_feedback
            else "Correction en fin de quiz: explications didactiques et détaillées."
        )

        metadata_instructions = ""
        if settings.get('titre') and settings.get('titre').strip():
            metadata_instructions += f"\n- TITRE SOUHAITÉ : {settings.get('titre')}"
        if settings.get('description') and settings.get('description').strip():
            metadata_instructions += f"\n- CONTEXTE/DESCRIPTION : {settings.get('description')}"

        system_prompt = f"""Tu es Antigravity-Quiz.
Génère un quiz de qualité basé strictement sur le contenu fourni.{metadata_instructions}

Contraintes strictes:
- EXACTEMENT {num_questions} questions.
- Ignore les noms de fichiers, marqueurs techniques et métadonnées; base-toi sur les idées métier/contenu réel.
- Langue: {language}
- Difficulté: {difficulty} ({diff_instructions.get(difficulty, '')})
- Ton: {tone} ({tone_instructions.get(tone, '')})
- {type_constraint}
- {feedback_instruction}

Retourne UNIQUEMENT du JSON valide avec ce format:
{{
  "titre": "...",
  "description": "...",
  "questions": [
    {{
      "texte_question": "...",
      "type_question": "MCQ",
      "options_reponses": ["...", "...", "...", "..."],
      "reponse_correcte": "...",
      "explication": "...",
      "points": 1
    }}
  ]
}}"""

        prepared_context = _prepare_context(_strip_document_markers(context))
        user_content = f"Texte source:\n\n{prepared_context}"

        payload = {
            "model": "Qwen/Qwen2.5-72B-Instruct",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "max_tokens": 4096,
            "temperature": 0.35,
            "response_format": {"type": "json_object"}
        }

        API_URL = "https://router.huggingface.co/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/json"
        }

        for attempt in range(max_retries):
            try:
                if _HTTP_LIB == 'httpx':
                    response = _http_lib.post(API_URL, headers=headers, json=payload, timeout=float(request_timeout))
                elif _HTTP_LIB == 'requests':
                    response = _http_lib.post(API_URL, headers=headers, json=payload, timeout=float(request_timeout))
                else:
                    data = json.dumps(payload).encode('utf-8')
                    req = _urllib_request.Request(API_URL, data=data, headers=headers, method='POST')
                    try:
                        with _urllib_request.urlopen(req, timeout=request_timeout) as resp:
                            resp_text = resp.read().decode('utf-8')
                            class _RespObj:
                                pass
                            response = _RespObj()
                            response.status_code = resp.getcode()
                            response.text = resp_text
                    except _urllib_error.HTTPError as e:
                        response = e

                if response.status_code != 200:
                    if response.status_code in [429, 500, 502, 503, 504]:
                        print(f" [Qwen] tentative {attempt+1}/{max_retries} échouée ({response.status_code})")
                        time.sleep(0.6)
                        continue
                    print(f" [Qwen] erreur non-récupérable ({response.status_code}): {response.text}")
                    return None

                resp_text = response.text
                if not resp_text or not resp_text.strip():
                    continue

                try:
                    data = response.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                except Exception:
                    content = resp_text

                if "```json" in content:
                    content = content.split("```json", 1)[1].split("```", 1)[0].strip()
                elif "```" in content:
                    parts = content.split("```")
                    if len(parts) >= 3:
                        content = parts[1].strip()

                if not content:
                    m = re.search(r"\{(?:.|\n)*\}", resp_text)
                    if m:
                        content = m.group(0)

                result = json.loads(content)
                questions = result.get("questions", []) if isinstance(result, dict) else []
                if not questions:
                    continue

                settings['_generated_metadata'] = {
                    "titre": result.get("titre", "Quiz généré"),
                    "description": result.get("description", ""),
                    "difficulty": difficulty
                }
                print(f" [Qwen] Generated {len(questions)}/{num_questions} questions")
                return questions[:num_questions]
            except Exception as req_e:
                print(f" [Qwen] erreur tentative {attempt+1}: {req_e}")
                continue

        return None

    @staticmethod
    def generate_questions(context: str, settings: Dict) -> List[Dict]:
        """
        Stratégie robuste et rapide:
        1) Qwen avec budget temps court
        2) Batching pour gros volumes si budget restant
        3) Fallback local garanti (pas d'échec utilisateur)
        """
        requested_count = _safe_int(settings.get('num_questions', 10), 10)
        requested_count = max(1, min(requested_count, 30))
        settings['num_questions'] = requested_count

        prepared_context = _prepare_context(_strip_document_markers(context))

        if settings.get('force_fallback'):
            print(" [AI] force_fallback activé.")
            return _generate_questions_fallback(prepared_context, requested_count)

        start_ts = time.monotonic()
        aggregated: List[Dict] = []
        batch_size = min(DEFAULT_BATCH_SIZE, requested_count)

        while len(aggregated) < requested_count:
            elapsed = time.monotonic() - start_ts
            if elapsed >= MAX_TOTAL_AI_SECONDS:
                print(" [AI] Budget temps dépassé, fallback local pour compléter.")
                break

            current_batch = min(batch_size, requested_count - len(aggregated))

            # Timeout court pour rester réactif
            remaining_budget = max(8, int(MAX_TOTAL_AI_SECONDS - elapsed))
            request_timeout = min(QWEN_REQUEST_TIMEOUT, remaining_budget)

            batch_settings = dict(settings)
            qwen_questions = AIService.generate_questions_qwen(
                prepared_context,
                batch_settings,
                num_questions_override=current_batch,
                request_timeout=request_timeout,
                max_retries=QWEN_MAX_RETRIES,
            )
            valid_batch = [q for q in (qwen_questions or []) if _is_valid_question(q)]
            if not valid_batch:
                print(f" [AI] Batch Qwen vide pour {current_batch}, arrêt cloud.")
                break

            aggregated.extend(valid_batch[:current_batch])
            if '_generated_metadata' in batch_settings and '_generated_metadata' not in settings:
                settings['_generated_metadata'] = batch_settings['_generated_metadata']

            # Si l'API renvoie moins que demandé, réduire la pression
            if len(valid_batch) < current_batch and batch_size > 4:
                batch_size = max(4, batch_size - 2)

            # Limiter le nombre d'allers-retours pour accélérer
            if requested_count > 15 and len(aggregated) >= requested_count:
                break

        if len(aggregated) >= requested_count:
            return aggregated[:requested_count]

        if '_generated_metadata' not in settings:
            settings['_generated_metadata'] = {
                "titre": f"Quiz - {prepared_context[:30]}...",
                "description": "Généré par extraction automatique (fallback)",
                "difficulty": settings.get('difficulty', 'Moyen')
            }

        fallback_needed = requested_count - len(aggregated)
        fallback_questions = _generate_questions_fallback(prepared_context, fallback_needed)
        return (aggregated + fallback_questions)[:requested_count]
