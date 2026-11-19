import * as THREE from "three";

/**
 * Loads every distinct video once, wraps it in one shared VideoTexture, and
 * crops it per-surface via UV mapping ("cover" fit, original aspect preserved).
 *
 * Surface geometries carry a `local` attribute (surface-space coords) and
 * userData.size {w,h}; UVs are derived from those + the video's aspect ratio.
 */
export class VideoTextureManager {
  constructor({ baseUrl = "", onNotice = () => { } } = {}) {
    this.baseUrl = baseUrl;
    this.onNotice = onNotice;
    this.entries = new Map();   // key -> entry
    this.materials = new Map(); // key -> material
    this.surfaces = [];         // {geometry, entry}
    this.unlocked = false;
    this._fallbackTexture = null;
    this._installUnlock();
  }

  _normalize(spec) {
    const list = Array.isArray(spec) ? spec : [spec];
    return list.map((s) => (/^(https?:|\/|data:|blob:)/.test(s) ? s : this.baseUrl + s));
  }

  get(spec) {
    const sources = this._normalize(spec);
    const key = sources.join("|");
    let entry = this.entries.get(key);
    if (entry) return entry;

    if (isImage(sources[0])) {
      const loader = new THREE.TextureLoader();
      const texture = loader.load(
        sources[0],
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const img = tex.image;
          if (img && img.width && img.height) {
            entry.aspect = img.width / img.height;
            this._reapply(entry);
            entry.listeners.forEach((cb) => cb(entry.aspect));
          }
        },
        undefined,
        () => this._onError(entry)
      );
      texture.colorSpace = THREE.SRGBColorSpace;

      entry = { key, sources, index: 0, video: null, texture, aspect: 16 / 9, failed: false, materials: [], listeners: [] };
      this.entries.set(key, entry);
      return entry;
    }

    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.crossOrigin = "anonymous";
    video.preload = "auto";

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    entry = { key, sources, index: 0, video, texture, aspect: 16 / 9, failed: false, materials: [], listeners: [] };
    this.entries.set(key, entry);

    video.addEventListener("loadedmetadata", () => {
      if (video.videoWidth && video.videoHeight) {
        entry.aspect = video.videoWidth / video.videoHeight;
        this._reapply(entry);
        entry.listeners.forEach((cb) => cb(entry.aspect));
      }
    });
    video.addEventListener("error", () => this._onError(entry));
    video.addEventListener("canplay", () => this._play(entry));

    video.src = sources[0];
    video.load();
    this._play(entry);
    return entry;
  }

  _onError(entry) {
    if (entry.index < entry.sources.length - 1) {
      entry.index++;
      if (entry.video) {
        entry.video.src = entry.sources[entry.index];
        entry.video.load();
      } else {
        const loader = new THREE.TextureLoader();
        loader.load(
          entry.sources[entry.index],
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            entry.texture.image = tex.image;
            entry.texture.needsUpdate = true;
            const img = tex.image;
            if (img && img.width && img.height) {
              entry.aspect = img.width / img.height;
              this._reapply(entry);
              entry.listeners.forEach((cb) => cb(entry.aspect));
            }
          },
          undefined,
          () => this._onError(entry)
        );
      }
      return;
    }
    entry.failed = true;
    console.warn("[media] failed to load:", entry.sources.join(", "));
    this.onNotice(`media unavailable: ${entry.sources[0]}`);
    const fb = this._getFallback();
    entry.materials.forEach((m) => { m.map = fb; m.needsUpdate = true; });
  }

  _getFallback() {
    if (!this._fallbackTexture) {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#d8d5ce";
      ctx.fillRect(0, 0, 2, 2);
      this._fallbackTexture = new THREE.CanvasTexture(c);
      this._fallbackTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return this._fallbackTexture;
  }

  _play(entry) {
    if (!entry.video || entry.failed || !entry.video.paused) return;
    const p = entry.video.play();
    if (p && p.catch) p.catch(() => { /* blocked until user gesture; retried in unlock */ });
  }

  _installUnlock() {
    const unlock = () => {
      this.unlocked = true;
      this.playAll();
      ["pointerdown", "keydown", "touchend", "click"].forEach((e) => window.removeEventListener(e, unlock, true));
    };
    ["pointerdown", "keydown", "touchend", "click"].forEach((e) => window.addEventListener(e, unlock, true));
  }

  playAll() { this.entries.forEach((e) => this._play(e)); }
  pauseAll() { this.entries.forEach((e) => { if (e.video) e.video.pause(); }); }
  markTexturesDirty() { this.entries.forEach((e) => { e.texture.needsUpdate = true; }); }

  /** Shared material per (video, options). */
  getMaterial(spec, { transparent = false, opacity = 1 } = {}) {
    if (isColor(spec)) {  // "#rrggbb" => flat colour block, no video
      const key = `color:${spec}`;
      if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshBasicMaterial({ color: spec, side: THREE.FrontSide, toneMapped: false }));
      return this.materials.get(key);
    }
    const entry = this.get(spec);
    const key = `${entry.key}#${transparent}#${opacity}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: entry.failed ? this._getFallback() : entry.texture,
        side: THREE.FrontSide,
        toneMapped: false,
        transparent,
        opacity,
        depthWrite: !transparent
      });
      entry.materials.push(m);
      this.materials.set(key, m);
    }
    return m;
  }

  /** Calls cb(aspect) now and whenever the real aspect becomes known. */
  watchAspect(spec, cb) {
    const entry = this.get(spec);
    entry.listeners.push(cb);
    cb(entry.aspect);
  }

  registerSurface(geometry, spec) {
    if (isColor(spec)) return;
    const entry = this.get(spec);
    this.surfaces.push({ geometry, entry });
    applyCoverUV(geometry, entry.aspect);
  }

  _reapply(entry) {
    for (const s of this.surfaces) if (s.entry === entry) applyCoverUV(s.geometry, entry.aspect);
  }
}

export const isColor = (spec) => typeof spec === "string" && spec.startsWith("#");
export const isImage = (spec) => typeof spec === "string" && /\.(jpe?g|png|webp|avif)($|\?)/i.test(spec);

/** Cover-fit crop of a video of `aspect` onto a surface; v up, u right as seen by the viewer. */
export function applyCoverUV(geometry, aspect) {
  const { w, h } = geometry.userData.size;
  const local = geometry.attributes.local;
  const uv = geometry.attributes.uv;
  const sa = w / h;
  let ur = 1, vr = 1;
  if (sa > aspect) vr = aspect / sa; else ur = sa / aspect;
  for (let i = 0; i < local.count; i++) {
    uv.setXY(i, 0.5 + (local.getX(i) / w - 0.5) * ur, 0.5 + (local.getY(i) / h - 0.5) * vr);
  }
  uv.needsUpdate = true;
}
