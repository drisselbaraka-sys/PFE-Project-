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

MAX_CONTEXT_CHARS = 45_000
QWEN_REQUEST_TIMEOUT = 180
QWEN_MAX_RETRIES = 3


def _safe_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _prepare_context(context: str, max_chars: int = MAX_CONTEXT_CHARS) -> str:
    cleaned = (context or "").replace("\x00", " ").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    head = int(max_chars * 0.72)
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
    if len(s) < 25:
        return True
    if re.search(r'(?:\.pdf|\.docx|\.txt|oct/char|nchar|long raw|www\.|http)', s, flags=re.IGNORECASE):
        return True
    if sum(ch.isalpha() for ch in s) < 14:
        return True
    words = [w for w in re.split(r"\s+", s) if w]
    if words:
        avg_len = sum(len(w) for w in words) / len(words)
        if avg_len > 14:
            return True
    return False


def _generate_questions_fallback(context: str, num_questions: int) -> List[Dict]:
    """Fallback local basé sur des phrases utiles du contexte."""
    cleaned_context = _strip_document_markers(context)
    sentences = re.split(r'[.!?]+', cleaned_context)
    sentences = [
        s.strip()
        for s in sentences
        if len(s.strip()) > 30 and "http" not in s and "www" not in s and not _looks_like_noise(s)
    ]

    if not sentences:
        raise ValueError("Contenu insuffisant pour générer des questions")

    questions = []
    start_idx = min(len(sentences) // 5, 12)
    sentences_pool = sentences[start_idx:] or sentences

    for i in range(num_questions):
        sentence = sentences_pool[i % len(sentences_pool)]
        statement = sentence[:140]
        q_text = f"Dans le contexte fourni, quelle proposition est exacte concernant : '{statement}...' ?"
        correct_answer = statement

        options = [
            correct_answer,
            "Cette proposition contredit les éléments présentés dans le document.",
            "Le document ne fournit pas d'information permettant cette conclusion.",
            "Cette proposition mélange plusieurs notions de façon incorrecte."
        ]

        import random
        random.shuffle(options)

        questions.append({
            "texte_question": q_text,
            "type_question": "MCQ",
            "options_reponses": options,
            "reponse_correcte": correct_answer,
            "explication": "La bonne réponse est directement soutenue par le contenu source.",
            "points": 1
        })
    return questions


def _extract_topic(topic_text: str) -> str:
    text = (topic_text or "").strip()
    if not text:
        return "Sujet technique"
    first_line = text.splitlines()[0].strip()
    return first_line[:120]


def _generate_topic_questions_fallback(topic_text: str, num_questions: int) -> List[Dict]:
    """Fallback minimal quand aucun contexte documentaire utile n'est disponible."""
    topic = _extract_topic(topic_text)
    lower = topic.lower()

    if "c" in lower and ("langage" in lower or lower == "c"):
        seeds = [
            ("En langage C, quel est l'impact principal d'un dépassement de tampon (buffer overflow) ?", "Comportement indéfini pouvant mener à des failles de sécurité et des plantages."),
            ("Quelle différence clé existe entre allocation sur pile (stack) et allocation dynamique (heap) en C ?", "La stack est gérée automatiquement par la portée, le heap doit être géré manuellement (malloc/free)."),
            ("Pourquoi `const` est-il utile dans la signature d'une fonction C ?", "Il protège les données contre les modifications involontaires et clarifie l'intention de l'API."),
            ("Dans quel cas privilégier un pointeur plutôt qu'une copie de structure en C ?", "Pour éviter des copies coûteuses et manipuler efficacement de grands objets en mémoire."),
        ]
    elif "sql" in lower:
        seeds = [
            ("Dans SQL, pourquoi un index B-tree accélère-t-il certaines requêtes ?", "Il réduit le nombre de pages parcourues lors des opérations de recherche et de tri."),
            ("Quelle différence conceptuelle entre `WHERE` et `HAVING` ?", "WHERE filtre les lignes avant agrégation; HAVING filtre les groupes après agrégation."),
            ("Pourquoi normaliser une base relationnelle jusqu'à 3NF ?", "Pour réduire la redondance et limiter les anomalies d'insertion/mise à jour/suppression."),
            ("Quand utiliser une transaction explicite avec COMMIT/ROLLBACK ?", "Quand plusieurs opérations doivent réussir ou échouer de manière atomique."),
        ]
    else:
        seeds = [
            (f"Quelle pratique permet d'assurer une meilleure fiabilité lors du développement autour de '{topic}' ?", "Valider les entrées, tester les cas limites et documenter clairement les hypothèses."),
            (f"Quel est un indicateur de bonne conception technique pour '{topic}' ?", "Une séparation claire des responsabilités et une architecture maintenable."),
            (f"Pourquoi l'observabilité est-elle importante pour '{topic}' en production ?", "Elle permet de diagnostiquer rapidement les anomalies et d'améliorer la qualité du service."),
            (f"Quel est l'avantage d'une approche itérative pour implémenter '{topic}' ?", "Livrer progressivement, réduire les risques et intégrer le feedback tôt."),
        ]

    questions = []
    import random
    for i in range(num_questions):
        q_text, correct = seeds[i % len(seeds)]
        options = [
            correct,
            "Ignorer les contraintes techniques et se fier uniquement à l'intuition.",
            "Éviter toute mesure de qualité ou de performance.",
            "Remplacer l'analyse du problème par des hypothèses non vérifiées.",
        ]
        random.shuffle(options)
        questions.append({
            "texte_question": q_text,
            "type_question": "MCQ",
            "options_reponses": options,
            "reponse_correcte": correct,
            "explication": f"Cette réponse est cohérente avec les principes techniques du sujet '{topic}'.",
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
        tone = settings.get('tone', 'Académique')

        type_constraint = ""
        if question_type == "Vrai ou Faux":
            type_constraint = "Toutes les questions: Vrai/Faux, options_reponses = [\"Vrai\", \"Faux\"]."
        elif question_type == "QCM":
            type_constraint = "Toutes les questions: QCM avec exactement 4 options."
        elif question_type == "Plusieurs Réponses":
            type_constraint = "Questions à réponses multiples: 4 options, reponse_correcte = liste de bonnes réponses."
        elif question_type == "Mélangé":
            type_constraint = "Mélanger QCM/Vrai-Faux/Plusieurs réponses de façon équilibrée."

        metadata_instructions = ""
        if settings.get('titre') and settings.get('titre').strip():
            metadata_instructions += f"\n- TITRE SOUHAITÉ : {settings.get('titre')}"
        if settings.get('description') and settings.get('description').strip():
            metadata_instructions += f"\n- CONTEXTE/DESCRIPTION : {settings.get('description')}"

        system_prompt = f"""Tu es un expert senior en ingénierie pédagogique technique.
Tu dois générer des questions précises, intelligentes, concrètes et professionnelles.{metadata_instructions}

Contraintes:
- EXACTEMENT {num_questions} questions
- Langue: {language}
- Difficulté: {difficulty}
- Ton: {tone}
- {type_constraint}
- Interdit: questions vagues/génériques du type "définition simple" sans contexte.
- Interdit: utiliser des noms de fichiers, marqueurs techniques d'extraction, lignes corrompues.
- Les questions doivent tester la compréhension réelle (concepts, implications, choix techniques, pièges fréquents).

Retourne UNIQUEMENT du JSON valide:
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
        user_content = f"Contenu source pour générer le quiz:\n\n{prepared_context}"

        payload = {
            "model": "Qwen/Qwen2.5-72B-Instruct",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "max_tokens": 7000,
            "temperature": 0.25,
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
                        time.sleep(1.0)
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
                valid_questions = [q for q in questions if _is_valid_question(q)]
                if not valid_questions:
                    continue

                settings['_generated_metadata'] = {
                    "titre": result.get("titre", "Quiz généré"),
                    "description": result.get("description", ""),
                    "difficulty": difficulty
                }
                print(f" [Qwen] Generated {len(valid_questions)}/{num_questions} questions")
                return valid_questions[:num_questions]
            except Exception as req_e:
                print(f" [Qwen] erreur tentative {attempt+1}: {req_e}")
                continue

        return None

    @staticmethod
    def generate_questions(context: str, settings: Dict) -> List[Dict]:
        requested_count = _safe_int(settings.get('num_questions', 10), 10)
        requested_count = max(1, min(requested_count, 30))
        settings['num_questions'] = requested_count

        prepared_context = _prepare_context(_strip_document_markers(context))

        if settings.get('force_fallback'):
            try:
                return _generate_questions_fallback(prepared_context, requested_count)
            except ValueError:
                return _generate_topic_questions_fallback(prepared_context or settings.get('prompt', ''), requested_count)

        # Tentative cloud principale: un seul appel complet pour garder la cohérence technique
        questions = AIService.generate_questions_qwen(
            prepared_context,
            settings,
            num_questions_override=requested_count,
            request_timeout=QWEN_REQUEST_TIMEOUT,
            max_retries=QWEN_MAX_RETRIES,
        )
        if questions and len(questions) >= max(3, min(requested_count, 8)):
            if len(questions) < requested_count:
                # compléter en fallback local si réponse partielle
                missing = requested_count - len(questions)
                try:
                    questions += _generate_questions_fallback(prepared_context, missing)
                except ValueError:
                    questions += _generate_topic_questions_fallback(prepared_context or settings.get('prompt', ''), missing)
            return questions[:requested_count]

        # Dernière chance cloud avec timeout plus grand (laisser l'IA prendre son temps)
        questions_retry = AIService.generate_questions_qwen(
            prepared_context,
            settings,
            num_questions_override=requested_count,
            request_timeout=max(240, QWEN_REQUEST_TIMEOUT),
            max_retries=2,
        )
        if questions_retry:
            if len(questions_retry) < requested_count:
                missing = requested_count - len(questions_retry)
                try:
                    questions_retry += _generate_questions_fallback(prepared_context, missing)
                except ValueError:
                    questions_retry += _generate_topic_questions_fallback(prepared_context or settings.get('prompt', ''), missing)
            return questions_retry[:requested_count]

        if '_generated_metadata' not in settings:
            settings['_generated_metadata'] = {
                "titre": f"Quiz - {_extract_topic(prepared_context or settings.get('prompt', 'Document'))}",
                "description": "Généré par fallback local",
                "difficulty": settings.get('difficulty', 'Moyen')
            }

        try:
            return _generate_questions_fallback(prepared_context, requested_count)
        except ValueError:
            return _generate_topic_questions_fallback(prepared_context or settings.get('prompt', ''), requested_count)
