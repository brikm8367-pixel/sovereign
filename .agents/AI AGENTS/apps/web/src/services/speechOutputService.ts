export class SpeechOutputService {
  private readonly speech = window.speechSynthesis;

  speak(text: string) {
    if (!this.speech) {
      return;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-DZ';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    this.speech.speak(utterance);
  }

  stop() {
    if (this.speech) {
      this.speech.cancel();
    }
  }

  pause() {
    this.speech?.pause();
  }

  resume() {
    this.speech?.resume();
  }
}
