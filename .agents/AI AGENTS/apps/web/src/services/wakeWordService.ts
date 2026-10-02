export class WakeWordService {
  private enabled = false;

  isEnabled() {
    return this.enabled;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  async detect(_audioInput: unknown) {
    return this.enabled ? { detected: false, reason: 'Wake word is not configured.' } : { detected: false, reason: 'Disabled' };
  }
}
