
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AppState, Product, Message } from './types';
import { PRODUCTS, SYSTEM_INSTRUCTION } from './constants';
import ProductCard from './components/ProductCard';
import AdminPanel from './components/AdminPanel';
import { decode, decodeAudioData, createPcmBlob } from './services/audioHandler';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SELECTING_ITEMS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [currentInputText, setCurrentInputText] = useState('');
  const [currentOutputText, setCurrentOutputText] = useState('');

  // Audio & API Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedProducts = PRODUCTS.filter(p => selectedIds.includes(p.id));

  // Auto-scroll Ledger
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, currentInputText, currentOutputText]);

  const toggleProduct = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleStartNegotiation = async () => {
    if (selectedIds.length === 0) return;
    setIsConnecting(true);
    setAppState(AppState.NEGOTIATING);

    // Build dynamic system instruction with initial context
    const itemNames = selectedProducts.map(p => p.name).join(", ");
    const totalVal = selectedProducts.reduce((a, b) => a + b.price, 0);
    const dynamicInstruction = `${SYSTEM_INSTRUCTION}\n\nCONTEXT: User is negotiating for: ${itemNames}. Total list value: $${totalVal}. Greet them and deploy an 'Extreme Demand' strategy.`;

    try {
      // Create fresh instance for updated API key access
      const ai = new GoogleGenAI({ apiKey: "AIzaSyDBWeHx3-7CWoG9Df7SUTrkbWU8c0it7qM" });


      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Voice link established');
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (e) => {
              if (isMuted) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              // CRITICAL: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
            setIsConnecting(false);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // TTS Audio Handling - using PCM raw bytes as per guidelines
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // 2. Real-time Transcription
            if (msg.serverContent?.outputTranscription) {
              setCurrentOutputText(prev => prev + msg.serverContent!.outputTranscription!.text);
            } else if (msg.serverContent?.inputTranscription) {
              setCurrentInputText(prev => prev + msg.serverContent!.inputTranscription!.text);
            }

            // 3. FIX: Turn Completion (Moves text to permanent WhatsApp list)
            if (msg.serverContent?.turnComplete) {
              // Use the values directly from the state variables at this moment
              setMessages(prev => {
                const newHistory = [...prev];

                // If there's user text, add it as a permanent bubble
                if (currentInputText.trim()) {
                  newHistory.push({ role: 'user', text: currentInputText, timestamp: Date.now() });
                }

                // If there's bot text, add it as a permanent bubble
                if (currentOutputText.trim()) {
                  newHistory.push({ role: 'model', text: currentOutputText, timestamp: Date.now() });
                }

                return newHistory;
              });

              // CRITICAL: Clear the "Live" text so it doesn't stay stuck in the processing box
              setCurrentInputText('');
              setCurrentOutputText('');
            }

            // Interruption Cleanup
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session Error:', e);
            setIsConnecting(false);
          },
          onclose: () => console.log('Session Closed')
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
          },
          systemInstruction: dynamicInstruction
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Handshake failed:', err);
      setIsConnecting(false);
      setAppState(AppState.SELECTING_ITEMS);
    }
  };

  const injectAdminMessage = (text: string) => {
    // Note: session.send is the underlying method for non-media client messages.
    // In Live API, developer overrides via text rely on the model interpreting systemic prompts.
    if (sessionRef.current) {
      (sessionRef.current as any).send?.({
        clientContent: {
          turns: [{ parts: [{ text: `SYSTEM_OVERRIDE: ${text}` }] }]
        }
      });
      setMessages(prev => [...prev, { role: 'admin', text, timestamp: Date.now() }]);
    }
  };

  const endSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setAppState(AppState.SELECTING_ITEMS);
    setMessages([]);
    setSelectedIds([]);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 min-h-screen flex flex-col font-sans selection:bg-cyan-500/30 bg-slate-950">
      {/* Header */}
      <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-cyan-600 rounded-xl flex items-center justify-center shadow-[0_0_25px_rgba(8,145,178,0.4)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-100 italic uppercase leading-none">Bargain<span className="text-cyan-400">Bot</span></h1>
            <p className="text-[9px] text-slate-500 font-mono tracking-widest mt-1 uppercase">Bazaar Protocol :: Live-Link v2.5.1</p>
          </div>
        </div>

        {appState === AppState.NEGOTIATING && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAdminMode(!isAdminMode)}
              className={`px-5 py-2 rounded-full text-[10px] font-black tracking-widest transition-all border ${isAdminMode ? 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
            >
              {isAdminMode ? 'TAKEOVER ACTIVE' : 'DEV ACCESS'}
            </button>
            <button
              onClick={endSession}
              className="px-6 py-2 bg-slate-100 hover:bg-white text-slate-950 rounded-full text-xs font-black transition-all shadow-xl active:scale-95"
            >
              EXIT BAZAAR
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col">
        {appState === AppState.SELECTING_ITEMS && (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="mb-12 text-center">
              <h2 className="text-5xl font-black mb-4 text-slate-50 tracking-tight leading-tight">Secure the Inventory</h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">Negotiate for the rarest items in the sector. Fenrir is waiting for your first mistake.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              {PRODUCTS.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isSelected={selectedIds.includes(product.id)}
                  onToggle={toggleProduct}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-6">
              <button
                disabled={selectedIds.length === 0}
                onClick={handleStartNegotiation}
                className="group relative px-20 py-6 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-2xl rounded-2xl transition-all disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed shadow-[0_25px_60px_-15px_rgba(6,182,212,0.4)] active:scale-95 overflow-hidden"
              >
                <span className="relative z-10 tracking-tighter">OPEN VOICE-LINK</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
              <div className="flex items-center gap-2 text-slate-600">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em]">Biometric Auth (Mic) Required</p>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
              </div>
            </div>
          </div>
        )}

        {appState === AppState.NEGOTIATING && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 animate-in fade-in zoom-in-95 duration-500">

            {/* Sidebar Stats */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-6 flex justify-between items-center">
                  Manifest Data
                  <span className="text-cyan-500 animate-pulse">●</span>
                </h3>
                <div className="space-y-4 relative z-10">
                  {selectedProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/30 transition-all group/item">
                      <div className="w-12 h-12 rounded-xl overflow-hidden grayscale group-hover/item:grayscale-0 transition-all">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-200 text-xs tracking-tight">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">₹{p.price} MRSP</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Total Valuation</span>
                    <span className="text-3xl font-black text-white font-mono tracking-tighter shadow-cyan-500/20">
                      ₹{selectedProducts.reduce((acc, p) => acc + p.price, 0)}
                    </span>
                  </div>
                  <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/50">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-500">PROFIT THRESHOLD</span>
                      <span className="text-cyan-500 font-mono">70% MIN</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-cyan-500 h-full w-[70%]" style={{ boxShadow: '0 0 10px #06b6d4' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-5 border-l-2 border-l-cyan-500/50">
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  <span className="text-cyan-500 font-bold block mb-1">STRATEGY INTEL:</span>
                  "The Merchant respects a hard bargainer. If he uses 'Extreme Demands', counter with your own baseline. Don't show fear."
                </p>
              </div>
            </div>

            {/* Main Voice & Chat */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {isConnecting ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/10 rounded-[2rem] border-2 border-dashed border-slate-800">
                  <div className="w-24 h-24 relative mb-8">
                    <div className="absolute inset-0 border-8 border-slate-800 rounded-full"></div>
                    <div className="absolute inset-0 border-t-8 border-cyan-500 rounded-full animate-spin"></div>
                  </div>
                  <h3 className="text-2xl font-black text-slate-300 tracking-tighter uppercase italic animate-pulse">Syncing Neural-Link...</h3>
                </div>
              ) : (
                <>
                  {/* Voice Interface */}
                  <div className="bg-slate-900/40 rounded-[2rem] border border-slate-800 p-10 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-30"></div>

                    <div className="relative group">
                      <div className={`absolute inset-0 blur-[60px] rounded-full transition-all duration-1000 ${isMuted ? 'bg-red-500/5 opacity-0' : 'bg-cyan-500/10 opacity-40 animate-pulse'
                        }`}></div>
                      <div className={`relative w-56 h-56 rounded-full border-2 flex flex-col items-center justify-center bg-slate-950 transition-all duration-700 ${isMuted
                        ? 'border-slate-800 opacity-40 grayscale scale-90'
                        : 'border-cyan-500 shadow-[0_0_100px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20'
                        }`}>
                        <div className={`transition-all duration-500 ${!isMuted ? 'scale-110' : ''}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-24 w-24 ${isMuted ? 'text-slate-700' : 'text-cyan-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div className="mt-4 flex gap-1 h-4 items-center">
                          {!isMuted && [1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="w-1 bg-cyan-500 rounded-full animate-bounce" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}></div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 flex flex-col items-center gap-6">
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`group px-12 py-4 rounded-2xl flex items-center gap-4 transition-all border-2 ${isMuted ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700 shadow-xl'
                          }`}
                      >
                        <div className={`w-3 h-3 rounded-full ${isMuted ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]'}`}></div>
                        <span className="text-xs font-black tracking-[0.4em] uppercase">{isMuted ? 'Link Muted' : 'Link Active'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Ledger / Transcription */}
                  <div className="flex flex-col h-[500px] bg-slate-950 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                      <span className="text-[10px] font-black text-cyan-500 tracking-widest">LIVE CONVERSATION LOG</span>
                      <span className="text-[9px] text-slate-500 font-mono">ENCRYPTED_VOICE_LINK</span>
                    </div>

                    {/* WhatsApp-Style Message List */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
                      {/* 1. Permanent History (WhatsApp Bubbles) */}
                      {messages.map((m, idx) => (
                        <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl p-4 ${m.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                            <p className="text-sm">{m.text}</p>
                          </div>
                        </div>
                      ))}

                      {/* 2. Live Feedback (Disappears after turn is done) */}
                      {currentInputText && (
                        <div className="flex justify-end opacity-70">
                          <div className="bg-cyan-900/30 border border-dashed border-cyan-500/50 p-3 rounded-xl">
                            <p className="text-xs italic text-cyan-200">{currentInputText}</p>
                          </div>
                        </div>
                      )}
                      {currentOutputText && (
                        <div className="flex justify-start opacity-70">
                          <div className="bg-slate-800/50 border border-dashed border-slate-600 p-3 rounded-xl">
                            <p className="text-xs italic text-slate-400">{currentOutputText}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <AdminPanel
        isActive={isAdminMode}
        onSendAdminMessage={injectAdminMessage}
      />

      <footer className="mt-12 text-center text-slate-700 text-[10px] font-mono uppercase tracking-widest pb-4 opacity-50">
        <p>Distributive Bargaining Protocol // Harvard Negotiation Research Framework v1.2</p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #020617; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
};

export default App;
