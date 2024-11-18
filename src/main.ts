import { mat4, vec3, vec4 } from "gl-matrix";
import { setPointerPoint } from "./canvas";
import { createProgram as createCursorProgram } from "./cursor-shader";
import { initWebGL2 } from "./gl";
import { createProgram as createLineSegmentProgram } from "./flat-shader";
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
const drawFlat = createLineSegmentProgram(gl);
const drawNode = createCursorProgram(gl);

const identity = mat4.identity(mat4.create());
const camera = mat4.clone(identity);
const view = mat4.clone(identity);
const projection = mat4.clone(identity);

const model = mat4.clone(identity);
const color = vec4.fromValues(0, 0, 0, 1);

function createVertexArray(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const elementBuffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
  gl.bindVertexArray(null);
  const updateVAO = (vertices: Float32Array, elements: Uint32Array) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elements, gl.STATIC_DRAW);
  };
  return [vao, updateVAO] as const;
}

const [layoutVAO, updateLayoutVAO] = createVertexArray(gl);
const [workingVAO, updateWorkingVAO] = createVertexArray(gl);

const q = '[name="active-tool"][checked]';
let activeTool =
  (document.querySelector(q) as HTMLInputElement | null)?.value ?? "none";

document.addEventListener("change", (event) => {
  const e = event.target;
  if (e instanceof HTMLInputElement && e.name === "active-tool") {
    activeTool = e.value;
  }
});

// When it finishes the road, deduplicate a path on a path. Make a user able to
// move nodes, remove nodes and paths.

const layout = new RoadLayout();
let workPath: RoadPath | null = null;
const workIsects = new Set<vec3>();

let isMiddleDown = false;
const screenPoint = vec3.create();
let cursor = screenPoint;
const movement = vec3.create();
const cursorModel = mat4.clone(identity);
canvas.addEventListener("pointermove", (e) => {
  setPointerPoint(screenPoint, movement, projection, view, e);

  // Snap to existing lines and points
  const snapPoint = { d: +Infinity, x: [0, 0, 0] as vec3 };
  for (const x of [...layout.nodes, ...workIsects]) {
    // Find a closest joint of lines
    const d = vec3.distance(screenPoint, x);
    if (d <= snapPoint.d) Object.assign(snapPoint, { d, x });
  }
  if (snapPoint.d > 16) {
    // Find a closest point on lines if no joint near cursor.
    for (const path of layout.paths) {
      const t = path.getTangent();
      const x: vec3 = vec3.subtract(vec3.create(), screenPoint, path.a);
      const xDotT = vec3.dot(x, t);
      if (xDotT < 0 || xDotT > path.getLength()) continue;
      vec3.add(x, path.a, vec3.scale(t, t, xDotT));
      const d = vec3.distance(screenPoint, x);
      if (d <= snapPoint.d) Object.assign(snapPoint, { d, x });
    }
  }
  cursor = snapPoint.d < 16 ? snapPoint.x : vec3.clone(screenPoint);
  mat4.fromTranslation(cursorModel, cursor);

  if (isTranslating || isMiddleDown) {
    mat4.translate(camera, camera, movement);
    mat4.invert(view, camera);
  } else if (workPath) {
    workPath.b = cursor;
    workIsects.clear();
    for (const line of layout.paths) {
      const p = line.getIntersectionPoint(workPath);
      if (p && p !== workPath.a && p !== workPath.b) {
        workIsects.add(p);
      }
    }
    const vs = new Float32Array([...workPath.a, ...workPath.b]);
    updateWorkingVAO(vs, new Uint32Array([0, 1]));
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

    if (workPath && e.pointerType === "mouse" && e.button === 2) {
      workPath = null;
      workIsects.clear();
    } else if (workPath) {
      // find intersections and split lines.
      const queue: RoadPath[] = [workPath];
      queueLoop: while (queue.length) {
        const path = queue.shift()!;
        linesLoop: for (const other of layout.paths) {
          let p = other.getIntersectionPoint(path);
          if (p) {
            for (const i of workIsects) {
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
            layout.paths.push(new RoadPath(other.a, p, 16));
            layout.paths.push(new RoadPath(p, other.b, 16));
            layout.paths.splice(layout.paths.indexOf(other), 1);
          }
          if (isFromLineJoint) {
            queue.push(path);
          } else {
            queue.push(new RoadPath(path.a, p, 16));
            queue.push(new RoadPath(p, path.b, 16));
          }
          continue queueLoop;
        }
        if (layout.nodes.indexOf(path.a) === -1) layout.nodes.push(path.a);
        if (layout.nodes.indexOf(path.b) === -1) layout.nodes.push(path.b);
        layout.paths.push(path);
      }
      workIsects.clear();
      workPath = null;
      for (const node of layout.nodes) {
        if (layout.nodePolygons.has(node)) continue;
      }
      console.log("Number of nodes:", layout.nodes.length);
    } else {
      workIsects.clear();
      workPath = new RoadPath(cursor, cursor, 16);
    }

    const { nodes, paths } = layout;
    const vertices = new Float32Array(nodes.flatMap((a) => [...a]));
    const elements = new Uint32Array(
      paths.flatMap((l) => [nodes.indexOf(l.a), nodes.indexOf(l.b)]),
    );
    updateLayoutVAO(vertices, elements);
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

  const count = layout.paths.length * 2;
  drawFlat(view, projection, model, color, layoutVAO, gl.LINES, count);
  for (const node of layout.nodes) {
    const model = mat4.fromTranslation(tmpModel, node);
    drawNode(view, projection, model, [0, 0, 0, 0.25], false);
  }

  if (workPath) {
    const model = mat4.identity(tmpModel);
    drawFlat(view, projection, model, [0, 0.5, 1, 1], workingVAO, gl.LINES, 2);
    mat4.fromTranslation(model, workPath.a);
    drawNode(view, projection, model, [0, 0.5, 1, 0.25], false);
    for (const p of workIsects) {
      const model = mat4.fromTranslation(tmpModel, p);
      drawNode(view, projection, model, [0, 0.5, 1, 0.25], false);
    }
  }

  drawNode(view, projection, cursorModel, [1, 0, 0, 1], false);

  requestAnimationFrame(frame.bind(null, time));
});

export {};
