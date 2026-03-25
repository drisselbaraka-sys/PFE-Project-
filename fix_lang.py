import sys
import re

file_path = r"d:\PFE Project\Backend\quiz\ai_service.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_instruction = '''INSTRUCTION DE LANGUE CRITIQUE :\nLes champs "titre", "description", "texte_question", "options_reponses", "reponse_correcte" et "explication" DOIVENT ÊTRE RÉDIGÉS EN {language}. TOUTE LA GÉNÉRATION DOIT ÊTRE EN {language}, indifféremment de la langue du contenu source.'''

new_instruction = '''INSTRUCTION DE LANGUE CRITIQUE :\nLes champs "titre", "description", "texte_question", "options_reponses", "reponse_correcte" et "explication" DOIVENT ÊTRE RÉDIGÉS ENTIÈREMENT ET STRICTEMENT EN {language}. \nINTERDICTION ABSOLUE DE MÉLANGER LES LANGUES. Si tu génères en Arabe par exemple, n'utilise AUCUN mot en Français (comme "nombre de", "et", "ou") ou en Anglais dans les phrases, tu dois tout traduire correctement (ex: "???"). TOUTE LA GÉNÉRATION DES VALEURS DOIT ÊTRE 100% EN {language}, indifféremment de la langue du contenu source.'''

new_content = content.replace(old_instruction, new_instruction)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("Updated ai_service.py")
