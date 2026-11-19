// Single source of truth for house dimensions and first-person tuning (world units).
// Everything else (geometry, windows, paintings, collision, camera paths) derives from these.

export const HOUSE_DIMS = {
  width: 16,
  depth: 16,
  wallHeight: 7,
  roofHeight: 4,      // height of the roof above the walls
  doorWidth: 2.4,
  doorHeight: 3.8
};
HOUSE_DIMS.ridgeHeight = HOUSE_DIMS.wallHeight + HOUSE_DIMS.roofHeight;

export const EYE_HEIGHT = 1.7;
export const WALK_SPEED = 3.0;
export const CAMERA_RADIUS = 0.45;
export const ENTRY_DEPTH = 3.5;       // camera stops this far inside the doorway
export const EXTERIOR_FOV = 35;
export const INTERIOR_FOV = 75;
export const EXTERIOR_HEIGHT_FRACTION = 0.2; // house height as share of viewport height on load
