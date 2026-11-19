import * as THREE from "three";
import { GALLERY, WALL_SLOTS } from "../config/paintings.js";
import { HOUSE } from "./HouseBuilder.js";

const hw = HOUSE.width / 2, hd = HOUSE.depth / 2;
// Interior wall frames in house-local space: a point on the wall and the inward normal.
const WALLS = {
  front: { p: new THREE.Vector3(0, 0, hd), n: new THREE.Vector3(0, 0, -1) },
  back:  { p: new THREE.Vector3(0, 0, -hd), n: new THREE.Vector3(0, 0, 1) },
  right: { p: new THREE.Vector3(hw, 0, 0), n: new THREE.Vector3(-1, 0, 0) },
  left:  { p: new THREE.Vector3(-hw, 0, 0), n: new THREE.Vector3(1, 0, 0) }
};

/** Data-driven video paintings: one PlaneGeometry mesh each, sharing video textures. */
export class PaintingGallery {
  constructor(videos, paintings) {
    this.group = new THREE.Group();
    this.group.name = "gallery";
    this.paintings = [];

    const up = new THREE.Vector3(0, 1, 0);
    for (const cfg of paintings) {
      const wall = WALLS[cfg.wall];
      const slot = WALL_SLOTS[cfg.wall]?.[cfg.slot];
      if (!wall || !slot) { console.warn("[gallery] bad wall/slot for", cfg.id); continue; }

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), videos.getMaterial(cfg.video));
      mesh.name = `painting-${cfg.id}`;
      mesh.rotation.y = Math.atan2(wall.n.x, wall.n.z);
      const right = new THREE.Vector3().crossVectors(wall.n.clone().negate(), up);
      const y = cfg.y ?? GALLERY.centerY;
      mesh.position.copy(wall.p).addScaledVector(wall.n, GALLERY.offset).addScaledVector(right, slot.u).setY(y);
      mesh.userData.painting = cfg;

      const width = cfg.width ?? GALLERY.defaultWidth;
      videos.watchAspect(cfg.video, (aspect) => {
        let w = Math.min(width, slot.maxW), h = w / aspect;
        if (h > GALLERY.maxHeight) { h = GALLERY.maxHeight; w = h * aspect; }
        mesh.scale.set(w, h, 1);   // original footage aspect preserved
      });

      this.group.add(mesh);
      this.paintings.push(mesh);
    }
  }
}
