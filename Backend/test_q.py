
from quiz.ai_service import _is_valid_question, _fix_question_type
q = {
  'texte_question': 'Exemple de question ?',
  'type_question': 'MCQ',
  'options_reponses': ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
  'reponse_correcte': 'Option 1'
}
q = _fix_question_type(q, 'QCM')
print(_is_valid_question(q, 'QCM'))

