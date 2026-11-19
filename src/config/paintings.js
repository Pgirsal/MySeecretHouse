// Gallery data. Edit freely: each painting owns its video, text, wall, slot and size.
//
//  wall   : "front" (entrance wall) | "right" | "back" | "left"   (right/left as seen from the doorway looking in)
//  slot   : 0 = viewer's left, 1 = viewer's right on that wall (see WALL_SLOTS)
//  video  : file under VIDEO_BASE (or array of fallbacks). Same file => one shared decoder/texture.
//  width  : optional painting width override (world units)
//  y      : optional vertical centre override (default GALLERY.centerY)

import { HOUSE_DIMS } from "./house.js";

const hw = HOUSE_DIMS.width / 2;

export const GALLERY = {
  centerY: HOUSE_DIMS.wallHeight * 0.465, // painting centre height above the floor (~3.25)
  defaultWidth: 3.6,   // target painting width; height follows the footage aspect ratio
  maxHeight: 3.8,      // tall (portrait) footage is scaled down to fit this
  offset: 0.02,        // distance in front of the wall (prevents z-fighting)
  gazeDistance: 30,    // max viewing distance for gaze focus
  dwellMs: 300,        // sustained gaze needed before text appears
  graceMs: 180,        // tolerance for brief gaze loss (prevents flicker)
  fadeMs: 450,         // text fade duration
  risePX: 10           // upward travel of text while fading in
};

// u = horizontal centre of the slot (+ = viewer's right); maxW = usable width.
// Derived from the house width so paintings stay evenly spaced and clear of the door (entrance wall)
// and the windows (which sit between them or above them).
const U = hw * 0.575, MAXW = hw * 0.475;
const slots = [{ u: -U, maxW: MAXW }, { u: U, maxW: MAXW }];
export const WALL_SLOTS = { front: slots, right: slots, back: slots, left: slots };

export const DOOR_MESSAGE = "Step back outside";
export const UNICORN_URL = "https://pgirsal.github.io/PaulaGironaPortfolio/index.html";
export const UNICORN_MESSAGE = `
<div class="unicorn-header">✧ THE UNICORN WHISPERS ✧</div>
<div class="unicorn-quote">“Psst... I know a place where she keeps her work.”</div>
<a class="unicorn-link" href="${UNICORN_URL}" target="_blank" rel="noopener noreferrer">
  <span class="unicorn-flourish">❦</span>
  <span>See her portfolio</span>
  <span class="unicorn-flourish">❧</span>
</a>
`.trim();


export const PAINTINGS = [
  {
    id: "creativity", title: "Creativity", wall: "front", slot: 0, video: "Painting1.mov",
    text: "I love turning unexpected ideas into something visual."
  },
  {
    id: "collaboration", title: "Collaboration", wall: "front", slot: 1, video: "Painting2.mov",
    text: "Perhaps creativity is simply knowing where to look for the light."
  },
  {
    id: "experimentation", title: "Experimentation", wall: "right", slot: 0, video: "Painting3.mp4",
    text: "Every great idea begins with a little curiosity and a little mischief."
  },
  {
    id: "concept", title: "Conceptual Thinking", wall: "right", slot: 1, video: "Painting4.mov",
    text: "Behind every design I make, there's a reason, a story, or an idea worth exploring."
  },
  {
    id: "versatility", title: "Versatility", wall: "back", slot: 0, video: "Painting5.mov",
    text: "Finally, a reasonable amount of sparkle."
  },
  {
    id: "initiative", title: "Initiative", wall: "back", slot: 1, video: "Painting6.mp4",
    text: "I like finding beauty where no one thought to leave it."
  },
  {
    id: "detail", title: "Attention to Detail", wall: "left", slot: 0, video: "Painting7.MOV",
    text: "I dont think the walls were ever meant to stay blank."
  },
  {
    id: "curiosity", title: "Curiosity", wall: "left", slot: 1, video: "Painting8.mov",
    text: "I'm constantly looking for inspiration in places I haven't explored before."
  }
];
