
from quiz.ai_service import _fix_question_type, _is_valid_question
q = { "texte_question": "Test", "type_question": "MCQ", "options_reponses": ["A. pomme, poire", "B. banane"], "reponse_correcte": "A. pomme, poire" }
print("Fixed:", _fix_question_type(q, "QCM"))

