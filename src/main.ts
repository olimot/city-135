import { mat4, ReadonlyVec4, vec3 } from "gl-matrix";
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
import { initUI } from "./ui";
import { getLineLineIntersection } from "./primitive";

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
    console.log("isects:", ...ghost.intersections);
    ghost.intersections.sort((a, b) => a.t - b.t);
  }

  if (isTranslating || isMiddleDown) {
    mat4.translate(camera, camera, movement);
    mat4.invert(view, camera);
  }
});

export interface RoadNode {
  id: number;
  vao: WebGLVertexArrayObject | null;
  updateVAO: (vertices: Float32Array, elements: Uint32Array) => void;
  elementCount: number;
  adjacencyVertices: Map<vec3, { left: vec3; right: vec3 }>;
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

const halfWidth = 8;
let idInc = 0;
function updateRoadNode(a: vec3) {
  a = node(a, graph);
  const adjacencyList = graph.get(a);
  if (!adjacencyList?.length) {
    console.log("There is no node for a road node");
    return;
  }
  console.log("updateRoadNode() for:", indexOf(a, graph));

  let roadNode = roadNodes.get(a);
  if (!roadNode) {
    const [vao, updateVAO] = createVertexArray(gl);
    roadNode = {
      id: idInc++,
      vao,
      updateVAO,
      adjacencyVertices: new Map(),
      elementCount: 0,
    };
    roadNodes.set(a, roadNode);
  }

  const sorted = adjacencyList
    .map((b) => [b, angle(a, b), indexOf(b, graph)] as const)
    .sort((b, c) => b[1] - c[1]);

  const vs = roadNode.adjacencyVertices;
  vs.clear();
  for (let i = 0; i < sorted.length; i++) {
    const [adjacency] = sorted[i];
    const aTangent = vec3.create();
    vec3.normalize(aTangent, vec3.subtract(aTangent, adjacency, a));
    const al = vec3.create();
    vec3.set(al, aTangent[1], -aTangent[0], 0);
    vec3.scaleAndAdd(al, a, al, halfWidth);

    if (sorted.length === 1) {
      const aRight = vec3.create();
      vec3.set(aRight, -aTangent[1], aTangent[0], 0);
      vec3.scaleAndAdd(aRight, a, aRight, halfWidth);
      vs.set(adjacency, { left: al, right: aRight });
    } else {
      const [nextAdjacency] = sorted[(i + 1) % sorted.length];
      const nr = vec3.create();
      const nTangent = vec3.create();
      vec3.normalize(nTangent, vec3.subtract(nTangent, nextAdjacency, a));
      vec3.set(nr, -nTangent[1], nTangent[0], 0);
      vec3.scaleAndAdd(nr, a, nr, halfWidth);
      const alEnd = vec3.scaleAndAdd(aTangent, al, aTangent, halfWidth);
      const nrEnd = vec3.scaleAndAdd(nTangent, nr, nTangent, halfWidth);
      const isect = getLineLineIntersection([al, alEnd], [nr, nrEnd], false);
      if (!isect) continue; // two lines are overlayed
      let avs = vs.get(adjacency);
      if (!avs) vs.set(adjacency, (avs = { left: null!, right: null! }));
      avs.left = isect[1];
      let nvs = vs.get(nextAdjacency);
      if (!nvs) vs.set(nextAdjacency, (nvs = { left: null!, right: null! }));
      nvs.right = isect[1];
    }
  }
  const jointVerts: number[] = [...a];
  const jointElements: number[] = [];
  let i = 1;
  for (const [b, thisVertices] of vs) {
    jointVerts.push(...thisVertices.right, ...thisVertices.left);
    jointElements.push(0, i++, i++);

    if (b === a) continue;
    const otherRoadNode = roadNodes.get(b);
    if (!otherRoadNode) continue;
    const otherVertices = otherRoadNode.adjacencyVertices.get(a);
    if (!otherVertices) continue;
    let segment = roadSegments.find(
      (seg) =>
        (seg.nodes[0] === roadNode && seg.nodes[1] === otherRoadNode) ||
        (seg.nodes[0] === otherRoadNode && seg.nodes[1] === roadNode),
    );
    if (!segment) {
      const [vao, updateVAO] = createVertexArray(gl);
      segment = { vao, updateVAO, nodes: [roadNode, otherRoadNode] };
      roadSegments.push(segment);
      console.log("road segment added:", indexOf(a, graph), indexOf(b, graph));
    } else {
      console.log("road segment found:", indexOf(a, graph), indexOf(b, graph));
    }

    const verts = [
      ...thisVertices.left,
      ...thisVertices.right,
      ...otherVertices.left,
      ...otherVertices.right,
    ];
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
        console.log("isects:", ...ghost.intersections);
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
