import { vec3 } from "gl-matrix";
import { getClosestPointOnLine, tolerance } from "./primitive";

export type Graph = Map<vec3, vec3[]>;

export function createGraph(): Graph {
  return new Map<vec3, vec3[]>();
}

export function node(a: vec3, graph: Graph) {
  if (graph.has(a)) return a;
  for (const node of graph.keys()) {
    if (vec3.distance(node, a) < tolerance) return node;
  }
  return a;
}

export function getAdjacencyList(a: vec3, graph: Graph): vec3[] {
  a = node(a, graph);
  let adjacencyList = graph.get(a);
  if (adjacencyList) return adjacencyList;
  adjacencyList = [];
  graph.set(a, adjacencyList);
  return adjacencyList;
}

export function indexOf(a: vec3, graph: Graph) {
  a = node(a, graph);
  let i = 0;
  for (const p of graph.keys()) {
    if (p === a) return i;
    i += 1;
  }
  return -1;
}

export function toStringFromVec3(a: vec3) {
  return `(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;
}

export function printGraph(graph: Graph) {
  let i = 0;
  for (const [node, adjacencyList] of graph) {
    console.log(
      `[${i}] ${toStringFromVec3(node)} =`,
      [...adjacencyList].map((n) => indexOf(n, graph)),
    );
    i += 1;
  }
  console.log("--");
}

export function addEdge(a: vec3, b: vec3, graph: Graph) {
  a = node(a, graph);
  b = node(b, graph);
  if (a === b || vec3.distance(a, b) < tolerance) return false;
  const aAdjList = getAdjacencyList(a, graph);
  if (aAdjList.includes(b)) return false;
  aAdjList.push(b);
  getAdjacencyList(b, graph).push(a);
  return true;
}

export function removeEdge(a: vec3, b: vec3, graph: Graph) {
  a = node(a, graph);
  b = node(b, graph);
  const aAdjList = getAdjacencyList(a, graph);
  const bIdx = aAdjList.indexOf(b);
  if (bIdx === -1) return false;
  aAdjList.splice(bIdx, 1);
  const bAdjList = getAdjacencyList(b, graph);
  bAdjList.splice(bAdjList.indexOf(a), 1);
  return true;
}

export function* getEdges(graph: Graph) {
  const visited = new Map<vec3, Set<vec3>>();
  for (const [node, adjacencyList] of graph) {
    const visitedFromThisNode = new Set<vec3>();
    visited.set(node, visitedFromThisNode);
    for (const otherNode of adjacencyList) {
      if (visited.get(otherNode)?.has(node)) continue;
      visitedFromThisNode.add(otherNode);
      yield [node, otherNode] as [vec3, vec3];
    }
  }
}

export function findSnapPoint(
  out: vec3,
  graph: Graph,
  p: vec3,
  r: number,
): [vec3, vec3] | null {
  for (const node of graph.keys()) {
    if (vec3.distance(p, vec3.copy(out, node)) <= r) {
      return null;
    }
  }
  for (const edge of getEdges(graph)) {
    const node = getClosestPointOnLine(out, edge, p);
    const distance = vec3.distance(p, node);
    if (distance <= r) return edge;
  }
  vec3.copy(out, p);
  return null;
}
