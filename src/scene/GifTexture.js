import * as THREE from "three";

/**
 * Lightweight pure-JavaScript GIF parser and decoder.
 * Supports GIF87a/GIF89a, global/local color tables, graphic control extensions
 * (delays, transparency, disposal methods 1-3), and interlaced/non-interlaced frames.
 */
export function parseGIF(bytes) {
  let pos = 0;
  const readByte = () => bytes[pos++];
  const readUint16 = () => {
    const v = bytes[pos] | (bytes[pos + 1] << 8);
    pos += 2;
    return v;
  };

  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  pos = 6;
  if (!sig.startsWith("GIF")) {
    throw new Error("Invalid GIF signature: " + sig);
  }

  const width = readUint16();
  const height = readUint16();
  const packed = readByte();
  const hasGCT = (packed & 0x80) !== 0;
  const gctSize = hasGCT ? (2 << (packed & 7)) : 0;
  readByte(); // background color index
  readByte(); // pixel aspect ratio

  let gct = null;
  if (hasGCT) {
    gct = bytes.subarray(pos, pos + gctSize * 3);
    pos += gctSize * 3;
  }

  const frames = [];
  let gce = {
    disposalMethod: 0,
    transparent: false,
    delay: 100,
    transparentIndex: 0
  };

  while (pos < bytes.length) {
    const blockType = readByte();
    if (blockType === 0x3B) {
      // Trailer (end of GIF)
      break;
    } else if (blockType === 0x21) {
      // Extension block
      const extType = readByte();
      if (extType === 0xF9) {
        // Graphic Control Extension
        readByte(); // block size (always 4)
        const gcePacked = readByte();
        const disposalMethod = (gcePacked >> 2) & 7;
        const transparent = (gcePacked & 1) !== 0;
        let delay = readUint16() * 10; // convert 1/100s to ms
        if (delay <= 10) delay = 100; // clamp standard minimum
        const transparentIndex = readByte();
        readByte(); // terminator 0x00
        gce = {
          disposalMethod,
          transparent,
          delay,
          transparentIndex
        };
      } else {
        // Skip sub-blocks
        let subSize = readByte();
        while (subSize > 0) {
          pos += subSize;
          subSize = readByte();
        }
      }
    } else if (blockType === 0x2C) {
      // Image Descriptor
      const left = readUint16();
      const top = readUint16();
      const imgWidth = readUint16();
      const imgHeight = readUint16();
      const imgPacked = readByte();
      const hasLCT = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const lctSize = hasLCT ? (2 << (imgPacked & 7)) : 0;
      let palette = gct;
      if (hasLCT) {
        palette = bytes.subarray(pos, pos + lctSize * 3);
        pos += lctSize * 3;
      }

      // Read compressed image data sub-blocks
      const minCodeSize = readByte();
      const subBlocks = [];
      let totalDataLen = 0;
      let dataSize = readByte();
      while (dataSize > 0) {
        subBlocks.push(bytes.subarray(pos, pos + dataSize));
        totalDataLen += dataSize;
        pos += dataSize;
        dataSize = readByte();
      }

      const compressedData = new Uint8Array(totalDataLen);
      let offset = 0;
      for (const block of subBlocks) {
        compressedData.set(block, offset);
        offset += block.length;
      }

      // LZW decompression
      const pixelCount = imgWidth * imgHeight;
      const pixels = new Uint8Array(pixelCount);

      const clearCode = 1 << minCodeSize;
      const eoiCode = clearCode + 1;
      let codeSize = minCodeSize + 1;
      let codeMask = (1 << codeSize) - 1;

      const prefix = new Int32Array(4096);
      const suffix = new Uint8Array(4096);
      const pixelStack = new Uint8Array(4097);

      for (let i = 0; i < clearCode; i++) {
        prefix[i] = -1;
        suffix[i] = i;
      }

      let available = clearCode + 2;
      let oldCode = -1;
      let code = 0;
      let bitBuffer = 0;
      let bitCount = 0;
      let bytePos = 0;
      let pixelPos = 0;
      let stackPtr = 0;

      while (pixelPos < pixelCount) {
        if (stackPtr === 0) {
          while (bitCount < codeSize) {
            if (bytePos >= compressedData.length) break;
            bitBuffer |= (compressedData[bytePos++] << bitCount);
            bitCount += 8;
          }
          code = bitBuffer & codeMask;
          bitBuffer >>= codeSize;
          bitCount -= codeSize;

          if (code === clearCode) {
            codeSize = minCodeSize + 1;
            codeMask = (1 << codeSize) - 1;
            available = clearCode + 2;
            oldCode = -1;
            continue;
          }
          if (code === eoiCode) break;

          if (oldCode === -1) {
            pixels[pixelPos++] = suffix[code];
            oldCode = code;
            continue;
          }

          let inCode = code;
          if (code >= available) {
            pixelStack[stackPtr++] = suffix[oldCode];
            code = oldCode;
          }

          while (code >= clearCode) {
            pixelStack[stackPtr++] = suffix[code];
            code = prefix[code];
          }

          pixelStack[stackPtr++] = suffix[code];

          if (available < 4096) {
            prefix[available] = oldCode;
            suffix[available] = suffix[code];
            available++;
            if (available === (1 << codeSize) && available < 4096) {
              codeSize++;
              codeMask = (1 << codeSize) - 1;
            }
          }
          oldCode = inCode;
        }

        pixels[pixelPos++] = pixelStack[--stackPtr];
      }

      frames.push({
        left,
        top,
        width: imgWidth,
        height: imgHeight,
        delay: gce.delay,
        disposalMethod: gce.disposalMethod,
        transparent: gce.transparent,
        transparentIndex: gce.transparentIndex,
        palette,
        pixels,
        interlaced
      });
    }
  }

  return { width, height, frames };
}

/**
 * Pre-renders decoded GIF frames into standalone canvas elements,
 * handling disposal and alpha transparency.
 */
function preRenderFrames(gif) {
  const { width, height, frames } = gif;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const renderedFrames = [];
  let prevImageData = null;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];

    if (f.disposalMethod === 3) {
      prevImageData = ctx.getImageData(0, 0, width, height);
    }

    const frameImageData = ctx.createImageData(f.width, f.height);
    const data = frameImageData.data;
    const { pixels, palette, transparent, transparentIndex, interlaced } = f;

    if (!interlaced) {
      let srcIdx = 0;
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          const colorIdx = pixels[srcIdx++];
          const dstIdx = (y * f.width + x) * 4;
          if (transparent && colorIdx === transparentIndex) {
            data[dstIdx + 3] = 0;
          } else {
            data[dstIdx] = palette[colorIdx * 3];
            data[dstIdx + 1] = palette[colorIdx * 3 + 1];
            data[dstIdx + 2] = palette[colorIdx * 3 + 2];
            data[dstIdx + 3] = 255;
          }
        }
      }
    } else {
      const passes = [
        { start: 0, step: 8 },
        { start: 4, step: 8 },
        { start: 2, step: 4 },
        { start: 1, step: 2 }
      ];
      let srcIdx = 0;
      for (const pass of passes) {
        for (let y = pass.start; y < f.height; y += pass.step) {
          for (let x = 0; x < f.width; x++) {
            const colorIdx = pixels[srcIdx++];
            const dstIdx = (y * f.width + x) * 4;
            if (transparent && colorIdx === transparentIndex) {
              data[dstIdx + 3] = 0;
            } else {
              data[dstIdx] = palette[colorIdx * 3];
              data[dstIdx + 1] = palette[colorIdx * 3 + 1];
              data[dstIdx + 2] = palette[colorIdx * 3 + 2];
              data[dstIdx + 3] = 255;
            }
          }
        }
      }
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = f.width;
    tempCanvas.height = f.height;
    tempCanvas.getContext("2d").putImageData(frameImageData, 0, 0);

    ctx.drawImage(tempCanvas, f.left, f.top);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    outCanvas.getContext("2d").drawImage(canvas, 0, 0);

    renderedFrames.push({
      canvas: outCanvas,
      delay: f.delay || 100
    });

    if (f.disposalMethod === 2) {
      ctx.clearRect(f.left, f.top, f.width, f.height);
    } else if (f.disposalMethod === 3 && prevImageData) {
      ctx.putImageData(prevImageData, 0, 0);
    }
  }

  return renderedFrames;
}

/**
 * Animated GIF Texture for Three.js.
 * Wraps a dynamic canvas in a THREE.CanvasTexture, pre-decodes GIF frames,
 * and advances frames according to GIF frame delays on each update(time) call.
 */
export class AnimatedGifTexture {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.ctx = this.canvas.getContext("2d");

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.frames = [];
    this.currentFrame = 0;
    this.lastFrameTime = 0;
    this.width = 1;
    this.height = 1;
    this.aspect = 1;
    this.loaded = false;
  }

  async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch GIF: ${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const parsed = parseGIF(bytes);

    this.width = parsed.width;
    this.height = parsed.height;
    this.aspect = this.width / this.height;

    this.frames = preRenderFrames(parsed);

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    if (this.frames.length > 0) {
      this.currentFrame = 0;
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(this.frames[0].canvas, 0, 0);
      this.texture.needsUpdate = true;
    }

    this.lastFrameTime = performance.now();
    this.loaded = true;
    return this;
  }

  update(now = performance.now()) {
    if (!this.loaded || this.frames.length <= 1) return;

    const current = this.frames[this.currentFrame];
    if (now - this.lastFrameTime >= current.delay) {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      const next = this.frames[this.currentFrame];
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(next.canvas, 0, 0);
      this.texture.needsUpdate = true;
      this.lastFrameTime = now;
    }
  }

  dispose() {
    this.texture.dispose();
    this.frames = [];
    this.loaded = false;
  }
}
