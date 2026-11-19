import * as THREE from "three";
import { SceneManager, FLOOR_Y, INITIAL_YAW } from "./scene/SceneManager.js";
import { VideoTextureManager } from "./scene/VideoTextureManager.js";
import { buildHouse } from "./scene/HouseBuilder.js";
import { InteractionManager } from "./interaction/InteractionManager.js";
import { CameraController } from "./interaction/CameraController.js";
import { EntranceTransition } from "./animation/EntranceTransition.js";
import { PaintingGallery } from "./scene/PaintingGallery.js";
import { DecorativeCutouts } from "./scene/DecorativeCutouts.js";
import { Chandelier } from "./scene/Chandelier.js";
import { GazeManager, gazeText } from "./interaction/GazeManager.js";
import { PAINTINGS } from "./config/paintings.js";
import { VIDEO_ASSETS, VIDEO_BASE } from "./config/videoAssets.js";
import { ExperienceState } from "./state.js";
import { HOUSE_DIMS, EYE_HEIGHT, ENTRY_DEPTH, INTERIOR_FOV } from "./config/house.js";
import { AmbientAudio } from "./audio/AmbientAudio.js";

const $ = (id) => document.getElementById(id);
const notice = $("notice");
const showNotice = (msg) => { notice.hidden = false; notice.textContent = msg; };

const sceneMgr = new SceneManager($("scene"));
const ambientAudio = new AmbientAudio($("audio-toggle"), "vids/extras/natureSound.mp3");
const videos = new VideoTextureManager({ baseUrl: VIDEO_BASE, onNotice: showNotice });
const house = buildHouse(videos, VIDEO_ASSETS);
sceneMgr.houseInner.add(house.root);
sceneMgr.applyExteriorPose();

const controller = new CameraController(sceneMgr.camera, sceneMgr.canvas, {
  floorY: FLOOR_Y, bounds: house.bounds, obstacles: house.obstacles
});
const transition = new EntranceTransition({
  camera: sceneMgr.camera, houseGroup: sceneMgr.houseGroup, house, floorY: FLOOR_Y,
  getExteriorPose: () => sceneMgr.computeExteriorPose(), initialYaw: INITIAL_YAW
});

let state = ExperienceState.EXTERIOR;
let speedMul = 1;
const ROT_SPEED = 0.12;

// ---- UI ---------------------------------------------------------------
const exitBtn = $("exit"), hint = $("hint"), stick = $("stick"), knob = $("knob");
const isTouch = matchMedia("(pointer: coarse)").matches;
let hintTimer = 0;

function showInteriorUI(on) {
  document.body.classList.toggle("in-house", on);
  exitBtn.hidden = !on;
  stick.hidden = !(on && isTouch);
  clearTimeout(hintTimer);
  if (on) {
    hint.textContent = isTouch ? "drag to look · stick to walk" : "click to look · wasd / arrows to walk · esc releases";
    hint.hidden = false; hint.classList.remove("fade");
    hintTimer = setTimeout(() => hint.classList.add("fade"), 5000);
  } else hint.hidden = true;
}

// virtual stick (touch)
{
  let id = null;
  const R = 55;
  const set = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    controller.stick.x = dx / R; controller.stick.y = -dy / R;
  };
  stick.addEventListener("pointerdown", (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); e.stopPropagation(); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ""; controller.stick.x = controller.stick.y = 0; };
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
}

// ---- welcome introduction ---------------------------------------------
let introActive = true;
const welcomeIntro = $("welcome-intro");

if (welcomeIntro) {
  // 0–0.5s: The frame and welcome text fade in over the blurred, whitened house
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      welcomeIntro.classList.add("fade-in");
    });
  });

  // After 3 seconds of display: trigger a single unified 1.2s fade-out
  setTimeout(() => {
    welcomeIntro.classList.add("is-exiting");
  }, 3000);

  // After the 1.2s exit transition completes (3.0s + 1.2s = 4.2s):
  // Cleanly unmount the overlay and restore full interactions
  setTimeout(() => {
    introActive = false;
    welcomeIntro.remove();
  }, 4200);
} else {
  introActive = false;
}

// ---- state transitions ------------------------------------------------
function beginEntrance() {
  if (state !== ExperienceState.EXTERIOR) return;
  introActive = false;
  if (welcomeIntro) {
    welcomeIntro.remove();
  }
  state = ExperienceState.ENTERING;
  document.body.classList.add("in-house");
  transition.enter(() => {
    controller.enable();
    state = ExperienceState.INTERIOR;
    showInteriorUI(true);
    controller.requestLock();
  });
}

function beginExit() {
  if (state !== ExperienceState.INTERIOR) return;
  state = ExperienceState.EXITING;
  showInteriorUI(false);
  controller.disable();
  transition.exit(() => {
    state = ExperienceState.EXTERIOR;
    speedMul = 1;
  });
}
exitBtn.addEventListener("click", (e) => { e.stopPropagation(); beginExit(); });

// ---- gallery + gaze ---------------------------------------------------------
const gallery = new PaintingGallery(videos, PAINTINGS);
sceneMgr.houseInner.add(gallery.group);
const cutouts = new DecorativeCutouts(sceneMgr);
const chandelier = new Chandelier(sceneMgr);
const doorSet = new Set(house.doorMeshes);
const gaze = new GazeManager({
  camera: sceneMgr.camera,
  paintings: gallery.paintings,
  door: house.doorMeshes,
  cutouts: cutouts.items,
  occluders: house.meshes.filter((m) => !doorSet.has(m)),
  element: $("statement")
});
const statementText = gazeText(PAINTINGS);

// Looking at the open door + click (or click its message) leaves the house.
{
  let down = null;
  sceneMgr.canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
  sceneMgr.canvas.addEventListener("click", (e) => {
    if (state !== ExperienceState.INTERIOR) return;
    if (gaze.focusIsDoor) {
      if (down && !controller.locked && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      beginExit();
    } else if (gaze.focused === "unicorn") {
      if (down && !controller.locked && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      window.open("https://pgirsal.github.io/PaulaGironaPortfolio/index.html", "_blank", "noopener,noreferrer");
    }
  });
  $("statement").addEventListener("click", () => { if (gaze.focusIsDoor) beginExit(); });
}

const interaction = new InteractionManager({
  dom: sceneMgr.canvas, camera: sceneMgr.camera, target: sceneMgr.houseGroup,
  isActive: () => state === ExperienceState.EXTERIOR && !introActive, onEnter: beginEntrance
});

// ---- loop ----------------------------------------------------------------
const clock = new THREE.Clock();
let running = true;

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const hg = sceneMgr.houseGroup;

  switch (state) {
    case ExperienceState.EXTERIOR: {
      interaction.update();
      const k = 1 - Math.exp(-dt * 4);
      speedMul += ((interaction.hovered ? 0.3 : 1) - speedMul) * k;
      const s = hg.scale.x + ((interaction.hovered ? 1.03 : 1) - hg.scale.x) * k;
      hg.scale.setScalar(s);
      hg.rotation.y += dt * ROT_SPEED * speedMul;
      break;
    }
    case ExperienceState.ENTERING:
    case ExperienceState.EXITING:
      transition.update(dt);
      break;
    case ExperienceState.INTERIOR:
      controller.update(dt);
      break;
  }
  cutouts.update(sceneMgr.camera);
  gaze.update(dt, state === ExperienceState.INTERIOR, statementText);
  sceneMgr.render();
}

window.addEventListener("resize", () => {
  sceneMgr.resize();
  if (state === ExperienceState.EXTERIOR) sceneMgr.applyExteriorPose();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { running = false; videos.pauseAll(); ambientAudio.suspend(); }
  else if (!running) { running = true; clock.getDelta(); videos.playAll(); ambientAudio.resume(); requestAnimationFrame(frame); }
});

sceneMgr.canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault(); sceneMgr.contextLost = true; showNotice("graphics context lost — restoring…");
});
sceneMgr.canvas.addEventListener("webglcontextrestored", () => {
  sceneMgr.contextLost = false; videos.markTexturesDirty(); notice.hidden = true;
});

requestAnimationFrame(frame);

// test hooks: ?jump=entry|center[&look=<deg yaw>] teleports inside (no animation) for screenshots
{
  const q = new URLSearchParams(location.search);
  const jump = q.get("jump");
  if (jump) {
    introActive = false;
    welcomeIntro?.remove();
    const cam = sceneMgr.camera;
    sceneMgr.houseGroup.rotation.y = 0;
    house.setDoorOpen(1);
    cam.fov = INTERIOR_FOV; cam.updateProjectionMatrix();
    const z = jump === "center" ? 0 : HOUSE_DIMS.depth / 2 - ENTRY_DEPTH;
    cam.position.set(0, FLOOR_Y + EYE_HEIGHT, z);
    cam.lookAt(0, FLOOR_Y + EYE_HEIGHT, -10);
    state = ExperienceState.INTERIOR;
    controller.enable();
    controller.yaw += THREE.MathUtils.degToRad(parseFloat(q.get("look") || 0));
    showInteriorUI(true);
  }
}

// test hooks: ?autoenter enters after 1s; ?autoenter&look=<deg> then turns the view (yaw) for screenshots
{
  const q = new URLSearchParams(location.search);
  if (q.has("autoenter")) {
    setTimeout(beginEntrance, 1000);
    if (q.has("look")) {
      const iv = setInterval(() => {
        if (state === ExperienceState.INTERIOR) {
          controller.yaw += THREE.MathUtils.degToRad(parseFloat(q.get("look")));
          clearInterval(iv);
        }
      }, 100);
    }
  }
}

// debugging / validation hook
window.__house = { sceneMgr, house, videos, get state() { return state; }, controller };
