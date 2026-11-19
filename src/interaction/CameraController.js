import * as THREE from "three";

import { EYE_HEIGHT, CAMERA_RADIUS as RADIUS, WALK_SPEED as SPEED } from "../config/house.js";
const PITCH_LIMIT = THREE.MathUtils.degToRad(75);

const KEYS = {
  KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b",
  KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r"
};

/** Custom first-person controller: pointer lock (desktop) or drag-to-look + virtual stick (touch). */
export class CameraController {
  constructor(camera, dom, { floorY, bounds, obstacles }) {
    this.camera = camera;
    this.dom = dom;
    this.floorY = floorY;
    this.bounds = bounds;
    this.obstacles = obstacles;
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };      // x right, y forward, -1..1
    this.velocity = new THREE.Vector2();
    this.locked = false;
    this.drag = null;

    window.addEventListener("keydown", (e) => { if (this.enabled && KEYS[e.code]) { this.keys.add(KEYS[e.code]); e.preventDefault(); } });
    window.addEventListener("keyup", (e) => { if (KEYS[e.code]) this.keys.delete(KEYS[e.code]); });
    window.addEventListener("blur", () => this.keys.clear());

    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === dom; });
    document.addEventListener("mousemove", (e) => {
      if (this.enabled && this.locked) this._look(e.movementX, e.movementY, 0.0022);
    });

    dom.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType };
    });
    window.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d || !this.enabled || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
      if (!this.locked) this._look(dx, dy, d.type === "touch" ? 0.005 : 0.004);
    });
    const end = (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (this.enabled && d.type === "mouse" && d.moved < 6 && !this.locked) this.requestLock();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", () => { this.drag = null; });
  }

  _look(dx, dy, k) {
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -PITCH_LIMIT, PITCH_LIMIT);
  }

  requestLock() {
    try {
      const p = this.dom.requestPointerLock && this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* drag-to-look remains available */ }
  }

  /** Take over from the entrance animation, inheriting the camera's current orientation. */
  enable() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = e.y;
    this.pitch = THREE.MathUtils.clamp(e.x, -PITCH_LIMIT, PITCH_LIMIT);
    this.velocity.set(0, 0);
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.keys.clear();
    this.stick.x = this.stick.y = 0;
    this.drag = null;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    let ix = this.stick.x + ((k.has("r") ? 1 : 0) - (k.has("l") ? 1 : 0));
    let iy = this.stick.y + ((k.has("f") ? 1 : 0) - (k.has("b") ? 1 : 0));
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = (ix * cos - iy * sin) * SPEED;   // right = (cos,0,-sin), forward = (-sin,0,-cos)
    const tz = (-ix * sin - iy * cos) * SPEED;
    const a = 1 - Math.exp(-dt * 8);
    this.velocity.x += (tx - this.velocity.x) * a;
    this.velocity.y += (tz - this.velocity.y) * a;

    const p = this.camera.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.y * dt;
    this._collide(p);
    p.y = this.floorY + EYE_HEIGHT;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  _collide(p) {
    const { halfW, halfD } = this.bounds;
    for (const o of this.obstacles) {
      const cx = THREE.MathUtils.clamp(p.x, o.minX, o.maxX);
      const cz = THREE.MathUtils.clamp(p.z, o.minZ, o.maxZ);
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS; }
        else p.x = o.minX - RADIUS;
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, -halfW + RADIUS, halfW - RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, -halfD + RADIUS, halfD - RADIUS);
  }
}
