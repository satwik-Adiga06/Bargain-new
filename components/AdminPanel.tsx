
import React, { useState } from 'react';

interface AdminPanelProps {
  onSendAdminMessage: (text: string) => void;
  isActive: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onSendAdminMessage, isActive }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSendAdminMessage(text);
      setText('');
    }
  };

  if (!isActive) return null;

  return (
    <div className="fixed bottom-24 right-6 w-80 bg-slate-900 border border-red-500/50 rounded-xl shadow-2xl p-4 z-50 animate-in slide-in-from-right-10 duration-300">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
        <h4 className="text-red-400 font-bold text-xs uppercase tracking-widest">Developer Takeover</h4>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type what the AI should say..."
          className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-red-500/50 resize-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors"
        >
          INJECT INTO VOICE STREAM
        </button>
      </form>
      <p className="mt-2 text-[10px] text-slate-500 italic">
        * The AI will parrot this text exactly in its chosen voice and resume its persona.
      </p>
    </div>
  );
};

export default AdminPanel;
