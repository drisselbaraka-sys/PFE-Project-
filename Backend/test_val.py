import json
from quiz.ai_service import _normalize_question_payload, _fix_question_type, _is_valid_question, _is_non_technical_question, GARBAGE_PHRASES

def strict_val(q, ex_type="any"):
    if not isinstance(q, dict): return "not dict"
    for field in ["texte_question", "type_question", "options_reponses", "reponse_correcte"]:
        if not q.get(field): return f"missing {field}"
    q_text = q.get("texte_question", "").strip()
    options = q.get("options_reponses", [])
    correct = q.get("reponse_correcte")
    if len(q_text) < 10: return "text too short"
    if _is_non_technical_question(q_text): return "non-tech"
    if not isinstance(options, list) or len(options) < 2: return "options < 2"
    opts_norm = [str(o).strip().lower() for o in options]
    if len(set(opts_norm)) < len(opts_norm): return "not distinct options: " + str(opts_norm)
    if isinstance(correct, list):
        for c in correct:
            if str(c).strip().lower() not in opts_norm: return f"correct {c} not in opts_norm {opts_norm}"
    else:
        if str(correct).strip().lower() not in opts_norm: return f"correct {correct} not in opts_norm {opts_norm}"
    q_type = q.get("type_question")
    if ex_type in ("QCM", "Mélangé", "any") or q_type == "MCQ":
        if len(options) < 2 or len(options) > 5: return "options not in 2-5"
    combined = (q_text + str(correct)).lower()
    if any(g in combined for g in GARBAGE_PHRASES): return "garbage in combined"
    for opt in options:
        if any(g in str(opt).lower() for g in GARBAGE_PHRASES): return "garbage in option"
    return "Valid"

dummy1 = {
   "texte_question": "Quelle est la capitale de la France ?",
   "type_question": "MCQ", 
   "options_reponses": ["Option A: Paris", "Option B: Lyon", "Option C: Marseille", "Option D: Nice"],
   "reponse_correcte": "Option A: Paris",
   "explication": "...",
   "points": 1
}

dummy2 = {
   "texte_question": "Quelle est la capitale de la France ?",
   "type_question": "MCQ", 
   "options_reponses": ["Paris", "Lyon", "Marseille", "Nice"],
   "reponse_correcte": "Paris", # groq does this
   "explication": "...",
   "points": 1
}

print("dummy1 ->", strict_val(_fix_question_type(dummy1, "QCM"), "QCM"))
print("dummy2 ->", strict_val(_fix_question_type(dummy2, "QCM"), "QCM"))
