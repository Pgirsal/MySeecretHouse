import * as THREE from "three";
import { HOUSE_DIMS } from "../config/house.js";
import { UNICORN_MESSAGE } from "../config/paintings.js";
import { AnimatedGifTexture } from "./GifTexture.js";

/**
 * Creates decorative 2D cutouts that sit in corners of the room
 * and perform cylindrical billboarding (always face camera around world Y-axis).
 * Supports both static textures (e.g. PNG) and animated textures (e.g. GIF).
 */
export class DecorativeCutouts {
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    this.group = new THREE.Group();
    this.group.name = "decorative-cutouts";
    this.items = [];
    this.animatedTextures = [];

    const loader = new THREE.TextureLoader();
    const hw = HOUSE_DIMS.width / 2; // 8
    const hd = HOUSE_DIMS.depth / 2; // 8

    // Opposite corners, tucked in with safe margin from walls
    // Room spans X: [-8, 8], Z: [-8, 8], Y from floor (0) upwards.
    // Margin of 2.6 keeps them well clear of the walls and painting planes
    const cornerMargin = 2.6;
    const configs = [
      {
        name: "unicorn",
        url: "vids/extras/unicorn.gif",
        targetHeight: 2.4,
        // Front-left corner
        pos: new THREE.Vector3(-hw + cornerMargin, 0, hd - cornerMargin),
        text: UNICORN_MESSAGE
      },
      {
        name: "silla-2",
        url: "vids/extras/silla.png",
        targetHeight: 2.4,
        // Opposite back-right corner
        pos: new THREE.Vector3(hw - cornerMargin, 0, -hd + cornerMargin)
      }
    ];

    for (const cfg of configs) {
      // Create independent geometry for each mesh to avoid shared state
      const geom = new THREE.PlaneGeometry(1, 1);
      geom.translate(0, 0.5, 0);

      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        alphaTest: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false, // Prevents transparent cutout sorting issues with other transparent surfaces
        toneMapped: false,
        visible: false // Hidden by default, only shown once texture loads successfully
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = cfg.name;
      mesh.position.copy(cfg.pos);
      mesh.scale.set(cfg.targetHeight, cfg.targetHeight, 1);
      mesh.renderOrder = 3; // Render after walls and paintings
      mesh.visible = false;
      mesh.userData = {
        id: cfg.name,
        gazeKey: cfg.name,
        gazeText: cfg.text || null
      };

      if (/\.gif($|\?)/i.test(cfg.url)) {
        const gifTex = new AnimatedGifTexture();
        this.animatedTextures.push(gifTex);

        gifTex
          .load(cfg.url)
          .then(() => {
            mat.map = gifTex.texture;
            mat.visible = true;
            mat.needsUpdate = true;
            mesh.visible = true;
            const h = cfg.targetHeight;
            const w = h * gifTex.aspect;
            mesh.scale.set(w, h, 1);
          })
          .catch((err) => {
            console.warn("[DecorativeCutouts] Error loading GIF texture:", cfg.url, err);
            mat.visible = false;
            mesh.visible = false;
          });
      } else {
        loader.load(
          cfg.url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex;
            mat.visible = true; // Show only upon successful load
            mat.needsUpdate = true;
            mesh.visible = true;
            const img = tex.image;
            if (img && img.width && img.height) {
              const aspect = img.width / img.height;
              const h = cfg.targetHeight;
              const w = h * aspect;
              mesh.scale.set(w, h, 1);
            }
          },
          undefined,
          (err) => {
            console.warn("[DecorativeCutouts] Error loading texture:", cfg.url, err);
            mat.visible = false;
            mesh.visible = false;
          }
        );
      }

      this.group.add(mesh);
      this.items.push(mesh);
    }

    // Add directly to houseInner so positions are in house local coordinates (floor at y = 0)
    sceneMgr.houseInner.add(this.group);
  }

  /**
   * Updates animated textures and rotates cutouts around the Y-axis
   * to face the active camera's world position (cylindrical billboarding).
   */
  update(camera) {
    const now = performance.now();
    for (const anim of this.animatedTextures) {
      anim.update(now);
    }

    const camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos);

    const itemWorldPos = new THREE.Vector3();
    for (const item of this.items) {
      item.getWorldPosition(itemWorldPos);
      // Cylindrical: match Y to item's own Y so rotation is purely around the world Y-axis
      const targetWorld = new THREE.Vector3(camWorldPos.x, itemWorldPos.y, camWorldPos.z);
      item.lookAt(targetWorld);
      item.updateMatrixWorld();
    }
  }

  dispose() {
    for (const anim of this.animatedTextures) {
      anim.dispose();
    }
    this.animatedTextures = [];
  }
}
