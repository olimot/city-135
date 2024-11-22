import { mat4, ReadonlyVec3, ReadonlyVec4, vec3 } from "gl-matrix";
import { setPointerPoint } from "./canvas";
import {
  createFlatShader,
  createPointShader,
  createVertexArray,
  initWebGL2,
} from "./gl";
import {
  addEdge,
  createGraph,
  findSnapPoint,
  getEdges,
  indexOf,
  node,
  printGraph,
  removeEdge,
} from "./graph";
import { getLineLineIntersection } from "./primitive";
import { initUI } from "./ui";

// # setup canvas
const ui = initUI();

// # initialize webgl2 rendering context
const gl = initWebGL2(ui.canvas);

// # create a shader program
const drawFlat = createFlatShader(gl);
const drawNode = createPointShader(gl);

const identity = mat4.identity(mat4.create());
const camera = mat4.clone(identity);
const view = mat4.clone(identity);
const projection = mat4.clone(identity);
const model = mat4.clone(identity);

const [vao, updateVAO] = createVertexArray(gl);

const graph = createGraph();
const ghost = {
  anchor: null as vec3 | null,
  focus: vec3.create(),
  focusEdge: null as [vec3, vec3] | null,
  intersections: [] as { t: number; point: vec3; edge: [vec3, vec3] }[],
};

let isMiddleDown = false;
const screenPoint = vec3.create();
const movement = vec3.create();
ui.canvas.addEventListener("pointermove", (e) => {
  setPointerPoint(screenPoint, movement, projection, view, e);

  const [focus, focusEdge] = findSnapPoint(graph, screenPoint, 16);
  Object.assign(ghost, { focus, focusEdge });
  if (ghost.intersections.length) ghost.intersections.splice(0);
  if (ghost.anchor) {
    const ghostEdge: [vec3, vec3] = [ghost.anchor, ghost.focus];
    for (const otherEdge of getEdges(graph)) {
      const isect = getLineLineIntersection(ghostEdge, otherEdge, true);
      if (isect) {
        const [t, point] = isect;
        ghost.intersections.push({ t, point, edge: otherEdge });
      }
    }
    ghost.intersections.sort((a, b) => a.t - b.t);
  }

  if (isTranslating || isMiddleDown) {
    mat4.translate(camera, camera, movement);
    mat4.invert(view, camera);
  }
});

export interface RoadNode {
  vao: WebGLVertexArrayObject | null;
  updateVAO: (vertices: Float32Array, elements: Uint32Array) => void;
  elementCount: number;
  adjacentVertices: Map<vec3, { left: vec3; right: vec3 }>;
}

export interface RoadSegment {
  vao: WebGLVertexArrayObject | null;
  updateVAO: (vertices: Float32Array, elements: Uint32Array) => void;
  nodes: [RoadNode, RoadNode];
}

const roadNodes = new Map<vec3, RoadNode>();
const roadSegments: RoadSegment[] = [];

function angle(a: vec3, b: vec3) {
  const v = vec3.create();
  vec3.subtract(v, b, a);
  const innerAngle = vec3.angle([1, 0, 0], v);
  if (v[1] === 0) return v[0] < 0 ? Math.PI : 0;
  return v[1] > 0 ? 2 * Math.PI - innerAngle : innerAngle;
}

function getSide(
  out: vec3,
  center: ReadonlyVec3,
  tangent: ReadonlyVec3,
  which: "LEFT" | "RIGHT",
  width: number,
) {
  if (which === "LEFT") vec3.set(out, tangent[1], -tangent[0], 0);
  else vec3.set(out, -tangent[1], tangent[0], 0);
  return vec3.scaleAndAdd(out, center, out, width / 2);
}

function getTangent(out: vec3, a: ReadonlyVec3, b: ReadonlyVec3) {
  return vec3.normalize(out, vec3.subtract(out, b, a));
}

function createLine(a: vec3, tangent: ReadonlyVec3, length: number) {
  return [a, vec3.scaleAndAdd(vec3.create(), a, tangent, length)] as const;
}

const width = 16;

function updateRoadNode(a: vec3) {
  a = node(a, graph);
  const adjacencyList = graph.get(a);
  if (!adjacencyList?.length) return;

  let roadNode = roadNodes.get(a);
  if (!roadNode) {
    const [vao, updateVAO] = createVertexArray(gl);
    roadNode = { vao, updateVAO, adjacentVertices: new Map(), elementCount: 0 };
    roadNodes.set(a, roadNode);
  }

  const sorted = adjacencyList
    .map((b) => [b, angle(a, b), indexOf(b, graph)] as const)
    .sort((b, c) => b[1] - c[1]);

  const vs = roadNode.adjacentVertices;
  vs.clear();

  for (let i = 0; i < sorted.length; i++) {
    const [current] = sorted[i];
    const tangent = getTangent(vec3.create(), current, a);
    const left = getSide(vec3.create(), a, tangent, "LEFT", width);

    if (sorted.length === 1) {
      const right = getSide(vec3.create(), a, tangent, "RIGHT", width);
      vs.set(current, { left, right });
    } else {
      const [next] = sorted[(i + 1) % sorted.length];
      const nextTangent = getTangent(vec3.create(), next, a);
      const nextRight = getSide(vec3.create(), a, nextTangent, "RIGHT", width);

      const leftLine = createLine(left, tangent, width / 2);
      const nextRightLine = createLine(nextRight, nextTangent, width / 2);
      const isect = getLineLineIntersection(leftLine, nextRightLine, false);
      if (!isect) continue; // two lines are overlayed

      let avs = vs.get(current);
      if (!avs) vs.set(current, (avs = { left: null!, right: null! }));
      avs.left = isect[1];
      let nvs = vs.get(next);
      if (!nvs) vs.set(next, (nvs = { left: null!, right: null! }));
      nvs.right = isect[1];
    }
  }

  const jointVerts: number[] = [...a];
  const jointElements: number[] = [];
  let i = 1;
  for (const [b, tvs] of vs) {
    jointVerts.push(...tvs.right, ...tvs.left);
    jointElements.push(0, i++, i++);

    if (b === a) continue;
    const otherRoadNode = roadNodes.get(b);
    if (!otherRoadNode) continue;
    const ovs = otherRoadNode.adjacentVertices.get(a);
    if (!ovs) continue;
    let segment = roadSegments.find(
      (seg) =>
        (seg.nodes[0] === roadNode && seg.nodes[1] === otherRoadNode) ||
        (seg.nodes[0] === otherRoadNode && seg.nodes[1] === roadNode),
    );
    if (!segment) {
      const [vao, updateVAO] = createVertexArray(gl);
      segment = { vao, updateVAO, nodes: [roadNode, otherRoadNode] };
      roadSegments.push(segment);
    }

    const verts = [...tvs.left, ...tvs.right, ...ovs.left, ...ovs.right];
    const elems = [0, 1, 2, 2, 3, 0];
    segment.updateVAO(new Float32Array(verts), new Uint32Array(elems));
  }
  roadNode.updateVAO(
    new Float32Array(jointVerts),
    new Uint32Array(jointElements),
  );
  roadNode.elementCount = jointElements.length;
}

function removeRoadSegment(a: vec3, b: vec3) {
  const aRoadNode = roadNodes.get((a = node(a, graph)));
  const bRoadNode = roadNodes.get((b = node(b, graph)));

  const segmentIdx = roadSegments.findIndex(
    (seg) =>
      (seg.nodes[0] === aRoadNode && seg.nodes[1] === bRoadNode) ||
      (seg.nodes[0] === bRoadNode && seg.nodes[1] === aRoadNode),
  );
  if (segmentIdx !== -1) roadSegments.splice(segmentIdx, 1);
}

let isTranslating = false;
ui.canvas.addEventListener("pointerdown", (e) => {
  isMiddleDown = e.pointerType === "mouse" && e.button === 1;
  const isRightDown = e.pointerType === "mouse" && e.button === 2;
  if (ui.activeTool === "none" || isMiddleDown) {
    isTranslating = true;
    e.preventDefault();
  } else if (ui.activeTool === "road") {
    e.preventDefault();

    if (ghost.anchor) {
      if (!isRightDown) {
        let a = ghost.anchor;
        for (const isect of ghost.intersections) {
          addEdge(a, isect.point, graph);
          removeEdge(isect.edge[0], isect.edge[1], graph);
          addEdge(isect.edge[0], isect.point, graph);
          addEdge(isect.edge[1], isect.point, graph);
          removeRoadSegment(isect.edge[0], isect.edge[1]);
          updateRoadNode(a);
          updateRoadNode(isect.edge[0]);
          updateRoadNode(isect.edge[1]);
          updateRoadNode(isect.point);
          a = isect.point;
        }
        addEdge(a, ghost.focus, graph);
        updateRoadNode(a);
        updateRoadNode(ghost.focus);
      }
      ghost.anchor = null;
      console.log("Number of nodes:", graph.size);
      printGraph(graph);
    } else {
      ghost.anchor = ghost.focus;
      ghost.focus = vec3.clone(ghost.focus);
    }
  }
});

ui.canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" && e.button === 1) isMiddleDown = false;
  isTranslating = false;
});

// # for each frame
requestAnimationFrame(function frame(prev: number, time = prev) {
  const delta = time - prev;
  if (delta > 34) console.info(`raf delta: ${delta}ms.`);

  // ## update camera materices
  const { clientWidth, clientHeight } = ui.canvas;
  mat4.ortho(projection, 0, clientWidth, clientHeight, 0, 0, 1);

  // ## clear screen
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  mat4.identity(model);
  const gray: ReadonlyVec4 = [0, 0, 0, 0.25];
  for (const segment of roadSegments) {
    drawFlat(view, projection, model, gray, segment.vao, gl.TRIANGLES, 6);
  }

  for (const node of roadNodes.values()) {
    drawFlat(
      view,
      projection,
      model,
      [0, 0, 0, 0.125],
      node.vao,
      gl.TRIANGLES,
      node.elementCount,
    );
  }

  mat4.identity(model);
  for (const e of getEdges(graph)) {
    updateVAO(
      new Float32Array(e.flatMap((n) => [...n])),
      new Uint32Array([0, 1]),
    );
    drawFlat(view, projection, model, gray, vao, gl.LINES, 2);
  }

  for (const n of graph.keys()) {
    mat4.fromTranslation(model, n);
    drawNode(view, projection, model, [0, 0, 0, 1], 2, false);
  }

  mat4.identity(model);
  const blue: ReadonlyVec4 = [0, 0.5, 1, 1];
  if (ghost.anchor) {
    updateVAO(
      new Float32Array([...ghost.anchor, ...ghost.focus]),
      new Uint32Array([0, 1]),
    );
    drawFlat(view, projection, model, blue, vao, gl.LINES, 2);
    mat4.fromTranslation(model, ghost.anchor);
    drawNode(view, projection, model, blue, 2, false);
  }

  mat4.fromTranslation(model, ghost.focus);
  drawNode(view, projection, model, blue, 2, false);

  requestAnimationFrame(frame.bind(null, time));
});

export {};
