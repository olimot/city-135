import { mat4, vec3, vec4 } from "gl-matrix";
import { createProgram as createCursorProgram } from "./cursor-shader";
import { initWebGL2 } from "./gl";
import { createProgram as createLineSegmentProgram } from "./line-segment-shader";
import { Line } from "./primitive";

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

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

let vertexCount = 0;
const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, null, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

let activeTool: string = "none";
document.addEventListener("change", (event) => {
  const e = event.target;
  if (e instanceof HTMLInputElement && e.name === "active-tool") {
    activeTool = e.value;
  }
});

const lines = new Set<Line>();
const linesToAdd: Line[] = [];
const updateVertexArray = () => {
  const verts = [...lines, ...linesToAdd].flatMap((l) => [...l.a, ...l.b]);
  vertexCount = verts.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
};

const screenPoint = vec3.create();
let cursor = screenPoint;
const intersections = new Set<mat4>();
const tmp0 = mat4.create();
const movement = vec3.create();
const cursorModel = mat4.clone(identity);
canvas.addEventListener("pointermove", (e) => {
  const canvas = e.target as HTMLCanvasElement;
  screenPoint[0] = (e.offsetX / canvas.clientWidth) * 2 - 1;
  screenPoint[1] = (-e.offsetY / canvas.clientHeight) * 2 + 1;
  screenPoint[2] = -1;
  const invViewProj = mat4.invert(tmp0, mat4.multiply(tmp0, projection, view));
  vec3.transformMat4(screenPoint, screenPoint, invViewProj);

  // Snap to existing lines and points
  const allOtherLines = [...lines, ...linesToAdd.slice(0, -1)];
  const activeLine = linesToAdd.at(-1);
  const verts = allOtherLines.flatMap((l) => [l.a, l.b]);
  const snapPoint = { d: +Infinity, x: [0, 0, 0] as vec3 };

  // Find snap point among start and end points of lines
  for (const vert of verts) {
    if (activeLine && (vert === activeLine.a || vert === activeLine.b)) {
      continue;
    }
    const distance = vec3.distance(screenPoint, vert);
    if (distance > snapPoint.d) continue;
    snapPoint.d = distance;
    snapPoint.x = vert;
  }

  // Find snap point on lines
  if (snapPoint.d > 4) {
    for (const line of allOtherLines) {
      if (line === activeLine) continue;
      const len = line.getLength();
      const d = line.getTangent();
      const x: vec3 = vec3.subtract(vec3.create(), screenPoint, line.a);
      const xDotD = vec3.dot(x, d);
      if (xDotD < 0 || xDotD > len) continue;
      vec3.add(x, line.a, vec3.scale(d, d, xDotD));
      const distance = vec3.distance(screenPoint, x);
      if (distance > snapPoint.d) continue;
      snapPoint.d = distance;
      snapPoint.x = x;
    }
  }
  cursor = snapPoint.d < 4 ? snapPoint.x : vec3.clone(screenPoint);
  mat4.fromTranslation(cursorModel, cursor);

  if (isTranslating) {
    movement[0] = ((e.offsetX - e.movementX) / canvas.clientWidth) * 2 - 1;
    movement[1] = (-(e.offsetY - e.movementY) / canvas.clientHeight) * 2 + 1;
    movement[2] = -1;
    vec3.transformMat4(movement, movement, invViewProj);
    vec3.subtract(movement, movement, cursor);

    mat4.translate(camera, camera, movement);
    mat4.invert(view, camera);
  } else if (activeLine) {
    activeLine.b = cursor;
    intersections.clear();
    for (const line of allOtherLines) {
      const p = line.getIntersectionPoint(activeLine);
      if (p) intersections.add(mat4.fromTranslation(mat4.create(), p));
    }
    updateVertexArray();
  }
});

let isTranslating = false;
canvas.addEventListener("pointerdown", (e) => {
  if (activeTool === "none") {
    isTranslating = true;
    e.preventDefault();
  } else if (activeTool === "road") {
    e.preventDefault();
    const activeLine = linesToAdd.at(-1);
    if (activeLine && activeLine.getLength() < 4) {
      const queue = [...linesToAdd];
      intersectionFinderQueue: while (queue.length) {
        const line = queue.shift()!;
        for (const other of lines) {
          const p = other.getIntersectionPoint(line);
          const isFromLineJoint = line.a === p || line.b === p;
          const isFromOtherJoint = other.a === p || other.b === p;
          if (!p || (isFromLineJoint && isFromOtherJoint)) continue;
          if (!isFromOtherJoint) {
            console.log("p will be added in other");
            lines.add(new Line(other.a, p));
            lines.add(new Line(p, other.b));
            lines.delete(other);
          }
          if (isFromLineJoint) {
            queue.push(line);
          } else {
            console.log("p will be added in this line");
            queue.push(new Line(line.a, p));
            queue.push(new Line(p, line.b));
          }
          continue intersectionFinderQueue;
        }
        lines.add(line);
      }
      intersections.clear();
      linesToAdd.splice(0);
      const joints = new Set([...lines].flatMap((x) => [x.a, x.b]));
      console.log("Total count of joints:", joints.size);
    } else if (e.button == 2 && activeLine) {
      linesToAdd.pop();
    } else {
      linesToAdd.push(new Line(cursor, cursor));
    }
    updateVertexArray();
  }
});

canvas.addEventListener("pointerup", () => {
  isTranslating = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

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
  drawSegment(view, projection, model, color, vao, vertexCount);
  drawCursor(view, projection, cursorModel, [1, 0, 0, 1]);

  for (const p of intersections) {
    drawCursor(view, projection, p, [0, 1, 0, 1]);
  }

  const tmpModel = mat4.create();
  for (const l of [...lines, ...linesToAdd]) {
    mat4.fromTranslation(tmpModel, l.a);
    drawCursor(view, projection, tmpModel, [0, 1, 1, 0.25]);
    mat4.fromTranslation(tmpModel, l.b);
    drawCursor(view, projection, tmpModel, [1, 0, 1, 0.25]);
  }

  requestAnimationFrame(frame.bind(null, time));
});

export {};
