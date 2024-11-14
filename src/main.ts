import { mat4, vec3, vec4 } from "gl-matrix";
import { initWebGL2 } from "./gl";
import { createProgram as createLineSegmentProgram } from "./line-segment-shader";
import { createProgram as createCursorProgram } from "./cursor-shader";

// # setup canvas
const canvas = document.getElementById("screen") as HTMLCanvasElement;

// ## setup resize handler
let resizeTask: number = 0;
new ResizeObserver(([entry]) => {
  clearTimeout(resizeTask);
  const width = entry.devicePixelContentBoxSize[0].inlineSize;
  const height = entry.devicePixelContentBoxSize[0].blockSize;
  resizeTask = setTimeout(() => Object.assign(canvas, { width, height }), 150);
}).observe(canvas, { box: "content-box" });

// # initialize webgl2 rendering context
const gl = initWebGL2(canvas);

// # create a shader program
const drawSegment = createLineSegmentProgram(gl);
const drawCursor = createCursorProgram(gl);
const identity = mat4.identity(mat4.create());
const camera = mat4.clone(identity);
const view = mat4.clone(identity);
const projection = mat4.clone(identity);

const model = mat4.clone(identity);
const color = vec4.fromValues(0, 0, 0, 1);

const vs: number[] = [];
const ids: number[] = [];

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const vertexBuffer = gl.createBuffer();
const elementBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vs), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(ids), gl.STATIC_DRAW);
gl.bindVertexArray(null);

let activeTool: string = "none";
document.addEventListener("change", (event) => {
  const e = event.target;
  if (e instanceof HTMLInputElement && e.name === "active-tool") {
    activeTool = e.value;
  }
});

const prevTangent = vec3.create();
const tangent = vec3.create();
const activeLineStart = vec3.create();
const activeLineEnd = vec3.create();
let activeVertexId = -1;
let isTranslating = false;
canvas.addEventListener("pointerdown", (e) => {
  if (activeTool === "none") {
    isTranslating = true;
    e.preventDefault();
  } else if (activeTool === "road") {
    e.preventDefault();
    if (
      activeVertexId !== -1 &&
      vec3.distance(activeLineStart, activeLineEnd) < 4
    ) {
      ids.length -= 2;
      activeVertexId = -1;
      return;
    }

    if (e.button == 2 && activeVertexId !== -1) {
      const isFirstLine =
        ids.length <= 2 || ids[ids.length - 2] !== ids[ids.length - 3];
      ids.length -= 2;
      activeVertexId = isFirstLine ? -1 : (ids.at(-1) ?? -1);
      if (activeVertexId !== -1) {
        const aId = ids.at(-2)!;
        vec3.copy(activeLineStart, [
          vs[aId * 3 + 0],
          vs[aId * 3 + 1],
          vs[aId * 3 + 2],
        ]);
        vec3.copy(activeLineEnd, cursor);
        vs[activeVertexId * 3 + 0] = cursor[0];
        vs[activeVertexId * 3 + 1] = cursor[1];
        vs[activeVertexId * 3 + 2] = cursor[2];
      }
    } else {
      vec3.copy(activeLineStart, cursor);
      vec3.copy(activeLineEnd, cursor);
      if (activeVertexId !== -1) {
        vec3.copy(prevTangent, tangent);
        ids.push(activeVertexId);
        activeVertexId += 1;
        vs[activeVertexId * 3 + 0] = cursor[0];
        vs[activeVertexId * 3 + 1] = cursor[1];
        vs[activeVertexId * 3 + 2] = cursor[2];
        ids.push(activeVertexId);
      } else {
        vec3.zero(prevTangent);
        activeVertexId = vs.length / 3;
        vs[activeVertexId * 3 + 0] = cursor[0];
        vs[activeVertexId * 3 + 1] = cursor[1];
        vs[activeVertexId * 3 + 2] = cursor[2];
        ids.push(activeVertexId);
        activeVertexId += 1;
        vs[activeVertexId * 3 + 0] = cursor[0];
        vs[activeVertexId * 3 + 1] = cursor[1];
        vs[activeVertexId * 3 + 2] = cursor[2];
        ids.push(activeVertexId);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vs), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(ids), gl.STATIC_DRAW);
  }
});
canvas.addEventListener("pointerup", () => {
  isTranslating = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

const tmp0 = mat4.create();
const movement = vec3.create();
const cursor = vec3.create();
const cursorModel = mat4.clone(identity);
canvas.addEventListener("pointermove", (e) => {
  const canvas = e.target as HTMLCanvasElement;
  cursor[0] = (e.offsetX / canvas.clientWidth) * 2 - 1;
  cursor[1] = (-e.offsetY / canvas.clientHeight) * 2 + 1;
  cursor[2] = -1;
  mat4.multiply(tmp0, projection, view);
  const invViewProj = mat4.invert(tmp0, tmp0);
  vec3.transformMat4(cursor, cursor, invViewProj);

  const aliveVertIds = new Set(ids);
  const snapPoint = { d: +Infinity, x: [0, 0, 0] as vec3 };
  for (const vertId of aliveVertIds) {
    if (vertId === activeVertexId) continue;
    const x: vec3 = [
      vs[vertId * 3 + 0],
      vs[vertId * 3 + 1],
      vs[vertId * 3 + 2],
    ];
    const distance = vec3.distance(cursor, x);
    if (distance < snapPoint.d) {
      snapPoint.d = distance;
      snapPoint.x = x;
    }
  }
  if (snapPoint.d > 4) {
    const lineCount = ids.length / 2;
    for (let i = 0; i < lineCount; i++) {
      if (ids[i * 2 + 1] === activeVertexId) continue;
      const a: vec3 = [
        vs[ids[i * 2] * 3 + 0],
        vs[ids[i * 2] * 3 + 1],
        vs[ids[i * 2] * 3 + 2],
      ];
      const b: vec3 = [
        vs[ids[i * 2 + 1] * 3 + 0],
        vs[ids[i * 2 + 1] * 3 + 1],
        vs[ids[i * 2 + 1] * 3 + 2],
      ];
      const len = vec3.distance(b, a);
      const d: vec3 = [0, 0, 0];
      vec3.normalize(d, vec3.subtract(d, b, a));

      const x: vec3 = [0, 0, 0];
      vec3.subtract(x, cursor, a);
      const dot = vec3.dot(x, d);
      if (dot < 0 || dot > len) continue;
      vec3.add(x, a, vec3.scale(d, d, dot));
      const distance = vec3.distance(cursor, x);
      if (distance < snapPoint.d) {
        snapPoint.d = distance;
        snapPoint.x = x;
      }
    }
  }
  if (snapPoint.d < 4) vec3.copy(cursor, snapPoint.x);
  mat4.fromTranslation(cursorModel, cursor);

  if (isTranslating) {
    movement[0] = ((e.offsetX - e.movementX) / canvas.clientWidth) * 2 - 1;
    movement[1] = (-(e.offsetY - e.movementY) / canvas.clientHeight) * 2 + 1;
    movement[2] = -1;
    vec3.transformMat4(movement, movement, invViewProj);
    vec3.subtract(movement, movement, cursor);

    mat4.translate(camera, camera, movement);
    mat4.invert(view, camera);
  } else if (activeVertexId !== -1) {
    const lineEndOffset = activeVertexId * 3;
    vec3.copy(activeLineEnd, cursor);
    vs[lineEndOffset + 0] = activeLineEnd[0];
    vs[lineEndOffset + 1] = activeLineEnd[1];
    vs[lineEndOffset + 2] = activeLineEnd[2];
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vs), gl.STATIC_DRAW);
    vec3.subtract(tangent, activeLineEnd, activeLineStart);
    vec3.normalize(tangent, tangent);
  }
});

// # for each frame
requestAnimationFrame(function frame(prev: number, time = prev) {
  const delta = time - prev;
  if (delta > 30) {
    console.warn(`requestAnimationFrame() called after ${delta}ms.`);
  }
  // ## update camera materices
  mat4.ortho(projection, 0, canvas.clientWidth, canvas.clientHeight, 0, 0, 1);

  // ## clear screen
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ## draw an object
  drawSegment(view, projection, model, color, vao, ids.length);
  drawCursor(view, projection, cursorModel, [1, 0, 0, 1]);

  requestAnimationFrame(frame.bind(null, time));
});

export {};
