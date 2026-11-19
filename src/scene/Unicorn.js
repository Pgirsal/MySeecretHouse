import * as THREE from "three";
import { UNICORN_MESSAGE } from "../config/paintings.js";
import { AnimatedGifTexture } from "./GifTexture.js";

export { AnimatedGifTexture };

/**
 * Unicorn animated cutout element.
 */
export class Unicorn {
  constructor({
    url = "vids/extras/unicorn.gif",
    targetHeight = 2.4,
    pos = new THREE.Vector3()
  } = {}) {
    this.targetHeight = targetHeight;
    this.gifTexture = new AnimatedGifTexture();

    const geom = new THREE.PlaneGeometry(1, 1);
    geom.translate(0, 0.5, 0);

    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      visible: false
    });

    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.name = "unicorn";
    this.mesh.position.copy(pos);
    this.mesh.scale.set(targetHeight, targetHeight, 1);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.userData = { id: "unicorn", gazeKey: "unicorn", gazeText: UNICORN_MESSAGE };

    this.gifTexture
      .load(url)
      .then(() => {
        this.material.map = this.gifTexture.texture;
        this.material.visible = true;
        this.material.needsUpdate = true;
        this.mesh.visible = true;
        const aspect = this.gifTexture.aspect;
        this.mesh.scale.set(this.targetHeight * aspect, this.targetHeight, 1);
      })
      .catch((err) => {
        console.warn("[Unicorn] Error loading unicorn GIF:", err);
        this.mesh.visible = false;
      });
  }

  update(now = performance.now()) {
    this.gifTexture.update(now);
  }

  dispose() {
    this.gifTexture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
