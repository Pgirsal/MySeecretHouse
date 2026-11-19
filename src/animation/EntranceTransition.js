import * as THREE from "three";
import { HOUSE_DIMS, EYE_HEIGHT, ENTRY_DEPTH, EXTERIOR_FOV, INTERIOR_FOV } from "../config/house.js";


const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TWO_PI = Math.PI * 2;

/**
 * One continuous camera move through the front doorway, in either direction.
 * Pure time-based interpolation driven from the main loop (frame-rate independent).
 */
export class EntranceTransition {
  constructor({ camera, houseGroup, house, floorY, getExteriorPose, initialYaw }) {
    this.camera = camera;
    this.houseGroup = houseGroup;
    this.house = house;
    this.eye = floorY + EYE_HEIGHT;
    this.hd = HOUSE_DIMS.depth / 2;       // doorway plane z (front wall)
    this.getExteriorPose = getExteriorPose;
    this.initialYaw = initialYaw;
    this.run = null;
    this._look = new THREE.Vector3();
  }

  get active() { return this.run !== null; }

  enter(onDone, duration = 6.5) {
    const cam = this.camera, hg = this.houseGroup;
    const start = this.getExteriorPose().clone();
    const eye = this.eye, hd = this.hd;
    const curve = new THREE.CatmullRomCurve3(
      [start, new THREE.Vector3(0, eye + 0.8, hd + 14), new THREE.Vector3(0, eye, hd + 4), new THREE.Vector3(0, eye, hd - ENTRY_DEPTH)],
      false, "centripetal"
    );
    const yaw0 = hg.rotation.y, yaw1 = Math.round(yaw0 / TWO_PI) * TWO_PI;
    const s0 = hg.scale.x;
    const lookEnd = new THREE.Vector3(0, eye, 0);   // toward the centre of the room
    const origin = new THREE.Vector3();

    // fraction of the path at which the camera reaches the approach point in front of the door
    const fApp = start.distanceTo(curve.points[1]) / curve.getLength();
    this._start(duration, (t, p) => {
      const e = easeInOutCubic(p);
      hg.rotation.y = yaw0 + (yaw1 - yaw0) * easeInOutCubic(THREE.MathUtils.clamp(t / (duration * 0.5), 0, 1));
      hg.scale.setScalar(s0 + (1 - s0) * smooth(t / 0.6));
      this.house.setDoorOpen(smooth((e - (fApp - 0.12)) / 0.1));
      this._fov(EXTERIOR_FOV + (INTERIOR_FOV - EXTERIOR_FOV) * smooth((e - (fApp - 0.05)) / (1.02 - fApp)));
      cam.position.copy(curve.getPointAt(e));
      this._look.lerpVectors(origin, lookEnd, smooth((e - (fApp - 0.1)) / (1.1 - fApp)));
      cam.lookAt(this._look);
    }, () => {
      hg.rotation.y = 0; hg.scale.setScalar(1);
      this.house.setDoorOpen(1);
      this._fov(INTERIOR_FOV);
      cam.position.copy(curve.getPointAt(1));
      cam.lookAt(lookEnd);
      onDone();
    });
  }

  exit(onDone, duration = 5.5) {
    const cam = this.camera, hg = this.houseGroup;
    const eye = this.eye, hd = this.hd;
    const end = this.getExteriorPose().clone();
    const startPos = cam.position.clone();
    const pts = [startPos];
    const doorIn = new THREE.Vector3(0, eye, hd - 1.5);
    if (startPos.distanceTo(doorIn) > 0.3) pts.push(doorIn);
    pts.push(new THREE.Vector3(0, eye, hd + 4), new THREE.Vector3(0, eye + 0.8, hd + 14), end);
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");

    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const lookStart = startPos.clone().addScaledVector(dir, 3);
    const lookDoor = new THREE.Vector3(0, eye, -hd * 1.5);
    const origin = new THREE.Vector3();
    const yaw0 = hg.rotation.y;
    const target = new THREE.Vector3();

    // fraction of the path at which the camera has cleared the doorway
    const fDoor = startPos.distanceTo(new THREE.Vector3(0, eye, hd + 2)) / curve.getLength();
    this._start(duration, (t, p) => {
      const e = easeInOutCubic(p);
      this.house.setDoorOpen(1 - smooth((e - fDoor) / 0.08));
      this._fov(INTERIOR_FOV + (EXTERIOR_FOV - INTERIOR_FOV) * smooth(e / (fDoor + 0.15)));
      hg.rotation.y = yaw0 + (this.initialYaw - yaw0) * smooth((e - fDoor) / (1 - fDoor));
      cam.position.copy(curve.getPointAt(e));
      // Back out of the doorway still facing the interior, then turn to the house.
      target.lerpVectors(lookStart, lookDoor, smooth(e / Math.max(fDoor, 0.02)));
      this._look.lerpVectors(target, origin, smooth((e - fDoor) / 0.4));
      cam.lookAt(this._look);
    }, () => {
      this.house.setDoorOpen(0);
      this._fov(EXTERIOR_FOV);
      hg.rotation.y = this.initialYaw;
      cam.position.copy(end);
      cam.lookAt(0, 0, 0);
      onDone();
    });
  }

  _fov(v) {
    if (Math.abs(this.camera.fov - v) < 1e-4) return;
    this.camera.fov = v;
    this.camera.updateProjectionMatrix();
  }

  _start(duration, step, done) { this.run = { t: 0, duration, step, done }; }

  update(dt) {
    const r = this.run;
    if (!r) return;
    r.t += dt;
    const p = Math.min(r.t / r.duration, 1);
    r.step(r.t, p);
    if (p >= 1) { this.run = null; r.done(); }
  }
}
