import * as THREE from "three";
import { HOUSE_DIMS as HOUSE, EXTERIOR_FOV, EXTERIOR_HEIGHT_FRACTION } from "../config/house.js";

export const INITIAL_YAW = 0.72;               // three-quarter view: front + one side
export const FLOOR_Y = -HOUSE.ridgeHeight / 2; // house is vertically centred on the world origin
const BG = 0xf3f2ee;

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(BG, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);

    this.camera = new THREE.PerspectiveCamera(EXTERIOR_FOV, 1, 0.05, 600);
    this.camera.rotation.order = "YXZ";

    this.houseGroup = new THREE.Group();   // rotates / scales about the world origin
    this.houseGroup.rotation.y = INITIAL_YAW;
    this.houseInner = new THREE.Group();   // shifts the house so its centre sits on the origin
    this.houseInner.position.y = FLOOR_Y;
    this.houseGroup.add(this.houseInner);
    this.scene.add(this.houseGroup);

    this.exteriorPos = new THREE.Vector3();
    this.contextLost = false;
    this.resize();
  }

  /**
   * Exterior distance from the house's bounding sphere and the exterior FOV:
   * - height rule: the house is ~EXTERIOR_HEIGHT_FRACTION of the viewport height
   * - fit rule: the whole sphere (plus margin) fits the narrower viewport axis (portrait screens)
   */
  frameDistance() {
    const aspect = this.camera.aspect;
    const vHalf = THREE.MathUtils.degToRad(EXTERIOR_FOV) / 2;
    const tanV = Math.tan(vHalf);
    const hHalf = Math.atan(tanV * aspect);
    const radius = Math.hypot(HOUSE.width, HOUSE.ridgeHeight, HOUSE.depth) / 2;
    const dHeight = HOUSE.ridgeHeight / EXTERIOR_HEIGHT_FRACTION / (2 * tanV);
    const dFit = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.15;
    return Math.max(dHeight, dFit);
  }

  computeExteriorPose() {
    const d = this.frameDistance();
    this.exteriorPos.set(0, d * 0.09, d);
    return this.exteriorPos;
  }

  applyExteriorPose() {
    this.camera.position.copy(this.computeExteriorPose());
    this.camera.lookAt(0, 0, 0);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.computeExteriorPose();
  }

  render() {
    if (!this.contextLost) this.renderer.render(this.scene, this.camera);
  }
}
