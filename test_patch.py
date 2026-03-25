import sys

file_path = r"d:\PFE Project\Frontend\src\components\CreateCenter.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add ref
content = content.replace(
    '''    const fileInputRef = useRef(null);''',
    '''    const fileInputRef = useRef(null);\n    const abortControllerRef = useRef(null);'''
)

# 2. Add signal to API call
content = content.replace(
    '''            files.forEach(file => formData.append('files', file));\n\n            const response = await api.post('/quiz/generate/ai', formData);''',
    '''            files.forEach(file => formData.append('files', file));\n\n            abortControllerRef.current = new AbortController();\n            const response = await api.post('/quiz/generate/ai', formData, {\n                signal: abortControllerRef.current.signal\n            });'''
)


# 3. Add setIsLoading(false) after step change
content = content.replace(
    '''                setStep('review_generated');\n\n                // -- AUTO-SAVE IN BACKGROUND --''',
    '''                setStep('review_generated');\n                setIsLoading(false);\n                setAiProgress(0);\n\n                // -- AUTO-SAVE IN BACKGROUND --'''
)

content = content.replace(
    '''                setStep('review_generated');\n\n                // -''',
    '''                setStep('review_generated');\n                setIsLoading(false);\n                setAiProgress(0);\n\n                // -'''
)


# 4. Handle abort error quietly
content = content.replace(
    '''        } catch (err) {\n            console.error("AI Generation failed:", err);''',
    '''        } catch (err) {\n            console.error("AI Generation failed:", err);\n            if (err.name === 'AbortError' || err.code === 'ERR_CANCELED' || err.message === 'canceled') {\n                console.log("Genereration annulee");\n                return;\n            }'''
)

# 5. Fix handleBack
old_handle_back = '''    const handleBack = () => {\n        if (step === 'main_choice') onClose();'''
new_handle_back = '''    const handleBack = () => {\n        if (isLoading) {\n            if (abortControllerRef.current) {\n                abortControllerRef.current.abort();\n            }\n            setIsLoading(false);\n            setAiProgress(0);\n            setAiLoadingMessage("L'IA prépare son cerveau...");\n        }\n\n        if (step === 'main_choice') onClose();'''
content = content.replace(old_handle_back, new_handle_back)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("File updated successfully.")
