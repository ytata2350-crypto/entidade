/** Dispara uma vez ao cruzar cada prazo observado; não avisa prazos já vencidos ao abrir a página. */
export class ReadinessClock {
  constructor() { this.scope = null; this.waits = new Map(); }

  observe(scope, entries, now) {
    if (scope !== this.scope) { this.scope = scope; this.waits.clear(); }
    const current = new Set(), ready = [];
    for (const entry of entries) {
      if (!Number.isFinite(entry.until) || entry.until <= 0) continue;
      current.add(entry.key);
      let wait = this.waits.get(entry.key);
      if (!wait || wait.until !== entry.until) {
        wait = { until: entry.until, armed: entry.until > now, announced: false };
        this.waits.set(entry.key, wait);
      }
      if (wait.armed && !wait.announced && now >= wait.until) {
        wait.announced = true; ready.push(entry);
      }
    }
    for (const key of this.waits.keys()) if (!current.has(key)) this.waits.delete(key);
    return ready;
  }
}

/** Síntese local e curta; o áudio só é preparado depois de uma interação no site. */
export class ReadySound {
  constructor() {
    this.enabled = true;
    try { this.enabled = localStorage.getItem('limiar:ready-sound') !== 'off'; } catch { /* preferência desta sessão */ }
  }
  prepare() {
    if (!this.enabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      this.context ||= new Audio();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* O aviso visual continua disponível se o navegador bloquear áudio. */ }
  }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('limiar:ready-sound', this.enabled ? 'on' : 'off'); } catch { /* preferência desta sessão */ }
    if (this.enabled) this.prepare();
  }
  play() {
    if (!this.enabled || this.context?.state !== 'running') return;
    const ctx = this.context, start = ctx.currentTime;
    const tone = ctx.createOscillator(), volume = ctx.createGain();
    tone.type = 'sine'; tone.frequency.setValueAtTime(660, start);
    tone.frequency.exponentialRampToValueAtTime(990, start + .075);
    volume.gain.setValueAtTime(0, start);
    volume.gain.linearRampToValueAtTime(.045, start + .012);
    volume.gain.exponentialRampToValueAtTime(.001, start + .19);
    tone.connect(volume); volume.connect(ctx.destination);
    tone.onended = () => { tone.disconnect(); volume.disconnect(); };
    tone.start(start); tone.stop(start + .2);
  }
}
