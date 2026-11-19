import * as THREE from "three";

/** Hover + click against the exterior house meshes. */
export class InteractionManager {
  constructor({ dom, camera, target, isActive, onEnter }) {
    this.dom = dom;
    this.camera = camera;
    this.target = target;
    this.isActive = isActive;   // () => boolean (EXTERIOR state only)
    this.onEnter = onEnter;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.hovered = false;
    this._dirty = false;

    dom.addEventListener("pointermove", (e) => { this._setNdc(e); this._dirty = true; });
    dom.addEventListener("pointerleave", () => { this._dirty = false; this._setHover(false); });
    dom.addEventListener("click", (e) => {
      if (!this.isActive()) return;
      this._setNdc(e);
      if (this._hit()) { this._setHover(false); this.onEnter(); }
    });
  }

  _setNdc(e) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _hit() {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.intersectObject(this.target, true).length > 0;
  }

  _setHover(v) {
    this.hovered = v;
    this.dom.style.cursor = v ? "pointer" : "default";
  }

  /** Raycast once per frame (house rotates under a stationary pointer). */
  update() {
    if (!this.isActive()) { if (this.hovered) this._setHover(false); return; }
    if (this._dirty || this.hovered) this._setHover(this._hit());
  }
}
