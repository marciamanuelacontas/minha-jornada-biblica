import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, Calendar as CalendarIcon, List, BarChart2, Check, RotateCcw, Upload, Trash2, Pencil, Save, X, Cloud, CloudOff, Loader2, Copy } from 'lucide-react';
import { supabase } from './lib/supabase';

// --- COMPONENTES PRINCIPAIS --- //
export default function App() {
  const [activeTab, setActiveTab] = useState('hoje');
  const [plan, setPlan] = useState([]);
  const [showCompletedSet, setShowCompletedSet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState('loading');

  // Carregar o plano do Supabase e migrar a cópia local quando o banco estiver vazio
  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      let localPlan = null;

      try {
        const savedPlan = localStorage.getItem('minhaJornadaBiblica_plan');
        localPlan = savedPlan ? JSON.parse(savedPlan) : null;
      } catch {
        localPlan = null;
      }

      const fallbackPlan = Array.isArray(localPlan) ? localPlan : [];

      try {
        const { data, error } = await supabase
          .from('app_state')
          .select('plan')
          .eq('id', 1)
          .single();

        if (cancelled) return;

        if (error) {
          console.error('Não foi possível carregar o plano do Supabase:', error);
          setPlan(fallbackPlan);
          setSyncStatus('offline');
        } else if (Array.isArray(data?.plan) && data.plan.length > 0) {
          setPlan(data.plan);
          localStorage.setItem('minhaJornadaBiblica_plan', JSON.stringify(data.plan));
          setSyncStatus('saved');
        } else if (fallbackPlan.length > 0) {
          setPlan(fallbackPlan);

          const { error: migrationError } = await supabase
            .from('app_state')
            .update({
              plan: fallbackPlan,
              updated_at: new Date().toISOString()
            })
            .eq('id', 1);

          setSyncStatus(migrationError ? 'offline' : 'saved');
        } else {
          setPlan([]);
          setSyncStatus('saved');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Erro de conexão com o Supabase:', error);
        setPlan(fallbackPlan);
        setSyncStatus('offline');
      } finally {
        if (!cancelled) {
          setIsInitialized(true);
          setIsLoading(false);
        }
      }
    };

    loadPlan();

    return () => {
      cancelled = true;
    };
  }, []);

  // Guardar uma cópia local e sincronizar alterações com o Supabase
  useEffect(() => {
    if (!isInitialized) return undefined;

    localStorage.setItem('minhaJornadaBiblica_plan', JSON.stringify(plan));
    setSyncStatus('saving');

    const timeoutId = window.setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('app_state')
          .update({
            plan,
            updated_at: new Date().toISOString()
          })
          .eq('id', 1);

        if (error) {
          console.error('Não foi possível salvar no Supabase:', error);
          setSyncStatus('offline');
          return;
        }

        setSyncStatus('saved');
      } catch (error) {
        console.error('Erro ao salvar no Supabase:', error);
        setSyncStatus('offline');
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [plan, isInitialized]);

  // Tentar novamente quando a conexão com a internet voltar
  useEffect(() => {
    const syncWhenOnline = async () => {
      if (!isInitialized) return;

      setSyncStatus('saving');
      const { error } = await supabase
        .from('app_state')
        .update({
          plan,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      setSyncStatus(error ? 'offline' : 'saved');
    };

    window.addEventListener('online', syncWhenOnline);
    return () => window.removeEventListener('online', syncWhenOnline);
  }, [plan, isInitialized]);

  // Lógica Principal: Encontrar o conjunto atual (primeiro não concluído totalmente)
  const currentSetIndex = plan.findIndex(set => set.blocks.some(b => !b.isCompleted));
  const currentSet = currentSetIndex !== -1 ? plan[currentSetIndex] : null;

  // Marcar/Desmarcar leitura
  const toggleBlock = (setId, blockId, undo = false) => {
    const now = new Date().toISOString();
    
    setPlan(prevPlan => prevPlan.map(set => {
      if (set.id === setId) {
        const updatedBlocks = set.blocks.map(b => 
          b.id === blockId ? { ...b, isCompleted: !undo, completedAt: !undo ? now : null } : b
        );
        
        // Verifica se acabou de concluir o conjunto todo
        if (!undo && updatedBlocks.every(b => b.isCompleted)) {
          setShowCompletedSet(true);
        }
        
        return { ...set, blocks: updatedBlocks };
      }
      return set;
    }));
  };

  const handleContinueReading = () => {
    setShowCompletedSet(false);
  };

  // Apagar o histórico e reiniciar todo o progresso, preservando a sequência
  const handleResetHistory = () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja apagar todo o histórico e reiniciar o progresso? A sequência de leituras será mantida.'
    );

    if (!confirmed) return;

    setPlan(prevPlan => prevPlan.map(set => ({
      ...set,
      blocks: set.blocks.map(block => ({
        ...block,
        isCompleted: false,
        completedAt: null
      }))
    })));
    setShowCompletedSet(false);
    alert('Histórico apagado e progresso reiniciado.');
  };

  // Editar os títulos dos blocos de um conjunto
  const handleEditSet = (setId, titles) => {
    const normalizedTitles = titles.map(title => title.trim());
    if (normalizedTitles.some(title => !title)) {
      alert('Preencha todas as leituras antes de salvar.');
      return false;
    }

    setPlan(prevPlan => prevPlan.map(set =>
      set.id === setId
        ? {
            ...set,
            blocks: set.blocks.map((block, index) => ({
              ...block,
              title: normalizedTitles[index]
            }))
          }
        : set
    ));
    return true;
  };

  // Apagar um conjunto e seu eventual histórico
  const handleDeleteSet = (setId, setNumber) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja apagar o Conjunto ${setNumber}? Essa ação também removerá o histórico de leituras desse conjunto.`
    );

    if (!confirmed) return;

    setPlan(prevPlan => prevPlan.filter(set => set.id !== setId));
    setShowCompletedSet(false);
  };

  // Importar plano colado
  const handlePastePlan = (text) => {
    if (!text.trim()) return;
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const newSets = lines.map((line, index) => {
      const blocks = line.split('|').map(b => b.trim());
      return {
        id: `set-${Date.now()}-${index}`,
        blocks: blocks.map((b, i) => ({
          id: `block-${Date.now()}-${index}-${i}`,
          title: b,
          isCompleted: false,
          completedAt: null
        }))
      };
    });
    setPlan(prev => [...prev, ...newSets]);
    alert(`${newSets.length} conjuntos importados com sucesso!`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf5ff] flex flex-col items-center justify-center gap-4 text-purple-700">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm font-medium">Carregando sua jornada...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf5ff] text-gray-800 font-sans pb-20 md:pb-0 md:flex">
      
      {/* Navegação Desktop (Escondida no Mobile) */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-purple-100 p-6 fixed h-full">
        <h1 className="text-2xl font-bold text-purple-800 mb-10">Minha Jornada</h1>
        <nav className="space-y-4">
          <NavItem active={activeTab === 'hoje'} onClick={() => setActiveTab('hoje')} icon={<BookOpen size={20} />} label="Hoje" />
          <NavItem active={activeTab === 'calendario'} onClick={() => setActiveTab('calendario')} icon={<CalendarIcon size={20} />} label="Calendário" />
          <NavItem active={activeTab === 'plano'} onClick={() => setActiveTab('plano')} icon={<List size={20} />} label="Meu Plano" />
          <NavItem active={activeTab === 'progresso'} onClick={() => setActiveTab('progresso')} icon={<BarChart2 size={20} />} label="Progresso" />
        </nav>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 md:ml-64 p-6 max-w-2xl mx-auto w-full">
        <header className="mb-8 text-center md:text-left mt-4 md:mt-0">
          <h1 className="text-2xl font-semibold text-purple-900 tracking-tight">Minha Jornada Bíblica</h1>
          <p className="text-purple-400 text-sm mt-1">Semeando a palavra, um dia de cada vez.</p>
          <SyncStatus status={syncStatus} />
        </header>

        {activeTab === 'hoje' && (
          <HojeView 
            currentSet={currentSet} 
            toggleBlock={toggleBlock} 
            showCompletedSet={showCompletedSet}
            handleContinueReading={handleContinueReading}
            planEmpty={plan.length === 0}
          />
        )}
        {activeTab === 'calendario' && <CalendarioView plan={plan} handleResetHistory={handleResetHistory} />}
        {activeTab === 'plano' && (
          <PlanoView
            plan={plan}
            handlePastePlan={handlePastePlan}
            handleEditSet={handleEditSet}
            handleDeleteSet={handleDeleteSet}
          />
        )}
        {activeTab === 'progresso' && <ProgressoView plan={plan} />}
      </main>

      {/* Navegação Mobile (Bottom Bar) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-purple-100 flex justify-around items-center h-16 px-2 shadow-[0_-4px_20px_rgba(139,92,246,0.05)] z-50">
        <MobileNavItem active={activeTab === 'hoje'} onClick={() => setActiveTab('hoje')} icon={<BookOpen size={24} />} label="Hoje" />
        <MobileNavItem active={activeTab === 'calendario'} onClick={() => setActiveTab('calendario')} icon={<CalendarIcon size={24} />} label="Calendário" />
        <MobileNavItem active={activeTab === 'plano'} onClick={() => setActiveTab('plano')} icon={<List size={24} />} label="Plano" />
        <MobileNavItem active={activeTab === 'progresso'} onClick={() => setActiveTab('progresso')} icon={<BarChart2 size={24} />} label="Progresso" />
      </nav>
    </div>
  );
}

// --- TELAS (VIEWS) --- //

function HojeView({ currentSet, toggleBlock, showCompletedSet, handleContinueReading, planEmpty }) {
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    setPromptCopied(false);
  }, [currentSet?.id]);

  if (planEmpty) return <div className="text-center p-10 bg-white rounded-3xl shadow-sm border border-purple-50 text-purple-600">Seu plano está vazio. Vá em "Meu Plano" para começar.</div>;
  if (!currentSet && !showCompletedSet) return <div className="text-center p-10 bg-white rounded-3xl shadow-sm border border-purple-50 text-purple-600">Você concluiu todo o seu plano! 🎉</div>;

  const completedCount = currentSet.blocks.filter(b => b.isCompleted).length;
  const totalCount = currentSet.blocks.length;
  const progress = (completedCount / totalCount) * 100;
  const readingTitles = currentSet.blocks.map(block => block.title.trim()).filter(Boolean);
  const formattedReadings = readingTitles.length > 1
    ? `${readingTitles.slice(0, -1).join(', ')} e ${readingTitles.at(-1)}`
    : readingTitles[0] || '';
  const devotionalPrompt = `Faça um resumo dos capítulos: ${formattedReadings}; depois, faça um devocional baseado nesses capítulos.`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(devotionalPrompt);
    } catch {
      const temporaryTextArea = document.createElement('textarea');
      temporaryTextArea.value = devotionalPrompt;
      temporaryTextArea.style.position = 'fixed';
      temporaryTextArea.style.opacity = '0';
      document.body.appendChild(temporaryTextArea);
      temporaryTextArea.select();
      document.execCommand('copy');
      document.body.removeChild(temporaryTextArea);
    }

    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-end mb-4">
        <h2 className="text-lg font-medium text-purple-800">Leituras atuais</h2>
        <span className="text-sm font-medium text-purple-500 bg-purple-50 px-3 py-1 rounded-full">{completedCount} de {totalCount} concluídas</span>
      </div>

      {/* Barra de Progresso Suave */}
      <div className="h-2 w-full bg-purple-100 rounded-full overflow-hidden">
        <div className="h-full bg-purple-400 transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="space-y-4 mt-6">
        {currentSet.blocks.map((block, idx) => (
          <div key={block.id} className={`p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between shadow-sm ${block.isCompleted ? 'bg-purple-50 border-purple-200' : 'bg-white border-transparent hover:border-purple-100'}`}>
            <div>
              <p className="text-xs font-semibold text-purple-400 mb-1 uppercase tracking-wider">Bloco {idx + 1}</p>
              <h3 className={`text-lg transition-colors ${block.isCompleted ? 'text-purple-300 line-through' : 'text-gray-700 font-medium'}`}>{block.title}</h3>
            </div>
            
            {!block.isCompleted ? (
              <button onClick={() => toggleBlock(currentSet.id, block.id)} className="w-12 h-12 rounded-full border-2 border-purple-200 flex items-center justify-center text-purple-200 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-500 transition-colors">
                <Check size={20} />
              </button>
            ) : (
              <button onClick={() => toggleBlock(currentSet.id, block.id, true)} className="flex items-center gap-2 text-xs font-medium text-purple-500 bg-white px-3 py-2 rounded-xl shadow-sm border border-purple-100 hover:bg-purple-50 transition-colors">
                <RotateCcw size={14} /> Desfazer
              </button>
            )}
          </div>
        ))}
      </div>

      <section className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-purple-800">Prompt para o ChatGPT</h3>
            <p className="text-xs text-gray-400 mt-1">Copie e cole no ChatGPT para estudar as leituras atuais.</p>
          </div>
          <button
            type="button"
            onClick={handleCopyPrompt}
            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              promptCopied
                ? 'bg-green-50 text-green-600 border border-green-100'
                : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            }`}
            aria-label="Copiar prompt para o ChatGPT"
          >
            {promptCopied ? <Check size={16} /> : <Copy size={16} />}
            {promptCopied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <textarea
          readOnly
          value={devotionalPrompt}
          rows="4"
          onFocus={event => event.target.select()}
          className="w-full resize-none rounded-xl bg-purple-50/60 border border-purple-100 p-4 text-sm text-gray-700 leading-relaxed outline-none focus:ring-2 focus:ring-purple-200"
          aria-label="Texto para copiar e usar no ChatGPT"
        />
      </section>

      {showCompletedSet && completedCount === totalCount && (
        <div className="mt-8 p-6 bg-gradient-to-br from-purple-400 to-purple-500 rounded-3xl text-white text-center shadow-lg animate-bounce-subtle">
          <h3 className="text-xl font-bold mb-2">Conjunto concluído! ✨</h3>
          <p className="text-purple-100 text-sm mb-6">Você está indo muito bem. O plano só avança no seu ritmo.</p>
          <button onClick={handleContinueReading} className="bg-white text-purple-600 px-6 py-3 rounded-xl font-semibold w-full shadow-sm hover:bg-purple-50 transition-colors">
            Continuar lendo
          </button>
        </div>
      )}
    </div>
  );
}

function CalendarioView({ plan, handleResetHistory }) {
  // Extrair histórico real
  const history = useMemo(() => {
    const dates = {};
    plan.forEach(set => {
      set.blocks.forEach(block => {
        if (block.isCompleted && block.completedAt) {
          const dateStr = block.completedAt.split('T')[0];
          if (!dates[dateStr]) dates[dateStr] = [];
          dates[dateStr].push(block.title);
        }
      });
    });
    // Ordenar do mais recente para o mais antigo
    return Object.keys(dates).sort((a, b) => new Date(b) - new Date(a)).map(date => ({
      date,
      reads: dates[date]
    }));
  }, [plan]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-purple-800">Histórico de Leituras</h2>
          <p className="text-sm text-gray-500 mt-2">Seu plano avança no seu ritmo. Aqui estão os dias em que você efetivamente registrou progressos.</p>
        </div>
        <button
          onClick={handleResetHistory}
          disabled={history.length === 0}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-red-100 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Apaga o histórico e reinicia o progresso"
        >
          <Trash2 size={16} />
          <span className="hidden sm:inline">Apagar histórico</span>
        </button>
      </div>
      
      {history.length === 0 ? (
        <p className="text-center text-purple-300 py-10">Nenhuma leitura registrada ainda. Tudo tem um começo!</p>
      ) : (
        <div className="space-y-6 border-l-2 border-purple-100 pl-4 ml-2">
          {history.map((day, idx) => (
            <div key={day.date} className="relative">
              <div className="absolute -left-[25px] top-1 w-4 h-4 rounded-full bg-purple-400 border-4 border-[#faf5ff]"></div>
              <h3 className="text-sm font-bold text-purple-900 mb-3">{new Date(day.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</h3>
              <div className="space-y-2">
                {day.reads.map((read, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl shadow-sm border border-purple-50 text-sm text-gray-700 flex items-center gap-3">
                    <Check size={16} className="text-green-500" /> {read}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanoView({ plan, handlePastePlan, handleEditSet, handleDeleteSet }) {
  const [pasteText, setPasteText] = useState('');
  const [editingSetId, setEditingSetId] = useState(null);
  const [editingTitles, setEditingTitles] = useState([]);

  const startEditing = (set) => {
    setEditingSetId(set.id);
    setEditingTitles(set.blocks.map(block => block.title));
  };

  const cancelEditing = () => {
    setEditingSetId(null);
    setEditingTitles([]);
  };

  const saveEditing = (setId) => {
    if (handleEditSet(setId, editingTitles)) {
      cancelEditing();
    }
  };

  const updateEditingTitle = (index, value) => {
    setEditingTitles(prev => prev.map((title, titleIndex) =>
      titleIndex === index ? value : title
    ));
  };
  
  const totalBlocks = plan.reduce((acc, set) => acc + set.blocks.length, 0);
  const completedBlocks = plan.reduce((acc, set) => acc + set.blocks.filter(b => b.isCompleted).length, 0);
  const percentage = totalBlocks === 0 ? 0 : Math.round((completedBlocks / totalBlocks) * 100);

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-purple-50">
        <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-2">Progresso Geral</h2>
        <div className="flex items-end gap-2 mb-4">
          <span className="text-3xl font-light text-purple-900">{percentage}%</span>
          <span className="text-sm text-gray-400 mb-1 border-l pl-2 ml-1"> {completedBlocks} de {totalBlocks} blocos</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-purple-400 rounded-full" style={{ width: `${percentage}%` }}></div>
        </div>
      </section>

      <section className="bg-white p-6 rounded-3xl shadow-sm border border-purple-50">
        <h2 className="text-lg font-medium text-purple-800 mb-4">Sequência salva</h2>
        {plan.length === 0 ? (
          <p className="text-sm text-purple-300">Nenhuma sequência cadastrada ainda.</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {plan.map((set, setIndex) => {
              const isEditing = editingSetId === set.id;

              return (
                <div key={set.id} className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-xs font-bold text-purple-500 uppercase tracking-wider">
                      Conjunto {setIndex + 1}
                    </h3>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEditing(set.id)}
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-colors"
                            title="Salvar alterações"
                          >
                            <Save size={14} /> <span className="hidden sm:inline">Salvar</span>
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white border border-purple-100 text-gray-500 text-xs font-medium hover:bg-purple-50 transition-colors"
                            title="Cancelar edição"
                          >
                            <X size={14} /> <span className="hidden sm:inline">Cancelar</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditing(set)}
                            disabled={editingSetId !== null}
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white border border-purple-100 text-purple-600 text-xs font-medium hover:bg-purple-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Editar conjunto"
                          >
                            <Pencil size={14} /> <span className="hidden sm:inline">Editar</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSet(set.id, setIndex + 1)}
                            disabled={editingSetId !== null}
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white border border-red-100 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Apagar conjunto"
                          >
                            <Trash2 size={14} /> <span className="hidden sm:inline">Apagar</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {set.blocks.map((block, blockIndex) => (
                      <div key={block.id} className="flex items-center gap-3 bg-white rounded-xl p-3 text-sm text-gray-700">
                        <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs ${
                          block.isCompleted ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-500'
                        }`}>
                          {block.isCompleted ? <Check size={14} /> : blockIndex + 1}
                        </span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingTitles[blockIndex] ?? ''}
                            onChange={(event) => updateEditingTitle(blockIndex, event.target.value)}
                            className="w-full bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-200"
                            aria-label={`Leitura ${blockIndex + 1} do conjunto ${setIndex + 1}`}
                          />
                        ) : (
                          <span className={block.isCompleted ? 'line-through text-gray-400' : ''}>{block.title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-3xl shadow-sm border border-purple-50">
        <h2 className="text-lg font-medium text-purple-800 mb-4">Cadastrar Sequência</h2>
        <p className="text-xs text-gray-500 mb-4">Cole suas leituras separadas por <b>|</b>. Cada linha será um conjunto. Ex:<br/><br/>
        <code className="bg-purple-50 p-2 rounded text-purple-700 block">Gênesis 1-3 | Salmos 1-2 | Mateus 1-2<br/>Gênesis 4-6 | Salmos 3-4 | Mateus 3-4</code></p>
        
        <textarea 
          className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-purple-200 outline-none resize-none mb-3"
          rows="4" 
          placeholder="Cole seu plano aqui..."
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        ></textarea>
        <button onClick={() => { handlePastePlan(pasteText); setPasteText(''); }} className="w-full bg-purple-100 text-purple-700 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-purple-200 transition-colors">
          <Upload size={18} /> Importar Plano
        </button>
      </section>
    </div>
  );
}

function ProgressoView({ plan }) {
  const stats = useMemo(() => {
    let completedBlocks = 0;
    let completedSets = 0;
    const readDays = new Set();

    plan.forEach(set => {
      let isSetComplete = true;
      set.blocks.forEach(block => {
        if (block.isCompleted) {
          completedBlocks++;
          if (block.completedAt) readDays.add(block.completedAt.split('T')[0]);
        } else {
          isSetComplete = false;
        }
      });
      if (isSetComplete && set.blocks.length > 0) completedSets++;
    });

    return { blocks: completedBlocks, sets: completedSets, activeDays: readDays.size };
  }, [plan]);

  return (
    <div className="space-y-6 animate-fade-in grid grid-cols-2 gap-4">
      <div className="col-span-2 text-center py-6 bg-white rounded-3xl shadow-sm border border-purple-50">
        <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-1">Dias Ativos</h2>
        <p className="text-5xl font-light text-purple-900">{stats.activeDays}</p>
        <p className="text-xs text-gray-400 mt-2">Dias em que você registrou leitura</p>
      </div>

      <div className="bg-purple-50 p-6 rounded-3xl text-center">
        <h3 className="text-2xl font-semibold text-purple-700">{stats.blocks}</h3>
        <p className="text-xs text-purple-400 font-medium uppercase mt-1">Leituras Concluídas</p>
      </div>

      <div className="bg-white p-6 rounded-3xl text-center shadow-sm border border-purple-50">
        <h3 className="text-2xl font-semibold text-gray-700">{stats.sets}</h3>
        <p className="text-xs text-gray-400 font-medium uppercase mt-1">Conjuntos Completos</p>
      </div>
      
      <div className="col-span-2 mt-4 text-center">
        <p className="text-sm text-gray-500 italic">"Lâmpada para os meus pés é tua palavra, e luz para o meu caminho."</p>
      </div>
    </div>
  );
}

// --- UTILITÁRIOS DE UI --- //
const SyncStatus = ({ status }) => {
  const config = {
    loading: { label: 'Carregando...', icon: <Loader2 size={13} className="animate-spin" />, className: 'text-purple-400' },
    saving: { label: 'Salvando...', icon: <Loader2 size={13} className="animate-spin" />, className: 'text-purple-500' },
    saved: { label: 'Dados salvos', icon: <Cloud size={13} />, className: 'text-green-600' },
    offline: { label: 'Sem sincronização — cópia local preservada', icon: <CloudOff size={13} />, className: 'text-amber-600' }
  };

  const current = config[status] || config.loading;

  return (
    <div className={`mt-2 inline-flex items-center gap-1.5 text-xs ${current.className}`}>
      {current.icon}
      <span>{current.label}</span>
    </div>
  );
};

const NavItem = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}>
    {icon} {label}
  </button>
);

const MobileNavItem = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full py-2 transition-colors ${active ? 'text-purple-600' : 'text-gray-400'}`}>
    {icon}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);
