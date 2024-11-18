import { mat4, vec3, vec4 } from "gl-matrix";
import { setPointerPoint } from "./canvas";
import { createProgram as createCursorProgram } from "./cursor-shader";
import { initWebGL2 } from "./gl";
import { createProgram as createLineSegmentProgram } from "./line-segment-shader";
import { RoadLayout, RoadPath } from "./road-layout";

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
const drawPath = createLineSegmentProgram(gl);
const drawNode = createCursorProgram(gl);

const identity = mat4.identity(mat4.create());
const camera = mat4.clone(identity);
const view = mat4.clone(identity);
const projection = mat4.clone(identity);

const model = mat4.clone(identity);
const color = vec4.fromValues(0, 0, 0, 1);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

let elementCount = 0;
const vertexBuffer = gl.createBuffer();
const elementBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
gl.bindVertexArray(null);
const updateVertexArray = (vertices: Float32Array, elements: Uint32Array) => {
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  elementCount = elements.length;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elements, gl.STATIC_DRAW);
};

const q = '[name="active-tool"][checked]';
let activeTool =
  (document.querySelector(q) as HTMLInputElement | null)?.value ?? "none";

document.addEventListener("change", (event) => {
  const e = event.target;
  if (e instanceof HTMLInputElement && e.name === "active-tool") {
    activeTool = e.value;
  }
});

// should I make a class for nodes & path set?

// - 지금 움직이고 있는 생성 중인 도로(activePath) 따로 그리고 하이라이트
// - 생성 중인 도로 따로 그리고(gl draw) 하이라이트(다른 색 쓰기)
// - 선 위에 선 제거
// - 노드 움직일 수 있게 하자.

const layout = new RoadLayout();
let workingPath: RoadPath | null = null;
const workingIsects = new Set<vec3>();

const updateRoadLayout = () => {
  const nodes = layout.nodes.slice();
  const lines = Array.from(layout.paths);
  if (workingPath) nodes.push(workingPath.a, workingPath.b);
  if (workingPath) lines.push(workingPath);

  const vertices = new Float32Array(nodes.flatMap((a) => [...a]));
  const elements = new Uint32Array(
    lines.flatMap((l) => [nodes.indexOf(l.a), nodes.indexOf(l.b)]),
  );
  updateVertexArray(vertices, elements);
};

let isMiddleDown = false;
const screenPoint = vec3.create();
let cursor = screenPoint;
const movement = vec3.create();
const cursorModel = mat4.clone(identity);
canvas.addEventListener("pointermove", (e) => {
  setPointerPoint(screenPoint, movement, projection, view, e);

  // Snap to existing lines and points
  const verts = layout.nodes.slice();
  verts.push(...workingIsects);
  const snapPoint = { d: +Infinity, x: [0, 0, 0] as vec3 };
  for (const vert of verts) {
    // Find a closest joint of lines
    const distance = vec3.distance(screenPoint, vert);
    if (distance > snapPoint.d) continue;
    snapPoint.d = distance;
    snapPoint.x = vert;
  }
  if (snapPoint.d > 16) {
    // Find a closest point on lines if no joint near cursor.
    for (const path of layout.paths) {
      const len = path.getLength();
      const d = path.getTangent();
      const x: vec3 = vec3.subtract(vec3.create(), screenPoint, path.a);
      const xDotD = vec3.dot(x, d);
      if (xDotD < 0 || xDotD > len) continue;
      vec3.add(x, path.a, vec3.scale(d, d, xDotD));
      const distance = vec3.distance(screenPoint, x);
      if (distance > snapPoint.d) continue;
      snapPoint.d = distance;
      snapPoint.x = x;
    }
  }
  cursor = snapPoint.d < 16 ? snapPoint.x : vec3.clone(screenPoint);
  mat4.fromTranslation(cursorModel, cursor);

  if (isTranslating || isMiddleDown) {
    mat4.translate(camera, camera, movement);
    mat4.invert(view, camera);
  } else if (workingPath) {
    workingPath.b = cursor;
    workingIsects.clear();
    for (const line of layout.paths) {
      const p = line.getIntersectionPoint(workingPath);
      if (p && p !== workingPath.a && p !== workingPath.b) {
        workingIsects.add(p);
      }
    }
    updateRoadLayout();
  }
});

let isTranslating = false;
canvas.addEventListener("pointerdown", (e) => {
  isMiddleDown = e.pointerType === "mouse" && e.button === 1;

  if (activeTool === "none" || isMiddleDown) {
    isTranslating = true;
    e.preventDefault();
  } else if (activeTool === "road") {
    e.preventDefault();

    if (workingPath && e.pointerType === "mouse" && e.button === 2) {
      workingPath = null;
      workingIsects.clear();
    } else if (workingPath) {
      // find intersections and split lines.
      const queue: RoadPath[] = [workingPath];
      queueLoop: while (queue.length) {
        const path = queue.shift()!;
        linesLoop: for (const other of layout.paths) {
          let p = other.getIntersectionPoint(path);
          if (p) {
            for (const i of workingIsects) {
              if (vec3.equals(p, i)) {
                p = i;
                break;
              }
            }
          }
          const isFromLineJoint = path.a === p || path.b === p;
          const isFromOtherJoint = other.a === p || other.b === p;
          if (!p || (isFromLineJoint && isFromOtherJoint)) continue linesLoop;
          if (!isFromOtherJoint) {
            if (layout.nodes.indexOf(p) === -1) layout.nodes.push(p);
            layout.paths.push(new RoadPath(other.a, p));
            layout.paths.push(new RoadPath(p, other.b));
            layout.paths.splice(layout.paths.indexOf(other), 1);
          }
          if (isFromLineJoint) {
            queue.push(path);
          } else {
            queue.push(new RoadPath(path.a, p));
            queue.push(new RoadPath(p, path.b));
          }
          continue queueLoop;
        }
        if (layout.nodes.indexOf(path.a) === -1) layout.nodes.push(path.a);
        if (layout.nodes.indexOf(path.b) === -1) layout.nodes.push(path.b);
        layout.paths.push(path);
      }
      workingIsects.clear();
      workingPath = null;
      console.log("Number of nodes:", layout.nodes.length);
    } else {
      workingIsects.clear();
      workingPath = new RoadPath(cursor, cursor);
    }
    updateRoadLayout();
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" && e.button === 1) isMiddleDown = false;
  isTranslating = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// # for each frame
const tmpModel = mat4.create();
requestAnimationFrame(function frame(prev: number, time = prev) {
  const delta = time - prev;
  if (delta > 30) console.info(`raf delta: ${delta}ms.`);

  // ## update camera materices
  mat4.ortho(projection, 0, canvas.clientWidth, canvas.clientHeight, 0, 0, 1);

  // ## clear screen
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ## draw an object
  drawPath(view, projection, model, color, vao, elementCount);

  for (const p of workingIsects) {
    const model = mat4.fromTranslation(tmpModel, p);
    drawNode(view, projection, model, [0, 1, 0, 1], false);
  }

  const nodes = layout.nodes.slice();
  if (workingPath) nodes.push(workingPath.a);
  for (const node of nodes) {
    const model = mat4.fromTranslation(tmpModel, node);
    drawNode(view, projection, model, [0, 0, 0, 0.25], false);
  }

  drawNode(view, projection, cursorModel, [1, 0, 0, 1], false);

  requestAnimationFrame(frame.bind(null, time));
});

export {};
