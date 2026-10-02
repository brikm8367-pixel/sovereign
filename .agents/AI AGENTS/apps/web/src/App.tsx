import { useEffect, useState } from 'react';
import { SpeechOutputService } from './services/speechOutputService';
import { VoiceService, type VoiceStatus } from './services/voiceService';
import { WakeWordService } from './services/wakeWordService';

const voiceService = new VoiceService();
const speechOutput = new SpeechOutputService();
const wakeWordService = new WakeWordService();

function App() {
  const [status, setStatus] = useState<VoiceStatus>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [handsFree, setHandsFree] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const unsubscribe = voiceService.subscribe((nextStatus) => {
      setStatus(nextStatus);
      setIsListening(nextStatus === 'LISTENING');
    });

    const unsubscribeTranscript = voiceService.onTranscript((text) => {
      setTranscript(text || '...');
    });

    return () => {
      unsubscribe();
      unsubscribeTranscript();
    };
  }, []);

  const handleVoiceCommand = async () => {
    try {
      setStatus('LISTENING');
      const text = await voiceService.transcribe({ lang: 'ar-DZ', continuous: false, interimResults: true });

      if (!text) {
        speechOutput.speak('لم أفهمك، أعد المحاولة.');
        setStatus('ERROR');
        return;
      }

      setTranscript(text);
      setStatus('PROCESSING');

      const response = await fetch('http://localhost:4000/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Agent request failed');
      }

      const executionSummary = payload.executionSummary ?? 'تم تنفيذ الطلب.';
      speechOutput.speak(executionSummary);
      setStatus('SPEAKING');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'لم أتمكن من الاستماع.';
      setTranscript(message);
      setStatus('ERROR');
      speechOutput.speak('الميكروفون غير متاح.');
    }
  };

  const handleToggleListening = async () => {
    if (isListening) {
      try {
        const finalText = await voiceService.stopListening();
        setTranscript(finalText);
        setStatus('PROCESSING');
      } catch {
        setStatus('ERROR');
      }
      return;
    }

    try {
      voiceService.startListening({ lang: 'ar-DZ', continuous: false, interimResults: true });
      setIsListening(true);
      setStatus('LISTENING');
    } catch (error) {
      setStatus('ERROR');
      speechOutput.speak('الميكروفون غير متاح.');
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8">
        <header className="mb-8 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Personal AI Agent</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Voice-first Assistant</h1>
          </div>
          <div className="rounded-full border border-emerald-700 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
            {status}
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-8">
          <div className="w-full rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-violet-950/30">
            <div className="flex flex-col items-center justify-center gap-5 text-center">
              <button
                onClick={handleToggleListening}
                className={`flex h-40 w-40 items-center justify-center rounded-full border-4 text-5xl shadow-lg transition-all duration-200 ${
                  isListening
                    ? 'border-rose-500 bg-rose-500/20 text-rose-300 shadow-rose-500/40'
                    : 'border-violet-500 bg-violet-500/15 text-violet-300 hover:scale-105 hover:bg-violet-500/20'
                }`}
                aria-label="Voice input"
              >
                🎙️
              </button>

              <div className="space-y-2">
                <p className="text-2xl font-semibold text-white">{isListening ? 'أسمعك...' : 'اضغط وتكلم'}</p>
                <p className="text-sm text-slate-400">{status === 'LISTENING' ? 'Listening' : status === 'PROCESSING' ? 'Processing' : status === 'EXECUTING' ? 'Executing' : status === 'SPEAKING' ? 'Speaking' : 'Ready'}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleVoiceCommand}
                  className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                >
                  Start Voice Command
                </button>
                <button
                  onClick={() => {
                    voiceService.cancel();
                    speechOutput.stop();
                    setStatus('IDLE');
                    setIsListening(false);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Voice Transcript</h2>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300">{status}</span>
              </div>
              <div className="min-h-28 rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-200">
                {transcript || '...'}
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Agent Status</h2>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Microphone</p>
                  <p className="mt-2 font-medium text-white">{isListening ? 'Listening' : 'Ready'}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Hands-Free</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="font-medium text-white">{handsFree ? 'On' : 'Off'}</p>
                    <button
                      onClick={() => setHandsFree((value) => !value)}
                      className="rounded-full border border-violet-500 bg-violet-500/10 px-2 py-1 text-xs text-violet-200"
                    >
                      {handsFree ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Wake Word</p>
                  <p className="mt-2 font-medium text-white">{wakeWordService.isEnabled() ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
