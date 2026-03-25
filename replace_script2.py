import re

with open('Frontend/src/components/CreateCenter.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

ai_config_match = re.search(r"(\{step === 'ai_config' && !isLoading && \(\s*<div\s+className=\"flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar font-inter transition-colors duration-500.*?\} === 'ai_config' && isLoading && \()", text, re.DOTALL)
if not ai_config_match:
    print("Could not find ai_config")
    exit()

ai_config_part = ai_config_match.group(1)

col1 = re.search(r"(<div className=\"space-y-6 glass-card p-6 rounded-\[32px\] shadow-2xl transition-all duration-500\".*?{/\* Column 2: Source \(Content & Files\) \*/})", ai_config_part, re.DOTALL).group(1)
col3 = re.search(r"({/\* Column 3: AI Settings \(Parameters\) \*/}.*?</div>\s*</div>\s*{/\* Footer Controls \*/})", ai_config_part, re.DOTALL).group(1)

manual_editor_match = re.search(r"(\{step === 'manual_editor' && \((.*?)(?=\{step === 'success' && \()", text, re.DOTALL)
manual_editor_part = manual_editor_match.group(1)

manual_col2 = """
                {/* Column 2: Manual Questions Editor */}
                <div className="space-y-6 lg:max-h-[800px] overflow-y-auto custom-scrollbar p-2">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="font-outfit text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Contenu du Quiz</h2>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest opacity-80">Rédigez vos questions</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h2 className="text-xl font-black transition-colors" style={{ color: 'var(--text-primary)' }}>Questions ({questions.length})</h2>
                            
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--glass-border)' }}>
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: 'var(--text-secondary)' }}>Options :</span>
                                    <div className="flex gap-1">
                                        {[2, 3, 4, 5, 6].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => {
                                                    const newQs = questions.map(q => {
                                                        let newOpts = [...q.options_reponses];
                                                        if (newOpts.length < num) {
                                                            while(newOpts.length < num) newOpts.push('');
                                                        } else if (newOpts.length > num) {
                                                            newOpts = newOpts.slice(0, num);
                                                        }
                                                        let corr = q.reponse_correcte;
                                                        if (!newOpts.includes(corr)) {
                                                            corr = '';
                                                        }
                                                        return { ...q, options_reponses: newOpts, reponse_correcte: corr };
                                                    });
                                                    setQuestions(newQs);
                                                }}
                                                className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all ${questions.length > 0 && questions[0].options_reponses.length === num ? 'bg-emerald-500 text-white shadow-md' : 'opacity-50 hover:opacity-100'}`}
                                                style={{ backgroundColor: questions.length > 0 && questions[0].options_reponses.length === num ? '' : 'transparent', color: questions.length > 0 && questions[0].options_reponses.length === num ? '#fff' : 'var(--text-primary)' }}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setQuestions([...questions, { texte_question: '', type_question: 'MCQ', options_reponses: questions.length > 0 ? Array(questions[0].options_reponses.length).fill('') : ['', '', '', ''], reponse_correcte: '', explication: '', points: 1 }])}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all duration-300 shadow-lg"
                                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--emerald-500)' }}
                                >
                                    <Plus size={16} /> Ajouter
                                </button>
                            </div>
                        </div>

                        <AnimatePresence>
                            {questions.map((q, idx) => (
                                <motion.div
                                    key={idx}
                                    variants={{
                                        hidden: { opacity: 0, y: 20 },
                                        visible: { opacity: 1, y: 0 }
                                    }}
                                    initial="hidden" animate="visible" exit="hidden"
                                    className="p-6 rounded-[24px] border-2 transition-all hover:border-emerald-500/30 relative shadow-sm group"
                                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--glass-border)' }}
                                >
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="w-8 h-8 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0 bg-emerald-500 shadow-lg">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <textarea
                                                placeholder="Votre question ici..."
                                                className="w-full text-lg font-bold bg-transparent border-none outline-none resize-none min-h-[40px] transition-colors"
                                                style={{ color: 'var(--text-primary)' }}
                                                rows={2}
                                                value={q.texte_question}
                                                onChange={(e) => {
                                                    const newQs = [...questions];
                                                    newQs[idx].texte_question = e.target.value;
                                                    setQuestions(newQs);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {q.options_reponses.map((opt, optIdx) => (
                                            <div
                                                key={optIdx}
                                                className={`relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-500 ${q.reponse_correcte === opt && opt !== '' ? 'border-green-500 shadow-md bg-green-500/5' : 'border-transparent'}`}
                                                style={{ backgroundColor: q.reponse_correcte === opt && opt !== '' ? '' : 'var(--bg-elevated)' }}
                                            >
                                                <div
                                                    onClick={() => {
                                                        const newQs = [...questions];
                                                        newQs[idx].reponse_correcte = opt;
                                                        setQuestions(newQs);
                                                    }}
                                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all duration-300 ${q.reponse_correcte === opt && opt !== '' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-500/40'}`}
                                                >
                                                    {q.reponse_correcte === opt && opt !== '' && <Check size={12} strokeWidth={4} />}
                                                </div>
                                                <input
                                                    placeholder={`Option ${optIdx + 1}`}
                                                    value={opt}
                                                    onChange={(e) => {
                                                        const newQs = [...questions];
                                                        if (newQs[idx].reponse_correcte === newQs[idx].options_reponses[optIdx]) {
                                                            newQs[idx].reponse_correcte = e.target.value;
                                                        }
                                                        newQs[idx].options_reponses[optIdx] = e.target.value;
                                                        setQuestions(newQs);
                                                    }}
                                                    className="flex-1 bg-transparent border-none outline-none font-medium h-5 transition-colors text-sm"
                                                    style={{ color: 'var(--text-primary)' }}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 pt-4 border-t flex items-center gap-4 justify-between transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                                                <Trophy size={14} className="text-orange-400" />
                                                <input
                                                    type="number"
                                                    value={q.points}
                                                    onChange={(e) => {
                                                        const newQs = [...questions];
                                                        newQs[idx].points = parseInt(e.target.value) || 0;
                                                        setQuestions(newQs);
                                                    }}
                                                    className="w-10 bg-transparent border-none outline-none font-black text-center text-sm"
                                                    style={{ color: 'var(--text-primary)' }}
                                                />
                                                <span className="text-[10px] font-black uppercase opacity-50" style={{ color: 'var(--text-secondary)' }}>Points</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                                            className="opacity-50 hover:opacity-100 font-bold text-[10px] uppercase tracking-wider transition-colors text-red-500"
                                        >
                                            Supprimer
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
"""

col1 = col1.replace("{/* Column 2: Source (Content & Files) */}", "")
col3 = col3.replace("{/* Footer Controls */}", "")

footer = """
            </div>

            {/* Footer */}
            <div className="mt-12 flex items-center justify-between border-t pt-8 pb-12 transition-colors duration-500" style={{ borderColor: 'var(--glass-border)' }}>
                <button
                    onClick={() => setStep('selector')}
                    className="px-8 py-4 font-bold transition-colors flex items-center gap-2 opacity-50 hover:opacity-100"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <ChevronRight size={20} className="rotate-180" /> Retour
                </button>

                <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePublish}
                    disabled={isLoading || !quizData.titre || questions.length === 0}
                    className={`px-12 py-5 rounded-full font-outfit font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4 ${(quizData.titre && questions.length > 0) ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'opacity-50 bg-slate-500 text-white pointer-events-none'}`}
                >
                    {isLoading ? 'Enregistrement...' : (editingQuiz ? 'Sauvegarder' : 'Publier Quiz')} <Check size={24} />
                </motion.button>
            </div>
        </motion.div>
    </div>
)
}"""

new_manual_editor = "{step === 'manual_editor' && (\n    <div className=\"flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar font-inter transition-colors duration-500\" style={{ backgroundColor: 'var(--bg-base)' }}>\n        <motion.div\n            initial={{ opacity: 0, y: 30 }}\n            animate={{ opacity: 1, y: 0 }}\n            className=\"max-w-7xl w-full\"\n        >\n            <div className=\"grid grid-cols-1 lg:grid-cols-3 gap-8 items-start\">\n" + col1 + manual_col2 + col3 + footer

new_text = text.replace(manual_editor_part, new_manual_editor + "\n                ")

with open('Frontend/src/components/CreateCenter.jsx', 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Done replacing.")
