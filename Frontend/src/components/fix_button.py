import re

with open(r'd:\PFE Project\Frontend\src\components\CreateCenter.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the "Retour" button with ArrowLeft
pattern = r"\{step !== 'review_generated' && \([\s\S]*?\}\)"
match = re.search(pattern, content)
if match:
    old_block = match.group(0)
    new_block = '''{step !== 'review_generated' && (
                    <button
                        onClick={() => step === 'main_choice' ? onClose() : setStep('main_choice')}
                        className="fixed top-6 left-6 p-3 rounded-full transition-all z-[100] flex items-center justify-center bg-transparent hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: 'var(--text-primary)' }}
                        aria-label={step === 'main_choice' ? 'Quitter' : 'Retour'}
                    >
                        {step === 'main_choice' ? <X size={24} /> : <ArrowLeft size={24} />}
                    </button>
                )}'''
    content = content.replace(old_block, new_block, 1)

# Ensure ArrowLeft is imported
if 'ArrowLeft' not in content:
    content = content.replace('ArrowRight, Upload, ChevronRight, Settings,', 'ArrowLeft, ArrowRight, Upload, ChevronRight, Settings,')

with open(r'd:\PFE Project\Frontend\src\components\CreateCenter.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
