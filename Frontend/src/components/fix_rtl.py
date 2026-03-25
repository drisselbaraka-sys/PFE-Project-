import re

with open(r'd:\PFE Project\Frontend\src\components\QuizPlayer.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Function to dynamically set dir based on the first few characters
rtl_helper = '''
const isRTL = (text) => {
    if (!text) return false;
    const arabic = /[\u0600-\u06FF]/;
    return arabic.test(text.substring(0, 50)); // Check first 50 chars for Arabic
};
'''

# insert helper before QuizPlayer component starts
if 'const isRTL' not in content:
    content = content.replace('const QuizPlayer = ', rtl_helper + '\nconst QuizPlayer = ')

# update question text
old_h2 = r'<h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">(.*?)</h2>'
new_h2 = r'''<h2 
                                className="text-3xl md:text-4xl font-black leading-tight tracking-tight"
                                dir={isRTL(q?.texte_question) ? 'rtl' : 'ltr'}
                                style={{ textAlign: isRTL(q?.texte_question) ? 'right' : 'left' }}
                            >\1</h2>'''

content = re.sub(old_h2, new_h2, content, flags=re.DOTALL)

# update options
old_span = r'<span className="font-bold text-sm md:text-base">(.*?)</span>'
new_span = r'''<span className="font-bold text-sm md:text-base w-full flex-1"
                                                dir={isRTL(opt) ? 'rtl' : 'ltr'}
                                                style={{ textAlign: isRTL(opt) ? 'right' : 'left' }}
                                            >\1</span>'''

content = re.sub(old_span, new_span, content)


with open(r'd:\PFE Project\Frontend\src\components\QuizPlayer.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
