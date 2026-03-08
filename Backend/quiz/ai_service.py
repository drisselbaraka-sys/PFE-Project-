import os
import json
import re
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
from typing import List, Dict
from database.config import settings as app_settings

# Model Configuration - T5 REMOVED to prioritize Qwen Cloud


def _generate_questions_fallback(context: str, num_questions: int) -> List[Dict]:
    """Fallback: Genere des questions par extraction si Qwen echoue."""
    sentences = re.split(r'[.!?]+', context)
    # Filtrer les phrases trop courtes ou qui ressemblent à de la metadata
    # Relaxed constraints: len > 20 is enough to form a question
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20 and "http" not in s and "www" not in s]
    
    if not sentences:
        # Final safety net: if no long sentences, just take any non-empty
        sentences = [s.strip() for s in re.split(r'[.!?]+', context) if len(s.strip()) > 0]
        if not sentences:
            raise ValueError("Contenu insuffisant pour generer des questions")
    
    questions = []
    # Essayer de prendre des phrases au milieu du document (souvent plus riches que l'entête)
    start_idx = min(len(sentences) // 4, 10) 
    sentences_pool = sentences[start_idx:]
    
    for i in range(min(num_questions, len(sentences_pool))):
        sentence = sentences_pool[i]
        q_text = f"Basé sur le contenu du document, que peut-on affirmer concernant : '{sentence[:50]}...' ?"
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

class AIService:
    @staticmethod
    def generate_questions_qwen(context: str, settings: Dict) -> List[Dict]:
        """Genere des questions de haute qualite avec Qwen 2.5 72B via HF Router."""
        hf_token = app_settings.HF_TOKEN
        if not hf_token:
            print("WARNING: HF_TOKEN missing, falling back to T5")
            return None
            
        num_questions = settings.get('num_questions', 5)
        difficulty = settings.get('difficulty', 'Moyen')
        language = settings.get('language', 'Français')
        question_type = settings.get('question_type', 'Mélangé')
        tone = settings.get('tone', 'Fun')
        
        print(f" [Qwen] Request: {num_questions} questions, {difficulty}, {language}, Type: {question_type}, Tone: {tone}")
        
        # Mapping difficulty instructions
        diff_instructions = {
            "Débutant": "Concepts de base, questions directes, distracteurs (fausses réponses) très évidents et simples.",
            "Moyen": "Nécessite une bonne compréhension du texte, nuances légères, distracteurs plausibles mais incorrects.",
            "Expert": "Analyse critique, questions sur des détails subtils ou des implications complexes, distracteurs très piégeux et sophistiqués."
        }
        
        # Mapping tone instructions
        tone_instructions = {
            "Fun": "Utilise un style décontracté, quelques jeux de mots, des exclamations, et rend l'apprentissage amusant.",
            "Académique": "Utilise un style formel, rigoureux, précis et hautement professionnel. Pas de fioritures.",
            "Mystérieux": "Crée une ambiance d'intrigue, utilise des métaphores liées à la découverte ou au secret, comme si l'utilisateur résolvait une énigme."
        }
        
        show_immediate_feedback = settings.get('show_immediate_feedback', True)
        
        type_constraint = ""
        if question_type == "Vrai ou Faux":
            type_constraint = """Toutes les questions doivent être de type 'Vrai ou Faux'. 
            L'argument 'options_reponses' doit contenir UNIQUEMENT ["Vrai", "Faux"]. 
            La question doit être une affirmation claire. 'reponse_correcte' est "Vrai" ou "Faux"."""
        elif question_type == "QCM":
            type_constraint = "Toutes les questions doivent être des Multi-Choice Questions (MCQ) avec exactement 4 options. 'reponse_correcte' est la chaîne exacte d'une option."
        elif question_type == "Plusieurs Réponses":
            type_constraint = """Questions à choix multiples avec PLUSIEURS réponses correctes possibles. 
            'options_reponses' contient 4 choix. 'reponse_correcte' doit être une LISTE de chaînes correspondant aux options valides (ex: ["A", "C"])."""
        elif question_type == "Mélangé":
            type_constraint = """Mélange STRICTEMENT les types suivants : 40% QCM (MCQ), 40% Vrai ou Faux (TF), et 20% Plusieurs Réponses (Multi). 
            Varie les formats pour maintenir l'engagement."""

        feedback_instruction = "L'utilisateur a activé la correction immédiate. Rends les explications percutantes." if show_immediate_feedback else "L'utilisateur verra les corrections à la fin. Concentre-toi sur la profondeur didactique des explications."

        API_URL = "https://router.huggingface.co/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/json"
        }
        
        # Build context-aware instructions for the AI
        metadata_instructions = ""
        if settings.get('titre') and settings.get('titre').strip():
            metadata_instructions += f"\n- TITRE SOUHAITÉ : {settings.get('titre')}"
        if settings.get('description') and settings.get('description').strip():
            metadata_instructions += f"\n- CONTEXTE/DESCRIPTION : {settings.get('description')}"

        system_prompt = f"""Tu es Antigravity-Quiz, l'élite mondiale de l'ingénierie pédagogique par IA.
Ta mission est de produire un examen magistral, d'une précision chirurgicale et d'une force académique absolue.

IMPÉRATIFS DE GÉNÉRATION :
1. FIDÉLITÉ RADICALE : Chaque question doit extraire la substantifique moelle du contenu fourni. Ne dévie JAMAIS du sujet.{metadata_instructions}
2. PUISSANCE ANALYTIQUE : Conçois des questions qui testent la compréhension profonde, pas seulement la mémoire.
3. DIFFICULTÉ CIBLÉE ({difficulty}) : {diff_instructions.get(difficulty, "")}
4. DISTRACTEURS SOPHISTIQUÉS : Les fausses réponses doivent être d'une crédibilité totale pour un non-expert, obligeant à une réflexion réelle.
5. RIGUEUR TECHNIQUE :
   - EXACTEMENT {num_questions} QUESTIONS. C'est un ordre.
   - LANGUE : {language} parfait (syntaxe, grammaire, nuances).
   - TON ({tone}) : Incarne le style '{tone}' avec force et élégance dans chaque phrase.
6. EXPLICATIONS D'EXPERT : Chaque explication doit être une mini-leçon magistrale validant la réponse correcte. {feedback_instruction}

NE FOURNIS RIEN D'AUTRE QU'UN JSON PUR. PAS DE TEXTE AVANT OU APRÈS.

STRUCTURE JSON :
{{
   "titre": "Titre souverain du quiz",
   "description": "Synthèse magistrale et inspirante du sujet",
   "questions": [
     {{
       "texte_question": "Question percutante et précise",
       "type_question": "MCQ", 
       "options_reponses": ["Option A", "Option B", "Option C", "Option D"],
       "reponse_correcte": "L'option exacte",
       "explication": "Démonstration pédagogique irréfutable",
       "points": 1
     }}
   ]
}}"""

        user_content = f"Voici le texte académique source :\n\n{context[:12000]}"
        
        payload = {
            "model": "Qwen/Qwen2.5-72B-Instruct",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "max_tokens": 4096,
            "temperature": 0.5, # Plus stable pour du JSON
            "response_format": {"type": "json_object"}
        }

        try:
            print(f" Appel API Qwen 72B (Router)...")
            
            # Implementation of Retries (max 3)
            max_retries = 3
            last_err = None
            for attempt in range(max_retries):
                try:
                    if _HTTP_LIB == 'httpx':
                        response = _http_lib.post(API_URL, headers=headers, json=payload, timeout=120.0)
                    elif _HTTP_LIB == 'requests':
                        response = _http_lib.post(API_URL, headers=headers, json=payload, timeout=120.0)
                    else:
                        # urllib fallback
                        data = json.dumps(payload).encode('utf-8')
                        req = _urllib_request.Request(API_URL, data=data, headers=headers, method='POST')
                        try:
                            with _urllib_request.urlopen(req, timeout=120) as resp:
                                resp_text = resp.read().decode('utf-8')
                                class _RespObj:
                                    pass
                                response = _RespObj()
                                response.status_code = resp.getcode()
                                response.text = resp_text
                        except _urllib_error.HTTPError as e:
                            response = e
                    # status check done below
                    if response.status_code == 200:
                        break
                    
                    if response.status_code in [502, 503, 504, 429]:
                        print(f" [Qwen] Tentative {attempt+1}/{max_retries} echouee ({response.status_code})...")
                        import time
                        time.sleep(1) # Petit delai avant retry
                        continue
                    else:
                        print(f" Erreur API Qwen ({response.status_code}): {response.text}")
                        return None
                except Exception as req_e:
                    last_err = req_e
                    print(f" [Qwen] Erreur reseau ({attempt+1}): {str(req_e)}")
                    continue
            else:
                print(" [Qwen] Toutes les tentatives ont echoue.")
                return None
                
            # Be defensive: ensure response body is present and JSON-parsable
            resp_text = response.text
            if not resp_text or not resp_text.strip():
                print(" [Qwen] Response body empty.")
                return None

            # Try parsing the outer HF router JSON first
            try:
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            except Exception:
                # If outer JSON parsing fails, fallback to raw text
                content = resp_text

            # Clean up potential markdown/code fences to extract embedded JSON
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                # try to extract content between the first set of backticks
                parts = content.split("```")
                if len(parts) >= 3:
                    content = parts[1].strip()

            # If content is empty now, attempt to extract any JSON object substring
            if not content or not content.strip():
                # Try to find a JSON object in the raw response text
                import re
                m = re.search(r"\{(?:.|\n)*\}", resp_text)
                if m:
                    content = m.group(0)

            # Finally try to load JSON
            try:
                result = json.loads(content)
            except Exception as e:
                print(f" [Qwen] Failed to parse JSON from content: {e}")
                # Log a snippet to help debugging
                snippet = content[:1000] if content else resp_text[:1000]
                print(f" [Qwen] Response snippet: {snippet}")
                return None
            questions = result.get("questions", []) if isinstance(result, dict) else []
            print(f" [Qwen] Generated {len(questions)}/{num_questions} questions.")
            
            # Injecter titre/description dans les settings pour le router
            settings['_generated_metadata'] = {
                "titre": result.get("titre", "Quiz généré"),
                "description": result.get("description", ""),
                "difficulty": difficulty
            }
            
            return questions[:num_questions]
            
        except Exception as e:
            print(f" Erreur lors de la génération Qwen: {str(e)}")
            return None

    @staticmethod
    def generate_questions(context: str, settings: Dict) -> List[Dict]:
        """
        Strategie de generation PFE:
        1. Qwen 2.5 72B (Cloud HF) - Meilleure qualite
        2. Extraction (Local CPU) - Backup ultime
        """
        # 1. Essayer Qwen
        questions = AIService.generate_questions_qwen(context, settings)
        if questions and len(questions) > 0:
            print(f" {len(questions)} questions generees avec succès par Qwen 72B!")
            return questions
            
        # 2. Backup ultime : Extraction simple
        print(" Fallback sur l'extraction intelligente (Qwen a echoue)...")
        num_questions = settings.get('num_questions', 10)
        
        # Ensure metadata is at least present for router
        if '_generated_metadata' not in settings:
            settings['_generated_metadata'] = {
                "titre": f"Quiz - {context[:30]}...",
                "description": "Généré par extraction automatique (fallback)",
                "difficulty": settings.get('difficulty', 'Moyen')
            }
            
        return _generate_questions_fallback(context, num_questions)

