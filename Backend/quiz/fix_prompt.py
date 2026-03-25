import re

with open(r'd:\PFE Project\Backend\quiz\ai_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

system_block_pattern = r'system = f\"\"\"Tu génères un quiz pédagogique en JSON seulement\.\{extras\}.*?\}\"\"\"'

new_system_block = '''system = f"""Tu es un expert en création de quiz pédagogique. Tu dois IMPÉRATIVEMENT générer le quiz UNIQUEMENT et STRICTEMENT dans la langue suivante : {language}. {extras}
Niveau de difficulté: {difficulty}. Ton/Style: {tone}.

Génère exactement {num_to_generate} questions basées uniquement sur le contenu fourni.
{type_rule}

INSTRUCTION DE LANGUE CRITIQUE : 
Les champs "titre", "description", "texte_question", "options_reponses", "reponse_correcte" et "explication" DOIVENT ÊTRE RÉDIGÉS EN {language}. TOUTE LA GÉNÉRATION DOIT ÊTRE EN {language}, indifféremment de la langue du contenu source.

Les questions doivent être courtes, précises, non répétitives et ancrées dans des faits concrets du document.
Ignore toujours les métadonnées non techniques: auteur, date de publication, copyright, contact, licence, établissement, page de garde.
L'explication doit contenir un maximum d'informations et faire un résumé pertinent justifiant la réponse (2 ou 3 phrases).
Important: "reponse_correcte" DOIT être le texte EXACT de la bonne option (pas la lettre A, B, C ou D).

Formate la réponse EXACTEMENT comme ce JSON (sans markdown - les clés restent en français mais les VALEURS doivent être en {language}):
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
}}"""'''

content = re.sub(system_block_pattern, new_system_block, content, flags=re.DOTALL)

with open(r'd:\PFE Project\Backend\quiz\ai_service.py', 'w', encoding='utf-8') as f:
    f.write(content)
