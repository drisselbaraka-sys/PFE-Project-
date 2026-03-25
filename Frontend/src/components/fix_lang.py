import re

with open(r'd:\PFE Project\Frontend\src\components\CreateCenter.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_block_pattern = r'\{\s*/\*\s*Visibility & Clonability\s*\*/\s*\}(.*?)\{/\*\s*Footer\s*Controls\s*\*/\}'
match = re.search(old_block_pattern, content, re.DOTALL)
if match:
    old_block = match.group(0)
    new_block = '''{/* Language */}
                                        <div className="pt-4 border-t border-indigo-500/10 space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: 'var(--text-secondary)' }}>Langue du Quiz</label>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { name: 'Français', icon: '🇫🇷' },
                                                        { name: 'English', icon: '🇬🇧' },
                                                        { name: 'Arabe', icon: '🇸🇦' },
                                                        { name: 'Espagnol', icon: '🇪🇸' }
                                                    ].map((lang) => (
                                                        <button
                                                            key={lang.name}
                                                            onClick={() => setAiSettings({ ...aiSettings, language: lang.name })}
                                                            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition-all duration-300 font-bold text-xs ${aiSettings.language === lang.name ? 'shadow-lg ring-2 ring-indigo-500' : 'opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                            style={{ 
                                                                backgroundColor: aiSettings.language === lang.name ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                                                                color: aiSettings.language === lang.name ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                            }}
                                                        >
                                                            <span className="text-base">{lang.icon}</span> {lang.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Controls */}'''
    content = content.replace(old_block, new_block, 1)
    with open(r'd:\PFE Project\Frontend\src\components\CreateCenter.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    print('Block not found')
