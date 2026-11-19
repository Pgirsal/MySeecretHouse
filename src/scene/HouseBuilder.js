import * as THREE from "three";

import { HOUSE_DIMS } from "../config/house.js";

export const HOUSE = { ...HOUSE_DIMS, doorOpenAngle: THREE.MathUtils.degToRad(-95) };

/**
 * Procedural house. Every surface is a real mesh textured with video; there is
 * a separate outward-facing and inward-facing mesh per surface so the footage
 * is never mirrored. Openings (door, windows) are real holes in the wall meshes.
 *
 * @param {VideoTextureManager} videos
 * @param {Object} assets  VIDEO_ASSETS mapping (role -> path)
 */
export function buildHouse(videos, assets) {
  const { width: W, depth: D, wallHeight: H, ridgeHeight: R, doorWidth: DW, doorHeight: DH } = HOUSE;
  const hw = W / 2, hd = D / 2;
  const root = new THREE.Group();
  const meshes = [];

  // ---- helpers -------------------------------------------------------
  function attachLocal(geom, w, h, ox, oy) {
    const pos = geom.attributes.position;
    const local = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      local[i * 2] = pos.getX(i) - ox;
      local[i * 2 + 1] = pos.getY(i) - oy;
    }
    geom.setAttribute("local", new THREE.BufferAttribute(local, 2));
    geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    geom.userData.size = { w, h };
    return geom;
  }

  function flipped(geom) {
    const g = geom.clone();
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
    const { w } = g.userData.size;
    const local = g.attributes.local;
    for (let i = 0; i < local.count; i++) local.setX(i, w - local.getX(i));
    const n = g.attributes.normal;
    if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    g.userData.size = { ...geom.userData.size };
    return g;
  }

  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const v2 = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));

  function shapeGeometry(outline, holes, size, origin) {
    const shape = new THREE.Shape(v2(outline));
    holes.forEach((h) => shape.holes.push(new THREE.Path(v2(rect(...h)))));
    const g = new THREE.ShapeGeometry(shape);
    return attachLocal(g, size[0], size[1], origin[0], origin[1]);
  }

  function quadGeometry(p0, p1, p2, p3, w, h) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p3], 3));
    g.setAttribute("local", new THREE.Float32BufferAttribute([0, 0, w, 0, w, h, 0, h], 2));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(8), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    g.userData.size = { w, h };
    return g;
  }

  /** Adds `front` (faces along geometry normal) and `back` (opposite side, un-mirrored). */
  function addSurface(parent, geom, frontRole, backRole, opts = {}) {
    const mats = (role) => videos.getMaterial(assets[role], opts);
    const front = new THREE.Mesh(geom, mats(frontRole));
    const backGeom = flipped(geom);
    const back = new THREE.Mesh(backGeom, mats(backRole));
    videos.registerSurface(geom, assets[frontRole]);
    videos.registerSurface(backGeom, assets[backRole]);
    if (opts.transparent) { front.renderOrder = back.renderOrder = 2; }
    parent.add(front, back);
    meshes.push(front, back);
    return [front, back];
  }

  const place = (geom, rotY, x, y, z) => {
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    geom.applyMatrix4(m);
    return geom;
  };

  // ---- walls (+ windows) ----------------------------------------------
  // Wall-local coords are centred on x (-hw..hw), y from 0; texture origin at (-hw, 0).
  function wall({ rotY, pos, outline, holes, windows, gable, extRole = "walls", intRole = "interiorWalls" }) {
    const size = [W, gable ? R : H];
    const g = place(shapeGeometry(outline, holes, size, [-hw, 0]), rotY, ...pos);
    addSurface(root, g, extRole, intRole);
    windows.forEach((w) => {
      const pg = place(shapeGeometry(rect(...w), [], [w[2] - w[0], w[3] - w[1]], [w[0], w[1]]), rotY, ...pos);
      addSurface(root, pg, "windows", "windows");
    });
  }

  function gableTri(rotY, pos, windows, extRole = "walls", intRole = "interiorWalls") {
    const tri = [[-hw, H], [hw, H], [0, R]];
    const g = place(shapeGeometry(tri, windows, [W, R], [-hw, 0]), rotY, ...pos);
    addSurface(root, g, extRole, intRole);
    windows.forEach((w) => {
      const pg = place(shapeGeometry(rect(...w), [], [w[2] - w[0], w[3] - w[1]], [w[0], w[1]]), rotY, ...pos);
      addSurface(root, pg, "windows", "windows");
    });
  }

  // Windows sit in a high band (above the gallery paintings) so wall space stays free.
  const RH = R - H;
  const wu = hw * 0.575, hwin = hw * 0.15;                       // painting-slot centre / half window width
  const gableWin = [-hw * 0.1, H + RH * 0.25, hw * 0.1, H + RH * 0.65];
  // Windows sit between the paintings (side/back) or above them (entrance wall, beside the door).
  const midWin = [-hwin, H * 0.31, hwin, H * 0.77];
  const frontWins = [[wu - hwin, H * 0.8, wu + hwin, H * 0.94], [-wu - hwin, H * 0.8, -wu + hwin, H * 0.94]];
  const dx = DW / 2;

  // Wall 1: front (+z) - wall with real doorway notch
  wall({
    rotY: 0, pos: [0, 0, hd],
    outline: [[-hw, 0], [-dx, 0], [-dx, DH], [dx, DH], [dx, 0], [hw, 0], [hw, H], [-hw, H]],
    holes: frontWins, windows: frontWins,
    extRole: "wall1", intRole: "interiorWall1"
  });
  gableTri(0, [0, 0, hd], [gableWin], "wall1", "interiorWall1");

  // Wall 2: back (-z)
  const backWins = [midWin];
  wall({
    rotY: Math.PI, pos: [0, 0, -hd],
    outline: rect(-hw, 0, hw, H),
    holes: backWins, windows: backWins,
    extRole: "wall2", intRole: "interiorWall2"
  });
  gableTri(Math.PI, [0, 0, -hd], [gableWin], "wall2", "interiorWall2");

  // Wall 3: right (+x)
  const sideWins = [midWin];
  wall({
    rotY: Math.PI / 2, pos: [hw, 0, 0],
    outline: rect(-hw, 0, hw, H),
    holes: sideWins, windows: sideWins,
    extRole: "wall3", intRole: "interiorWall3"
  });

  // Wall 4: left (-x)
  wall({
    rotY: -Math.PI / 2, pos: [-hw, 0, 0],
    outline: rect(-hw, 0, hw, H),
    holes: sideWins, windows: sideWins,
    extRole: "wall4", intRole: "interiorWall4"
  });

  // ---- roof: two sloping planes (outer = roof, inner = ceiling) -----------
  const slope = Math.hypot(hw, R - H);
  addSurface(root, quadGeometry([hw, H, hd], [hw, H, -hd], [0, R, -hd], [0, R, hd], D, slope), "roof", "ceiling");
  addSurface(root, quadGeometry([-hw, H, -hd], [-hw, H, hd], [0, R, hd], [0, R, -hd], D, slope), "roof", "ceiling");

  // ---- floor (top = floor video, underside closes the volume) ----------------
  addSurface(root, quadGeometry([-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd], W, D), "floor", "walls");

  // ---- door: independent mesh in the doorway, hinged on its left edge --------
  const door = new THREE.Group();
  door.position.set(-dx, 0, hd);
  const doorGeom = shapeGeometry(rect(0, 0, DW, DH), [], [DW, DH], [0, 0]);
  const doorMeshes = addSurface(door, doorGeom, "door", "door");
  root.add(door);

  // Invisible doorway plane: gaze/hover target for the opening itself (the leaf is edge-on once open).
  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(DW, DH),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false })
  );
  doorway.position.set(0, DH / 2, hd - 0.05);
  root.add(doorway);

  const setDoorOpen = (t) => { door.rotation.y = HOUSE.doorOpenAngle * t; };

  // Collision: footprint bounds + the open door leaf (thin box).
  const obstacles = []; // door swings outward, so it never blocks the room

  return { root, meshes, door, doorMeshes: [...doorMeshes, doorway], setDoorOpen, obstacles, bounds: { halfW: hw, halfD: hd } };
}
