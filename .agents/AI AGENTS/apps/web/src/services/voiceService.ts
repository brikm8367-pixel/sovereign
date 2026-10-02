export type VoiceStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'EXECUTING' | 'SPEAKING' | 'ERROR';

export type VoiceOptions = {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResult = {
  isFinal?: boolean;
  [index: number]: SpeechRecognitionAlternative | undefined;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export class VoiceService {
  private recognition: SpeechRecognitionLike | null = null;
  private status: VoiceStatus = 'IDLE';
  private listeners = new Set<(status: VoiceStatus) => void>();
  private transcriptListeners = new Set<(text: string) => void>();
  private currentResultResolver: ((value: string) => void) | null = null;
  private currentResultRejecter: ((reason?: unknown) => void) | null = null;
  private currentTranscript = '';

  subscribe(listener: (status: VoiceStatus) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onTranscript(listener: (text: string) => void) {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  getStatus() {
    return this.status;
  }

  isSupported() {
    return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  private updateStatus(nextStatus: VoiceStatus) {
    this.status = nextStatus;
    this.listeners.forEach((listener) => listener(nextStatus));
  }

  private emitTranscript(text: string) {
    this.transcriptListeners.forEach((listener) => listener(text));
  }

  private getRecognition() {
    if (this.recognition) return this.recognition;

    const RecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      throw new Error('Speech recognition is not available in this browser.');
    }

    this.recognition = new RecognitionCtor();
    this.recognition.lang = 'ar-DZ';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => {
          const alternatives = Array.from(result as ArrayLike<SpeechRecognitionAlternative>);
          return alternatives.map((alternative) => alternative?.transcript ?? '').join(' ');
        })
        .join(' ')
        .trim();

      this.currentTranscript = transcript;
      this.emitTranscript(transcript);

      const lastResult = event.results[event.results.length - 1];
      if (this.currentResultResolver && lastResult && Boolean(lastResult.isFinal)) {
        const finalText = transcript.trim();
        this.currentResultResolver(finalText);
        this.currentResultResolver = null;
        this.currentResultRejecter = null;
      }
    };

    this.recognition.onerror = (event) => {
      const errorMessage = `Speech recognition failed: ${event.error}`;
      this.updateStatus('ERROR');
      if (this.currentResultRejecter) {
        this.currentResultRejecter(new Error(errorMessage));
        this.currentResultResolver = null;
        this.currentResultRejecter = null;
      }
    };

    this.recognition.onend = () => {
      if (this.currentResultResolver && this.currentTranscript.trim()) {
        const finalText = this.currentTranscript.trim();
        this.currentResultResolver(finalText);
        this.currentResultResolver = null;
        this.currentResultRejecter = null;
      }

      if (this.status === 'LISTENING') {
        this.updateStatus('IDLE');
      }
    };

    return this.recognition;
  }

  startListening(options: VoiceOptions = {}) {
    if (!this.isSupported()) {
      throw new Error('Microphone speech recognition is not supported in this browser.');
    }

    const recognition = this.getRecognition();
    recognition.lang = options.lang ?? 'ar-DZ';
    recognition.continuous = options.continuous ?? false;
    recognition.interimResults = options.interimResults ?? true;

    this.currentTranscript = '';
    this.updateStatus('LISTENING');
    recognition.start();
  }

  stopListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        resolve('');
        return;
      }

      this.currentResultResolver = resolve;
      this.currentResultRejecter = reject;
      this.updateStatus('PROCESSING');
      this.recognition.stop();
    });
  }

  async transcribe(options?: VoiceOptions): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('Microphone speech recognition is not available.');
    }

    const transcript = await new Promise<string>((resolve, reject) => {
      this.currentResultResolver = resolve;
      this.currentResultRejecter = reject;
      this.startListening(options);
    });

    return transcript.trim();
  }

  cancel() {
    if (this.recognition) {
      this.recognition.abort();
    }
    this.currentResultResolver = null;
    this.currentResultRejecter = null;
    this.currentTranscript = '';
    this.updateStatus('IDLE');
  }
}
