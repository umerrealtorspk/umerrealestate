import React from 'react';
import { CheckCircle, X } from 'lucide-react';

interface QuickToastProps {
  message: string | null;
  onClose: () => void;
}

export const QuickToast: React.FC<QuickToastProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-5 right-5 bg-emerald-500 text-slate-950 font-bold px-4 py-3 rounded-xl shadow-2xl border border-emerald-300 transition-all duration-300 flex items-center gap-2.5 z-50 text-xs sm:text-sm animate-in slide-in-from-bottom-5">
      <CheckCircle className="h-5 w-5 shrink-0" />
      <span className="font-bold">{message}</span>
      <button
        onClick={onClose}
        className="p-1 hover:opacity-75 transition ml-2 cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
