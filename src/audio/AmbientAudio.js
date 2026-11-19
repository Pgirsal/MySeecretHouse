export class AmbientAudio {
  constructor(button, source) {
    this.button = button;
    this.audio = new Audio(source);
    this.audio.loop = true;
    this.audio.volume = 0.35;
    this.wanted = true;

    button.addEventListener("click", () => {
      if (this.audio.paused) this.play();
      else this.pause();
    });
    this.audio.addEventListener("playing", () => this._updateButton());
    this.audio.addEventListener("pause", () => this._updateButton());
    this.audio.addEventListener("error", () => {
      button.setAttribute("aria-label", "Audio unavailable");
      button.disabled = true;
    });

    this.play();
  }

  play() {
    this.wanted = true;
    this._updateButton();
    this.audio.play().catch(() => this._updateButton());
  }

  pause() {
    this.wanted = false;
    this.audio.pause();
    this._updateButton();
  }

  suspend() {
    this.audio.pause();
  }

  resume() {
    if (this.wanted) this.play();
  }

  _updateButton() {
    if (this.button.disabled) return;
    const playing = !this.audio.paused;
    this.button.setAttribute("aria-pressed", String(playing));
    this.button.querySelector(".audio-on").hidden = !playing;
  }
}