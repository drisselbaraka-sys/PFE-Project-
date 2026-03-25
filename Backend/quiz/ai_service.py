import json
import re
import time
from typing import List, Dict, Optional
from difflib import SequenceMatcher

import requests

from database.config import settings as app_settings

MAX_CONTEXT_CHARS = 28_000
MIN_CONTEXT_CHARS = 2_500
MIN_BATCH_SIZE = 4
MAX_COLLECTION_ROUNDS = 4

# Groq API — rapide, avec modèle principal configurable et fallback automatique
DEFAULT_GROQ_MODEL_ID = "llama-3.3-70b-versatile"
DEFAULT_GROQ_FALLBACKS = [
    "llama-3.1-8b-instant",
]
GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TIMEOUT  = 60
GROQ_MAX_TOKENS = 2200
MAX_RETRIES = 2

MODEL_TPM_LIMITS = {
    "llama-3.3-70b-versatile": 8000,
    "llama-3.1-8b-instant": 6000,
}

TOKEN_ESTIMATE_CHARS = 4
REQUEST_TOKEN_SAFETY_MARGIN = 500
MIN_OUTPUT_TOKENS = 400

def _safe_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _split_csv(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).split(',') if item.strip()]


def _get_groq_model_ids() -> List[str]:
    configured_primary = getattr(app_settings, 'GROQ_MODEL_ID', None) or DEFAULT_GROQ_MODEL_ID
    configured_fallbacks = _split_csv(getattr(app_settings, 'GROQ_MODEL_FALLBACKS', ''))

    ordered = [configured_primary, *configured_fallbacks, *DEFAULT_GROQ_FALLBACKS]
    unique = []
    seen = set()
    for model_id in ordered:
        if model_id and model_id not in seen:
            unique.append(model_id)
            seen.add(model_id)
    return unique


def _supports_strict_json_schema(model_id: str) -> bool:
    return False  # Strict schema causait des erreurs json_validate_failed, on utilise json_object


def _prepare_context(context: str, max_chars: int = MAX_CONTEXT_CHARS) -> str:
    cleaned = (context or "").replace("\x00", " ").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return cleaned[:max_chars]

    selected = []
    total = 0
    for line in lines:
        if total + len(line) + 3 > max_chars:
            break
        selected.append(line)
        total += len(line) + 3

    return "\n".join(selected)


def _strip_document_markers(context: str) -> str:
    out = []
    for line in (context or '').splitlines():
        s = line.strip()
        if s == '[DOCUMENT_CONTENT]':
            continue
        if s.startswith('--- Contenu de'):
            continue
        out.append(s)
    return '\n'.join(x for x in out if x)


GARBAGE_PHRASES = [
    "dans le contexte fourni, quelle proposition est exacte concernant",
    "ignorer les contraintes techniques",
    "éviter toute mesure de qualité",
    "remplacer l'analyse du problème",
    "cette proposition contredit",
    "le document ne fournit pas d'information",
    "cette proposition mélange plusieurs notions",
    "se fier uniquement à l'intuition",
]

NON_TECHNICAL_QUESTION_PATTERNS = [
    r"\bauteur\b",
    r"\bautrice\b",
    r"\bauthor\b",
    r"\bpubli[ée]\b",
    r"\bpublication\b",
    r"\bdate\b",
    r"\bdate de publication\b",
    r"\bemail\b",
    r"\bcontact\b",
    r"\bcopyright\b",
    r"\blicence\b",
]


def _is_non_technical_question(text: str) -> bool:
    normalized = re.sub(r"\s+", " ", (text or "")).strip().lower()
    # We ignore most non tech patterns now because they block History / Literature quizzes
    if "copyright" in normalized and "contact" in normalized:
        return True
    return False


def _resolve_answer_value(value, options: List[str]):
    if value is None:
        return None

    raw_value = str(value).strip()
    if not raw_value:
        return None

    label_map = {
        "a": 0, "b": 1, "c": 2, "d": 3,
        "1": 0, "2": 1, "3": 2, "4": 3,
    }
    normalized = raw_value.lower()
    label_match = re.fullmatch(r"(?:option\s+|réponse\s+)?([a-d]|[1-4])(?:[\)\.\:\-])?", normalized)
    if label_match:
        idx = label_map[label_match.group(1)]
        if idx < len(options):
            return options[idx]

    # Exact or prefix-stripped
    for option in options:
        option_text = str(option).strip()
        if normalized == option_text.lower():
            return option_text

        without_prefix = re.sub(r"^[A-D1-4][\)\.\:\-]\s*", "", option_text, flags=re.IGNORECASE)
        if normalized == without_prefix.strip().lower():
            return option_text

    # Fuzzy match with difflib
    option_texts = [str(o).strip() for o in options]
    import difflib
    matches = difflib.get_close_matches(raw_value, option_texts, n=1, cutoff=0.5)
    if matches:
        return matches[0]

    # Substring match
    for option in options:
        opt_str = str(option).strip()
        if len(raw_value) > 2 and (raw_value.lower() in opt_str.lower() or opt_str.lower() in raw_value.lower()):
            return opt_str

    return raw_value


def _normalize_true_false_value(value):
    if value is None:
        return None

    normalized = str(value).strip().lower()
    if normalized in {"vrai", "true", "1", "oui"}:
        return "Vrai"
    if normalized in {"faux", "false", "0", "non"}:
        return "Faux"
    return None


def _normalize_question_payload(q: Dict) -> Dict:
    normalized = dict(q)
    # Extract options and deduplicate while preserving order
    raw_options = [str(option).strip() for option in normalized.get("options_reponses", []) if str(option).strip()]
    options = []
    for opt in raw_options:
        if opt and not any(opt.lower() == existing.lower() for existing in options):
            options.append(opt)
    normalized["options_reponses"] = options

    correct = normalized.get("reponse_correcte")
    if isinstance(correct, str):
        # Try resolving the entire string first (fixes issue where correct answer has commas)
        resolved_full = _resolve_answer_value(correct, options)
        # If it exactly matches an option, keep it as a string
        if resolved_full in options:
            normalized["reponse_correcte"] = resolved_full
        else:
            # Fallback to splitting for Multiple choice formats like "A, B"
            raw_parts = [part.strip() for part in re.split(r",|;|\set\s", correct) if part.strip()]
            if len(raw_parts) > 1:
                normalized["reponse_correcte"] = [
                    resolved for resolved in (_resolve_answer_value(part, options) for part in raw_parts)
                    if resolved in options
                ]
            else:
                normalized["reponse_correcte"] = resolved_full
    elif isinstance(correct, list):
        normalized["reponse_correcte"] = [
            resolved for resolved in (_resolve_answer_value(item, options) for item in correct)
            if resolved
        ]

    return normalized


def _question_signature(q: Dict) -> str:
    text = str(q.get("texte_question", "")).strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


STOPWORDS_MULTI_LANG = {
    "le", "la", "les", "de", "des", "du", "dans", "sur", "pour", "avec", "et", "ou", "en", "un", "une", "au",
    "quel", "quelle", "quels", "quelles", "est", "sont", "role", "rôle", "fonction", "comment", "pourquoi", "quand",
    "the", "a", "an", "of", "to", "in", "on", "for", "is", "are", "what", "which", "who", "does", "do",
    "و", "في", "من", "على", "ما", "ماذا", "كيف", "لماذا", "هو", "هي", "هذا", "هذه"
}


def _normalize_text_for_similarity(text: str) -> str:
    normalized = re.sub(r"[^\w\sÀ-ÿ\u0600-\u06FF]", " ", (text or "").lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _question_stem(text: str, max_tokens: int = 8) -> str:
    normalized = _normalize_text_for_similarity(text)
    tokens = [tok for tok in normalized.split() if tok and tok not in STOPWORDS_MULTI_LANG]
    if not tokens:
        tokens = normalized.split()
    return " ".join(tokens[:max_tokens])


def _is_similar_question_text(candidate: str, existing: str) -> bool:
    candidate_norm = _normalize_text_for_similarity(candidate)
    existing_norm = _normalize_text_for_similarity(existing)
    if not candidate_norm or not existing_norm:
        return False

    if candidate_norm == existing_norm:
        return True

    candidate_stem = _question_stem(candidate_norm)
    existing_stem = _question_stem(existing_norm)
    if candidate_stem and candidate_stem == existing_stem:
        return True

    if candidate_stem and existing_stem and (candidate_stem.startswith(existing_stem) or existing_stem.startswith(candidate_stem)):
        if min(len(candidate_stem), len(existing_stem)) >= 18:
            return True

    ratio = SequenceMatcher(None, candidate_norm, existing_norm).ratio()
    if ratio >= 0.9:
        return True

    return False


def _dedupe_questions(questions: List[Dict]) -> List[Dict]:
    unique = []
    seen_signatures = set()
    seen_texts = []
    for question in questions:
        signature = _question_signature(question)
        if not signature or signature in seen_signatures:
            continue
        if any(_is_similar_question_text(signature, existing) for existing in seen_texts):
            continue
        seen_signatures.add(signature)
        seen_texts.append(signature)
        unique.append(question)
    return unique


def _estimate_tokens(text: str) -> int:
    return max(1, (len(text or "") + TOKEN_ESTIMATE_CHARS - 1) // TOKEN_ESTIMATE_CHARS)


def _get_model_tpm_limit(model_id: str) -> int:
    return MODEL_TPM_LIMITS.get(model_id, 6000)


def _get_num_to_generate(requested_count: int, question_type: str) -> int:
    batch_size = max(MIN_BATCH_SIZE, requested_count)
    if question_type == "Vrai ou Faux":
        extra = 1
    else:
        extra = 2
    return min(30, batch_size + extra)


def _get_target_output_tokens(num_to_generate: int, question_type: str) -> int:
    if question_type == "Vrai ou Faux":
        per_question = 95
    elif question_type == "Plusieurs Réponses":
        per_question = 120
    elif question_type == "Mélangé":
        per_question = 105
    else:
        per_question = 95

    estimated = 180 + (num_to_generate * per_question)
    return max(MIN_OUTPUT_TOKENS, min(GROQ_MAX_TOKENS, estimated))


def _get_context_budget_chars(model_id: str, system_prompt: str, user_template: str, max_output_tokens: int) -> int:
    model_budget = _get_model_tpm_limit(model_id)
    static_tokens = _estimate_tokens(system_prompt) + _estimate_tokens(user_template.replace("{context}", ""))
    available_context_tokens = model_budget - static_tokens - max_output_tokens - REQUEST_TOKEN_SAFETY_MARGIN
    available_context_chars = max(MIN_CONTEXT_CHARS, available_context_tokens * TOKEN_ESTIMATE_CHARS)
    return min(MAX_CONTEXT_CHARS, available_context_chars)


def _is_valid_question(q: Dict, expected_type: str = "any") -> bool:
    if not isinstance(q, dict):
        print("[- REJECT] Pas un dict:", type(q))
        return False
    for field in ["texte_question", "type_question", "options_reponses", "reponse_correcte"]:
        if not q.get(field):
            print(f"[- REJECT] Champ manquant ou vide: {field} -> {q.get(field)}")
            return False

    q_text  = q.get("texte_question", "").strip()
    options = q.get("options_reponses", [])
    correct = q.get("reponse_correcte")

    if len(q_text) < 10:
        print("[- REJECT] Texte très court:", q_text)
        return False
    if _is_non_technical_question(q_text):
        print("[- REJECT] Question perçue comme non-technique:", q_text)
        return False
    if not isinstance(options, list) or len(options) < 2:
        print("[- REJECT] Options manquantes ou insuffisantes:", options)
        return False

    # All options must be DISTINCT
    opts_norm = [str(o).strip().lower() for o in options]
    if len(set(opts_norm)) < len(opts_norm):
        print("[- REJECT] Options non distinctes:", options)
        return False

    # Correct answer must exist in options
    if isinstance(correct, list):
        for c in correct:
            if str(c).strip().lower() not in opts_norm:
                print("[- REJECT] Liste Réponse correcte introuvable parmis options:", c, "OPTIONS:", options)
                return False
    else:
        if str(correct).strip().lower() not in opts_norm:
            print("[- REJECT] Réponse correcte introuvable parmis options:", correct, "OPTIONS:", options)
            return False

    # Type checks
    q_type = q.get("type_question")
    if expected_type == "Vrai ou Faux" or q_type == "Vrai/Faux":
        if set(opts_norm) != {"vrai", "faux"}:
            print("[- REJECT] Options Vrai/Faux invalides:", options)
            return False
        if str(correct).strip().lower() not in ("vrai", "faux"):
            print("[- REJECT] Reponse Vrai/Faux invalide:", correct)
            return False
    elif expected_type == "Plusieurs Réponses" or q_type == "Multiple":
        if not isinstance(correct, list):
            q["reponse_correcte"] = [correct] # Auto fix if single
        elif len(correct) == 0:
            print("[- REJECT] Reponse Multiple vide:", correct)
            return False
    elif expected_type == "Mélangé":
        if q_type == "Vrai/Faux":
            if set(opts_norm) != {"vrai", "faux"}:
                print("[- REJECT] Mélangé/Vrai-Faux invalide:", options)
                return False
            if str(correct).strip().lower() not in ("vrai", "faux"):
                print("[- REJECT] Mélangé/Vrai-Faux réponse invalide:", correct)
                return False
        elif q_type == "Multiple":
            if not isinstance(correct, list) or len(correct) < 2:
                print("[- REJECT] Mélangé/Multiple doit avoir au moins 2 bonnes réponses:", correct)
                return False
        elif q_type == "MCQ":
            if isinstance(correct, list):
                print("[- REJECT] Mélangé/MCQ ne doit pas avoir une liste de réponses:", correct)
                return False
            if len(options) < 2 or len(options) > 5:
                print("[- REJECT] Mélangé/MCQ nombre options hors 2-5:", options)
                return False
        else:
            print("[- REJECT] Type question inconnu en mode mélangé:", q_type)
            return False
    elif expected_type in ("QCM", "any") or q_type == "MCQ":
        # Allow 2 to 5 options for robustness with smaller models
        if len(options) < 2 or len(options) > 5:
            print("[- REJECT] Nombre d'options QCM hors 2-5:", options)
            return False

    # No garbage
    combined = (q_text + str(correct)).lower()
    if any(g in combined for g in GARBAGE_PHRASES):
        print("[- REJECT] Phrase interdite detectee:", combined)
        return False
    for opt in options:
        if any(g in str(opt).lower() for g in GARBAGE_PHRASES):
            print("[- REJECT] Phrase interdite detectee dans option:", opt)
            return False

    return True


def _fix_question_type(q: Dict, expected_type: str) -> Dict:
    q = _normalize_question_payload(q)
    options = q.get("options_reponses", [])
    correct = q.get("reponse_correcte")
    if expected_type == "Vrai ou Faux":
        q["type_question"] = "Vrai/Faux"
        normalized_options = [_normalize_true_false_value(option) for option in options]
        if len(normalized_options) == 2 and set(normalized_options) == {"Vrai", "Faux"}:
            q["options_reponses"] = ["Vrai", "Faux"]
        normalized_correct = _normalize_true_false_value(correct)
        if normalized_correct:
            q["reponse_correcte"] = normalized_correct
    elif expected_type == "Plusieurs Réponses":
        q["type_question"] = "Multiple"
        if isinstance(correct, str) and correct in [str(o) for o in options]:
            q["reponse_correcte"] = [correct]
    elif expected_type == "QCM":
        q["type_question"] = "MCQ"
    else:
        # For Mélangé or Any, keep AI type if valid, otherwise infer from payload
        ai_type = q.get("type_question")
        if ai_type not in ["Vrai/Faux", "Multiple", "MCQ"]:
            normalized_options = [_normalize_true_false_value(option) for option in options]
            normalized_correct = _normalize_true_false_value(correct)

            if len(normalized_options) == 2 and set(normalized_options) == {"Vrai", "Faux"} and normalized_correct:
                q["type_question"] = "Vrai/Faux"
                q["options_reponses"] = ["Vrai", "Faux"]
                q["reponse_correcte"] = normalized_correct
            elif isinstance(correct, list) and len(correct) >= 2:
                q["type_question"] = "Multiple"
            else:
                q["type_question"] = "MCQ"
        
    if isinstance(q.get("options_reponses"), list):
        import random
        random.shuffle(q["options_reponses"])
        
    return q


def _build_prompt(settings: Dict, num_to_generate: int, existing_questions: Optional[List[str]] = None) -> tuple:
    difficulty = settings.get('difficulty', 'Moyen')
    language   = settings.get('language', 'Français')
    q_type     = settings.get('question_type', 'QCM')
    tone       = settings.get('tone', 'Académique')
    existing_questions = existing_questions or []

    extras = ""
    if settings.get('titre', '').strip():
        extras += f"\nSujet : {settings['titre']}"
    if settings.get('description', '').strip():
        extras += f"\nContexte : {settings['description']}"

    if q_type == "Vrai ou Faux":
        type_rule = (
            'Toutes les questions sont de type Vrai/Faux avec options_reponses=["Vrai","Faux"].'
        )
    elif q_type == "Plusieurs Réponses":
        type_rule = (
            'RÈGLES CRITIQUES POUR "Plusieurs Réponses" :\n'
            '- Chaque question DOIT avoir entre 2 et 4 réponses correctes dans le tableau `reponse_correcte`.\n'
            '- Ne génère JAMAIS une seule réponse correcte pour ce mode.\n'
            '- Les options_reponses doivent être des concepts simples ou des mots-clés distincts. \n'
            '- INTERDICTION de combiner des choix (ex: ne dis pas "A et B" ou "Toutes les réponses").\n'
            '- INTERDICTION d\'utiliser le mot "seulement" / "uniquement" / "فقط" pour créer des fausses réponses. Les distracteurs doivent être des concepts réellement distincts et erronés.'
        )
    elif q_type == "Mélangé":
        min_multi = 1 if num_to_generate >= 2 else 0
        min_vf = 1 if num_to_generate >= 3 else 0
        type_rule = (
            'RÈGLES CRITIQUES POUR "Mélangé" :\n'
            '- Utilise obligatoirement plusieurs types parmi: MCQ, Multiple, Vrai/Faux.\n'
            f'- Minimum requis dans ce lot: {min_multi} question(s) de type "Multiple" et {min_vf} question(s) de type "Vrai/Faux".\n'
            '- Pour type_question="Multiple": reponse_correcte DOIT être un tableau avec au moins 2 bonnes réponses.\n'
            '- Pour type_question="Vrai/Faux": options_reponses DOIT être exactement ["Vrai", "Faux"] et reponse_correcte est "Vrai" ou "Faux".\n'
            '- Pour type_question="MCQ": reponse_correcte DOIT être une seule chaîne (pas un tableau).\n'
            '- Ne transforme jamais une question Multiple en MCQ.'
        )
    else:
        type_rule = (
            'Toutes les questions sont des QCM avec exactement 4 options distinctes et une seule bonne réponse.'
        )

    difficulty_profiles = {
        "Débutant": (
            "Questions de compréhension de base: définitions, identification, rappel direct. "
            "Une seule idée centrale par question, formulation claire, pièges limités."
        ),
        "Moyen": (
            "Questions d'application et de comparaison: relier concepts, interpréter un cas simple, "
            "distinguer des notions proches avec distracteurs plausibles."
        ),
        "Expert": (
            "Questions d'analyse avancée: cas limites, conditions d'échec, arbitrages, impacts techniques. "
            "Distracteurs très plausibles, nécessitant raisonnement multi-étapes."
        ),
    }
    difficulty_rule = difficulty_profiles.get(
        difficulty,
        "Respecte strictement le niveau demandé avec une complexité cohérente des questions et distracteurs."
    )

    existing_questions_block = ""
    if existing_questions:
        sanitized_existing = [re.sub(r"\s+", " ", str(item)).strip() for item in existing_questions if str(item).strip()]
        if sanitized_existing:
            existing_questions_block = (
                "\nQUESTIONS DÉJÀ GÉNÉRÉES (INTERDICTION DE LES REFORMULER):\n- "
                + "\n- ".join(sanitized_existing[:20])
            )

    json_example_reponse = "..."
    json_example_questions = '''[
    {
        "texte_question": "...",
        "type_question": "MCQ",
        "options_reponses": ["...", "...", "...", "..."],
        "reponse_correcte": "...",
        "explication": "...",
        "points": 1
    }
]'''
    if q_type == "Plusieurs Réponses":
        json_example_reponse = '["...", "..."]'
        json_example_questions = '''[
    {
        "texte_question": "...",
        "type_question": "Multiple",
        "options_reponses": ["...", "...", "...", "..."],
        "reponse_correcte": ["...", "..."],
        "explication": "...",
        "points": 1
    }
]'''
    elif q_type == "Mélangé":
                json_example_questions = '''[
        {
            "texte_question": "...",
            "type_question": "MCQ",
            "options_reponses": ["...", "...", "...", "..."],
            "reponse_correcte": "...",
            "explication": "...",
            "points": 1
        },
        {
            "texte_question": "...",
            "type_question": "Multiple",
            "options_reponses": ["...", "...", "...", "..."],
            "reponse_correcte": ["...", "..."],
            "explication": "...",
            "points": 1
        },
        {
            "texte_question": "...",
            "type_question": "Vrai/Faux",
            "options_reponses": ["Vrai", "Faux"],
            "reponse_correcte": "Vrai",
            "explication": "...",
            "points": 1
        }
    ]'''
    
    system = f"""Tu es un expert en création de quiz pédagogique. Tu dois IMPÉRATIVEMENT générer le quiz UNIQUEMENT et STRICTEMENT dans la langue suivante : {language}. {extras}
Niveau de difficulté: {difficulty}. Ton/Style: {tone}.

Génère exactement {num_to_generate} questions basées uniquement sur le contenu fourni.
{type_rule}

INSTRUCTION DE LANGUE CRITIQUE : 
Les champs "titre", "description", "texte_question", "options_reponses", "reponse_correcte" et "explication" DOIVENT ÊTRE RÉDIGÉS ENTIÈREMENT ET STRICTEMENT EN {language}. 
INTERDICTION ABSOLUE DE MÉLANGER LES LANGUES. Si tu génères en Arabe par exemple, tu dois TOUT traduire en Arabe, il ne DOIT Y AVOIR AUCUN mot en Français (comme "nombre de", "le", "la") ou en Anglais dans les phrases, tu dois tout traduire de manière native (ex: utiliser "عدد" plutôt que "nombre de", "في" plutôt que "dans"). TOUTE LA GÉNÉRATION DES VALEURS DOIT ÊTRE 100% EN {language}, indifféremment de la langue du contenu source.
Les questions doivent être courtes, précises, non répétitives et ancrées dans des faits concrets du document.
RÈGLES DE DIVERSITÉ OBLIGATOIRES:
- N'utilise pas plus de 1 fois la même amorce (ex: "Quel est le rôle de...").
- Varie les formulations (définition, comparaison, cause/conséquence, scénario, diagnostic, erreur fréquente, exception).
- Chaque question doit tester une compétence différente ou un angle différent du sujet.
- Interdiction des paraphrases proches entre questions.

ADAPTATION STRICTE À LA DIFFICULTÉ ({difficulty}):
{difficulty_rule}

Ignore toujours les métadonnées non techniques: auteur, date de publication, copyright, contact, licence, établissement, page de garde.
L'explication doit contenir un maximum d'informations et faire un résumé pertinent justifiant la réponse (2 ou 3 phrases).
Important: "reponse_correcte" DOIT contenir le(s) texte(s) EXACT(s) de la / des bonne(s) option(s) (pas la lettre A, B, C ou D).

Formate la réponse EXACTEMENT comme ce JSON (sans markdown - les clés restent en français mais les VALEURS doivent être en {language}):
{{
  "titre": "...",
  "description": "...",
    "questions": {json_example_questions}
}}"""

    user_msg = (
        f"Contenu source résumé :\n{{context}}\n\n"
        f"{existing_questions_block}\n\n"
        f"Retourne uniquement l'objet JSON demandé."
    )
    return system, user_msg


def _build_question_schema(question_type: str) -> Dict:
    if question_type == "Vrai ou Faux":
        return {
            "type": "object",
            "properties": {
                "texte_question": {"type": "string"},
                "type_question": {"type": "string", "enum": ["Vrai/Faux"]},
                "options_reponses": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["Vrai", "Faux"]},
                    "minItems": 2,
                    "maxItems": 2
                },
                "reponse_correcte": {"type": "string", "enum": ["Vrai", "Faux"]},
                "explication": {"type": "string"},
                "points": {"type": "integer"}
            },
            "required": [
                "texte_question",
                "type_question",
                "options_reponses",
                "reponse_correcte",
                "explication",
                "points"
            ],
            "additionalProperties": False
        }
        
    if question_type == "Plusieurs Réponses":
        return {
            "type": "object",
            "properties": {
                "texte_question": {"type": "string"},
                "type_question": {"type": "string", "enum": ["Multiple"]},
                "options_reponses": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "reponse_correcte": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 2
                },
                "explication": {"type": "string"},
                "points": {"type": "integer"}
            },
            "required": [
                "texte_question",
                "type_question",
                "options_reponses",
                "reponse_correcte",
                "explication",
                "points"
            ],
            "additionalProperties": False
        }

    if question_type == "Mélangé":
        return {
            "oneOf": [
                {
                    "type": "object",
                    "properties": {
                        "texte_question": {"type": "string"},
                        "type_question": {"type": "string", "enum": ["MCQ"]},
                        "options_reponses": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 2,
                            "maxItems": 5
                        },
                        "reponse_correcte": {"type": "string"},
                        "explication": {"type": "string"},
                        "points": {"type": "integer"}
                    },
                    "required": [
                        "texte_question",
                        "type_question",
                        "options_reponses",
                        "reponse_correcte",
                        "explication",
                        "points"
                    ],
                    "additionalProperties": False
                },
                {
                    "type": "object",
                    "properties": {
                        "texte_question": {"type": "string"},
                        "type_question": {"type": "string", "enum": ["Multiple"]},
                        "options_reponses": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 2,
                            "maxItems": 5
                        },
                        "reponse_correcte": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 2
                        },
                        "explication": {"type": "string"},
                        "points": {"type": "integer"}
                    },
                    "required": [
                        "texte_question",
                        "type_question",
                        "options_reponses",
                        "reponse_correcte",
                        "explication",
                        "points"
                    ],
                    "additionalProperties": False
                },
                {
                    "type": "object",
                    "properties": {
                        "texte_question": {"type": "string"},
                        "type_question": {"type": "string", "enum": ["Vrai/Faux"]},
                        "options_reponses": {
                            "type": "array",
                            "items": {"type": "string", "enum": ["Vrai", "Faux"]},
                            "minItems": 2,
                            "maxItems": 2
                        },
                        "reponse_correcte": {"type": "string", "enum": ["Vrai", "Faux"]},
                        "explication": {"type": "string"},
                        "points": {"type": "integer"}
                    },
                    "required": [
                        "texte_question",
                        "type_question",
                        "options_reponses",
                        "reponse_correcte",
                        "explication",
                        "points"
                    ],
                    "additionalProperties": False
                }
            ]
        }

    return {
        "type": "object",
        "properties": {
            "texte_question": {"type": "string"},
            "type_question": {"type": "string"},
            "options_reponses": {
                "type": "array",
                "items": {"type": "string"}
            },
            "reponse_correcte": {
                "anyOf": [
                    {"type": "string"},
                    {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                ]
            },
            "explication": {"type": "string"},
            "points": {"type": "integer"}
        },
        "required": [
            "texte_question",
            "type_question",
            "options_reponses",
            "reponse_correcte",
            "explication",
            "points"
        ],
        "additionalProperties": False
    }


def _build_response_format(model_id: str, question_type: str) -> Optional[Dict]:
    question_schema = _build_question_schema(question_type)

    if _supports_strict_json_schema(model_id):
        return {
            "type": "json_schema",
            "json_schema": {
                "name": "quiz_generation",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "titre": {"type": "string"},
                        "description": {"type": "string"},
                        "questions": {
                            "type": "array",
                            "items": question_schema
                        }
                    },
                    "required": ["titre", "description", "questions"],
                    "additionalProperties": False
                }
            }
        }

    return {"type": "json_object"}


def _extract_valid_questions(result: Dict, question_type: str) -> List[Dict]:
    valid = []
    for question in result.get("questions", []):
        fixed_question = _fix_question_type(question, question_type)
        if _is_valid_question(fixed_question, question_type):
            valid.append(fixed_question)
    return _dedupe_questions(valid)


def _make_post(url: str, headers: dict, payload: dict, timeout: float):
    return requests.post(url, headers=headers, json=payload, timeout=timeout)


def _parse_json_response(raw: str) -> Optional[Dict]:
    if not raw:
        return None
    content = raw.strip()
    if "```json" in content:
        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in content:
        parts = content.split("```")
        if len(parts) >= 3:
            content = parts[1].strip()
    try:
        result = json.loads(content)
        if isinstance(result, dict) and "questions" in result:
            return result
    except json.JSONDecodeError:
        pass
    m = re.search(r'\{[\s\S]*"questions"[\s\S]*\}', content)
    if m:
        try:
            result = json.loads(m.group(0))
            if isinstance(result, dict) and "questions" in result:
                return result
        except Exception:
            pass
    try:
        last = content.rfind('}]')
        if last > 0:
            result = json.loads(content[:last + 2] + '}')
            if isinstance(result, dict) and "questions" in result:
                return result
    except Exception:
        pass
    return None


def _call_groq(context: str, settings: Dict, requested_count: int) -> Optional[Dict]:
    groq_key = getattr(app_settings, 'GROQ_API_KEY', None)
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY manquant dans la configuration.")

    q_type = settings.get('question_type', 'QCM')
    headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
    last_error = None
    model_ids = _get_groq_model_ids()
    collected_questions: List[Dict] = []
    final_meta = {
        "titre": "Quiz généré",
        "description": "",
        "difficulty": settings.get('difficulty', 'Moyen'),
    }

    rounds = 0
    while len(collected_questions) < requested_count and rounds < MAX_COLLECTION_ROUNDS:
        rounds += 1
        remaining_count = requested_count - len(collected_questions)
        num_to_generate = _get_num_to_generate(remaining_count, q_type)
        batch_settings = {**settings, "num_questions": num_to_generate}
        existing_for_prompt = [q.get("texte_question", "") for q in collected_questions if q.get("texte_question")]
        system_prompt, user_template = _build_prompt(batch_settings, num_to_generate, existing_for_prompt)
        batch_progress_made = False

        for model_index, model_id in enumerate(model_ids):
            max_output_tokens = _get_target_output_tokens(num_to_generate, q_type)
            context_budget_chars = _get_context_budget_chars(model_id, system_prompt, user_template, max_output_tokens)

            for attempt in range(MAX_RETRIES):
                try:
                    trimmed_context = _prepare_context(context, context_budget_chars)
                    user_content = user_template.replace("{context}", trimmed_context)
                    payload = {
                        "model": model_id,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user",   "content": user_content},
                        ],
                        "max_tokens": max_output_tokens,
                        "temperature": 0.2,
                    }
                    response_format = _build_response_format(model_id, q_type)
                    if response_format:
                        payload["response_format"] = response_format

                    print(f"[Groq:{model_id}] Tentative {attempt + 1}/{MAX_RETRIES}...")
                    print(
                        f"[Groq:{model_id}] Manquantes={remaining_count} | "
                        f"Budget contexte={len(trimmed_context)} chars | max_tokens={max_output_tokens}"
                    )
                    t0      = time.time()
                    resp    = _make_post(GROQ_API_URL, headers, payload, GROQ_TIMEOUT)
                    elapsed = round(time.time() - t0, 1)

                    if resp.status_code == 401:
                        raise RuntimeError("GROQ_API_KEY invalide (401 Unauthorized).")
                    if resp.status_code == 403:
                        raise RuntimeError("Accès refusé (403 Forbidden).")
                    if resp.status_code == 429:
                        last_error = f"Rate limit sur {model_id}"
                        if model_index < len(model_ids) - 1:
                            print(f"[Groq] Rate limit sur {model_id}, bascule immédiate...")
                            break
                        wait = min(4.0, 2.0 * (attempt + 1))
                        print(f"[Groq] Rate limit sur {model_id}, attente {wait}s...")
                        time.sleep(wait)
                        continue
                    if resp.status_code == 413:
                        last_error = f"Requête trop volumineuse pour {model_id}"
                        context_budget_chars = max(MIN_CONTEXT_CHARS, int(context_budget_chars * 0.75))
                        max_output_tokens = max(MIN_OUTPUT_TOKENS, int(max_output_tokens * 0.75))
                        print(
                            f"[Groq] 413 sur {model_id}, réduction du budget à "
                            f"{context_budget_chars} chars et {max_output_tokens} tokens..."
                        )
                        continue
                    if resp.status_code in (500, 502, 503, 504):
                        print(f"[Groq] Erreur serveur {resp.status_code} sur {model_id}, retry...")
                        time.sleep(3.0 * (attempt + 1))
                        continue
                    if resp.status_code != 200:
                        last_error = f"Erreur HTTP {resp.status_code} ({model_id}): {resp.text[:200]}"
                        print(f"[Groq] {last_error}")
                        continue

                    try:
                        data = resp.json()
                        raw_content = data["choices"][0]["message"]["content"]
                    except Exception:
                        raw_content = resp.text

                    result = _parse_json_response(raw_content)
                    if not result:
                        print(f"[Groq] Réponse non-JSON avec {model_id}, bascule...")
                        last_error = f"Réponse non parsable avec {model_id}"
                        break

                    valid = _extract_valid_questions(result, q_type)
                    rejected = len(result.get("questions", [])) - len(valid)
                    if rejected:
                        print(f"[Groq] {rejected} rejetées sur {len(result.get('questions', []))} avec {model_id}")

                    if valid:
                        previous_count = len(collected_questions)
                        collected_questions = _dedupe_questions(collected_questions + valid)
                        added_count = len(collected_questions) - previous_count
                        if added_count > 0:
                            batch_progress_made = True
                            final_meta = {
                                "titre": result.get("titre", final_meta["titre"]),
                                "description": result.get("description", final_meta["description"]),
                                "difficulty": settings.get('difficulty', 'Moyen'),
                            }
                            print(
                                f"[Groq] +{added_count} questions valides avec {model_id} "
                                f"en {elapsed}s | total={len(collected_questions)}/{requested_count}"
                            )
                            if len(collected_questions) >= requested_count:
                                return {
                                    "questions": collected_questions[:requested_count],
                                    "meta": final_meta,
                                    "model": model_id,
                                    "elapsed": elapsed,
                                }

                    print(
                        f"[Groq] Insuffisant avec {model_id}: +{len(valid)} valides | "
                        f"total={len(collected_questions)}/{requested_count}"
                    )
                    last_error = f"Seulement {len(collected_questions)}/{requested_count} questions collectées"
                    break

                except RuntimeError:
                    raise
                except Exception as e:
                    err_str = str(e).lower()
                    if any(x in err_str for x in ("timeout", "timed out", "read timeout")):
                        print(f"[Groq] Timeout avec {model_id} (tentative {attempt + 1})")
                        last_error = f"Timeout avec {model_id}"
                    else:
                        print(f"[Groq] {type(e).__name__} sur {model_id}: {str(e)[:200]}")
                        last_error = str(e)
                    time.sleep(1.5 * (attempt + 1))

            if last_error:
                print(f"[Groq] Échec du modèle {model_id}: {last_error}")

        if not batch_progress_made:
            break

    if collected_questions:
        print(f"[Groq] Génération partielle acceptée: {len(collected_questions)}/{requested_count}")
        return {
            "questions": collected_questions,
            "meta": final_meta,
            "model": "partial_generation",
            "elapsed": 0.0,
        }

    raise RuntimeError(last_error or "Aucun modèle Groq n'a pu générer un quiz valide.")


class AIService:

    @staticmethod
    def translate_manual_quiz(quiz_payload: Dict, target_language: str) -> Dict:
        language = (target_language or "").strip() or "Français"
        language_normalized = language.lower()
        if language_normalized in {"fr", "français", "francais", "french"}:
            return {
                "titre": quiz_payload.get("titre", "") or "",
                "description": quiz_payload.get("description", "") or "",
                "questions": quiz_payload.get("questions", []) or [],
            }

        groq_key = getattr(app_settings, 'GROQ_API_KEY', None)
        if not groq_key:
            raise RuntimeError("GROQ_API_KEY manquant dans la configuration.")

        source_questions = quiz_payload.get("questions", []) or []
        source_pack = {
            "titre": quiz_payload.get("titre", "") or "",
            "description": quiz_payload.get("description", "") or "",
            "questions": source_questions,
        }

        system_prompt = f"""Tu es un traducteur expert de quiz pédagogiques.
Traduis STRICTEMENT le quiz fourni en {language}.
Contraintes obligatoires:
- Ne change jamais la structure JSON, ni l'ordre des questions.
- Conserve exactement le même nombre de questions.
- Conserve exactement le même nombre d'options par question.
- Ne modifie jamais les champs structurels: type_question, points, temps_suggere_secondes.
- Traduis seulement les textes: titre, description, texte_question, options_reponses, reponse_correcte, explication.
- La reponse_correcte doit correspondre exactement au texte traduit des bonnes options.
- Réponds uniquement avec un objet JSON valide, sans markdown.
"""

        user_prompt = (
            f"Traduire ce quiz en {language}.\n"
            f"JSON source:\n{json.dumps(source_pack, ensure_ascii=False)}"
        )

        headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
        model_ids = _get_groq_model_ids()
        parsed_result = None
        last_error = None

        for model_id in model_ids:
            for attempt in range(MAX_RETRIES):
                try:
                    payload = {
                        "model": model_id,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": min(GROQ_MAX_TOKENS, 1800),
                        "response_format": {"type": "json_object"},
                    }

                    resp = _make_post(GROQ_API_URL, headers, payload, GROQ_TIMEOUT)
                    if resp.status_code == 429:
                        last_error = f"Rate limit sur {model_id}"
                        time.sleep(1.2 * (attempt + 1))
                        continue
                    if resp.status_code != 200:
                        last_error = f"Erreur HTTP {resp.status_code} ({model_id}): {resp.text[:200]}"
                        continue

                    try:
                        raw_content = resp.json()["choices"][0]["message"]["content"]
                    except Exception:
                        raw_content = resp.text

                    parsed_result = _parse_json_response(raw_content)
                    if parsed_result and isinstance(parsed_result.get("questions"), list):
                        break

                    last_error = f"Réponse non parsable avec {model_id}"
                except Exception as e:
                    last_error = str(e)
            if parsed_result:
                break

        if not parsed_result:
            raise RuntimeError(last_error or "Échec de traduction du quiz.")

        translated_questions = parsed_result.get("questions", []) or []

        def _extract_correct_indexes(source_q: Dict) -> List[int]:
            source_opts = [str(opt) for opt in source_q.get("options_reponses", [])]
            source_correct = source_q.get("reponse_correcte")
            indexes: List[int] = []

            if isinstance(source_correct, list):
                for item in source_correct:
                    item_s = str(item).strip().lower()
                    for i, opt in enumerate(source_opts):
                        if str(opt).strip().lower() == item_s:
                            indexes.append(i)
                            break
            else:
                item_s = str(source_correct or "").strip().lower()
                for i, opt in enumerate(source_opts):
                    if str(opt).strip().lower() == item_s:
                        indexes.append(i)
                        break

            seen = set()
            uniq = []
            for idx in indexes:
                if idx not in seen:
                    uniq.append(idx)
                    seen.add(idx)
            return uniq

        normalized_questions = []
        for i, source_q in enumerate(source_questions):
            translated_q = translated_questions[i] if i < len(translated_questions) else {}

            source_options = [str(opt) for opt in source_q.get("options_reponses", [])]
            target_options = translated_q.get("options_reponses", []) if isinstance(translated_q.get("options_reponses"), list) else []
            target_options = [str(opt) for opt in target_options]

            if len(target_options) < len(source_options):
                target_options += source_options[len(target_options):]
            elif len(target_options) > len(source_options):
                target_options = target_options[:len(source_options)]

            correct_indexes = _extract_correct_indexes(source_q)
            if len(correct_indexes) > 1:
                mapped_correct = [target_options[idx] for idx in correct_indexes if 0 <= idx < len(target_options)]
            elif len(correct_indexes) == 1:
                idx_correct = correct_indexes[0]
                mapped_correct = target_options[idx_correct] if 0 <= idx_correct < len(target_options) else ""
            else:
                candidate = translated_q.get("reponse_correcte", "")
                mapped_correct = candidate if (isinstance(candidate, str) and candidate in target_options) else ""

            normalized_questions.append({
                "texte_question": translated_q.get("texte_question") or source_q.get("texte_question", ""),
                "type_question": source_q.get("type_question", translated_q.get("type_question", "MCQ")),
                "options_reponses": target_options,
                "reponse_correcte": mapped_correct,
                "explication": translated_q.get("explication") or source_q.get("explication", ""),
                "points": source_q.get("points", translated_q.get("points", 1)),
                "temps_suggere_secondes": source_q.get("temps_suggere_secondes", translated_q.get("temps_suggere_secondes", 30)),
            })

        return {
            "titre": parsed_result.get("titre", source_pack["titre"]),
            "description": parsed_result.get("description", source_pack["description"]),
            "questions": normalized_questions,
        }

    @staticmethod
    def generate_questions(context: str, settings: Dict) -> List[Dict]:
        requested_count = _safe_int(settings.get('num_questions', 10), 10)
        requested_count = max(1, min(requested_count, 30))
        settings['num_questions'] = requested_count

        if not getattr(app_settings, 'GROQ_API_KEY', None):
            raise RuntimeError("GROQ_API_KEY manquant dans la configuration.")

        prepared_context = _prepare_context(_strip_document_markers(context))
        q_type = settings.get('question_type', 'QCM')

        print(
            f"\n[AIService] {requested_count} questions | type={q_type} | "
            f"modèles={', '.join(_get_groq_model_ids())}"
        )
        t_global = time.time()

        result = _call_groq(prepared_context, settings, requested_count)

        total = round(time.time() - t_global, 1)

        questions = result["questions"]
        settings['_generated_metadata'] = result["meta"]

        final = questions[:requested_count]
        print(f"[AIService] ✓ {len(final)}/{requested_count} | {result['model']} | {total}s")
        return final

    @staticmethod
    def generate_questions_qwen(
        context: str, settings: Dict,
        num_questions_override: Optional[int] = None,
        request_timeout: int = 90, max_retries: int = 2,
    ) -> Optional[List[Dict]]:
        if num_questions_override:
            settings = {**settings, 'num_questions': num_questions_override}
        try:
            return AIService.generate_questions(context, settings)
        except Exception as e:
            print(f"[AIService] Erreur: {e}")
            return None



