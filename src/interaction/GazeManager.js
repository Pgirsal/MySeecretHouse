import * as THREE from "three";
import { GALLERY, DOOR_MESSAGE, UNICORN_MESSAGE } from "../config/paintings.js";

/**
 * Centre-of-screen gaze detection + single-statement text overlay.
 * Focus requires a dwell (GALLERY.dwellMs) and survives brief losses (graceMs).
 */
export class GazeManager {
  constructor({ camera, paintings = [], door = [], cutouts = [], occluders = [], element }) {
    this.camera = camera;
    this.el = element;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = GALLERY.gazeDistance;
    this.center = new THREE.Vector2(0, 0);
    this.targets = [...paintings, ...door, ...cutouts, ...occluders]; // nearest hit wins => occlusion-safe
    this.doorSet = new Set(door);

    this.focused = null;   // key: painting id | "door" | "unicorn" | null
    this.pending = null;
    this.pendingT = 0;
    this.lostT = 0;

    // overlay animation state (one statement at a time)
    this.shownKey = null;
    this.opacity = 0;
  }

  get focusIsDoor() { return this.focused === "door"; }

  reset() { this.focused = this.pending = null; this.pendingT = this.lostT = 0; }

  _hitKey() {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.center, this.camera);
    const hit = this.raycaster.intersectObjects(this.targets, false)[0];
    if (!hit) return null;
    if (this.doorSet.has(hit.object)) return "door";
    if (hit.object.userData.painting) return hit.object.userData.painting.id;
    const isUnicorn = hit.object.name === "unicorn" || hit.object.userData?.gazeKey === "unicorn";
    if (isUnicorn) {
      // Whisper only when close to the unicorn (within 8.5 units)
      if (hit.distance > 8.5) return null;
      return "unicorn";
    }
    if (hit.object.userData?.gazeKey && hit.object.userData?.gazeText) {
      return hit.object.userData.gazeKey;
    }
    return null;
  }

  _textForKey(key, textFor) {
    if (!key) return "";
    const fromTextFor = textFor ? textFor(key) : "";
    if (fromTextFor) return fromTextFor;
    if (key === "unicorn") return UNICORN_MESSAGE;
    const match = this.targets.find(
      (t) => (t.userData?.gazeKey === key || t.userData?.id === key || t.name === key) && t.userData?.gazeText
    );
    return match?.userData?.gazeText ?? "";
  }

  /** @param active  false during entrance/exit/exterior: gaze is ignored and text fades out */
  update(dt, active, textFor) {
    if (!active) this.reset();
    else {
      const hit = this._hitKey();
      if (hit && hit === this.focused) { this.lostT = 0; this.pending = null; }
      else {
        if (hit && hit === this.pending) {
          this.pendingT += dt * 1000;
          if (this.pendingT >= GALLERY.dwellMs) { this.focused = hit; this.pending = null; this.lostT = 0; }
        } else { this.pending = hit; this.pendingT = 0; }
        if (this.focused && hit !== this.focused) {
          this.lostT += dt * 1000;
          if (this.lostT > GALLERY.graceMs) this.focused = null;
        }
      }
    }
    this._animate(dt, textFor);
  }

  _animate(dt, textFor) {
    const step = dt / (GALLERY.fadeMs / 1000);
    if (this.focused !== this.shownKey) {
      this.opacity -= step;                         // fade previous statement out first
      if (this.opacity <= 0) {
        this.opacity = 0;
        this.shownKey = this.focused;
        const content = this._textForKey(this.shownKey, textFor);
        if (content.includes("<")) {
          this.el.innerHTML = content;
        } else {
          this.el.textContent = content;
        }
        this.el.classList.toggle("door", this.shownKey === "door");
        this.el.classList.toggle("unicorn", this.shownKey === "unicorn");
      }
    } else if (this.shownKey) {
      this.opacity = Math.min(1, this.opacity + step);
    }
    const e = this.opacity * this.opacity * (3 - 2 * this.opacity);
    this.el.style.opacity = e.toFixed(3);
    this.el.style.transform = `translate(-50%, ${((1 - e) * GALLERY.risePX).toFixed(2)}px)`;
    const isInteractive = this.shownKey === "door" || this.shownKey === "unicorn";
    this.el.style.pointerEvents = isInteractive && e > 0.3 ? "auto" : "none";
  }
}

export const gazeText = (paintings, extraTexts = {}) => (key) => {
  if (key === "door") return DOOR_MESSAGE;
  if (key === "unicorn") return extraTexts.unicorn ?? UNICORN_MESSAGE;
  if (extraTexts[key]) return extraTexts[key];
  return paintings.find((p) => p.id === key)?.text ?? "";
};
