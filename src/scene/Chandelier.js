import * as THREE from "three";
import { HOUSE_DIMS } from "../config/house.js";

/**
 * Creates a chandelier hanging from the center of the ceiling
 * using two intersecting (crossed) transparent planes forming an X shape.
 * It remains stationary while the user moves around it.
 */
export class Chandelier {
  constructor(sceneMgr) {
    this.group = new THREE.Group();
    this.group.name = "chandelier";

    const R = HOUSE_DIMS.ridgeHeight; // 11
    const targetHeight = 4.2;        // noticeable proportion without blocking eye-level (eye height is 1.7)

    // Position at room center (X=0, Z=0)
    // The top of the chandelier touches the roof ridge at y = R
    this.group.position.set(0, R, 0);

    const loader = new THREE.TextureLoader();
    loader.load(
      "vids/extras/chandelier.png",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const img = texture.image;
        const aspect = (img && img.width && img.height) ? (img.width / img.height) : 1;
        const h = targetHeight;
        const w = h * aspect;

        // Plane geometry translated so top center is at (0, 0, 0)
        // (y ranges from -h to 0)
        const planeGeom = new THREE.PlaneGeometry(w, h);
        planeGeom.translate(0, -h / 2, 0);

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          alphaTest: 0.05,
          toneMapped: false
        });

        // Plane 1: facing Z axis
        const plane1 = new THREE.Mesh(planeGeom, material);
        plane1.renderOrder = 3;

        // Plane 2: rotated 90 degrees around Y axis (intersecting X shape)
        const plane2 = new THREE.Mesh(planeGeom, material);
        plane2.rotation.y = Math.PI / 2;
        plane2.renderOrder = 3;

        this.group.add(plane1, plane2);
      },
      undefined,
      (err) => console.warn("[Chandelier] Error loading texture:", err)
    );

    sceneMgr.houseInner.add(this.group);
  }
}
