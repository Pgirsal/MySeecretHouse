// Central video configuration. Edit ONLY this file to re-skin the house.
// Each value is a path (relative to VIDEO_BASE) or an array of fallback paths
// tried in order (e.g. a .mov with an H.264 .mp4 replacement behind it).

export const VIDEO_BASE = "vids/";

export const VIDEO_ASSETS = {
  // Walls 1-4
  wall1: "wall1.mov",                // Wall 1: Front facade (entrance)
  wall2: ["wall2.mov", "wall2.mp4"], // Wall 2: Back facade
  wall3: "wall3.mp4",                // Wall 3: Right facade
  wall4: "wall4.mp4",                // Wall 4: Left facade

  // Interior surfaces for each wall (can also be customized independently)
  interiorWall1: "wall1.mov",
  interiorWall2: ["wall2.mov", "wall2.mp4"],
  interiorWall3: "wall3.mp4",
  interiorWall4: "wall4.mp4",

  // Legacy fallback if referenced anywhere
  walls: "wall1.mov",
  interiorWalls: "wall1.mov",

  roof: "sunset.mp4",              // exterior roof planes
  door: "door.MP4",                    // door (both sides)
  windows: "#ffffff",              // window panes: flat white blocks ("#rrggbb" = colour, otherwise a video)
  floor: "floor.mp4",              // floor (top)
  ceiling: "sunset.mp4"            // underside of roof / interior ceiling (or choose any video in vids/)
};
