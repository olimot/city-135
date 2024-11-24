import { ReadonlyVec3, vec3 } from "gl-matrix";
import { toStringFromVec3 } from "./graph";

export const tolerance = 0.1;

const x = vec3.create();
const r = vec3.create();
const s = vec3.create();
const v = vec3.create();

/**
 * find line(a)-line(b) intersection point. only x and y of line points(vec3) should be used (z is 0.)
 * @param a a line
 * @param b another line
 * @returns intersection point (or null if not exists)
 */
export function getLineLineIntersection(
  a: readonly [vec3, vec3],
  b: readonly [vec3, vec3],
  strict = true,
): [vec3, number, number] | null {
  const [p, pEnd] = a;
  const [q, qEnd] = b;
  vec3.sub(r, pEnd, p);
  vec3.sub(s, qEnd, q);

  const rlen = vec3.length(r);
  if (rlen < tolerance) return null;

  const slen = vec3.length(s);
  if (slen < tolerance) return null;

  const denominator = vec3.cross(x, r, s)[2];
  if (!denominator) {
    if (vec3.distance(p, q) < tolerance) return [p, 0, 0];
    if (vec3.distance(p, qEnd) < tolerance) return [p, 0, 1];
    if (vec3.distance(pEnd, q) < tolerance) return [pEnd, 1, 0];
    if (vec3.distance(pEnd, qEnd) < tolerance) return [pEnd, 1, 1];
    console.warn(`parallel and overlay:
${toStringFromVec3(a[0])} - ${toStringFromVec3(a[1])}
${toStringFromVec3(b[0])} - ${toStringFromVec3(b[1])}`);
    return null;
  }

  const t = vec3.cross(x, vec3.sub(x, q, p), s)[2] / denominator;
  const u = vec3.cross(x, vec3.sub(x, q, p), r)[2] / denominator;

  const tTol = tolerance / rlen;
  const uTol = tolerance / slen;
  if (strict && (t < -tTol || t > 1 + tTol || u < -uTol || u > 1 + uTol)) {
    return null;
  }
  vec3.add(x, p, vec3.scale(x, r, t));
  if (vec3.distance(x, p) < tolerance) return [p, 0, u];
  if (vec3.distance(x, pEnd) < tolerance) return [pEnd, 1, u];
  if (vec3.distance(x, q) < tolerance) return [q, t, 0];
  if (vec3.distance(x, qEnd) < tolerance) return [qEnd, t, 1];

  return [vec3.clone(x), t, u];
}

export function getClosestPointOnLine(
  out: vec3,
  [a, b]: [vec3, vec3],
  p: ReadonlyVec3,
): vec3 {
  vec3.subtract(v, b, a);
  const length = vec3.length(v);
  if (length < tolerance) return a;
  const t = vec3.dot(vec3.subtract(x, p, a), vec3.normalize(v, v));
  if (t <= tolerance) return a;
  if (t >= length - tolerance) return b;
  return vec3.add(out, a, vec3.scale(v, v, t));
}


function quadBezier(out: vec3, a: vec3, b: vec3, c: vec3, t: number) {
  const invT = 1 - t;
  const f = invT * invT;
  const g = 2 * invT * t;
  const h = t * t;
  out[0] = f * a[0] + g * b[0] + h * c[0];
  out[1] = f * a[1] + g * b[1] + h * c[1];
  out[2] = f * a[2] + g * b[2] + h * c[2];
  return out;
}

export function generateQuadBezier(a: vec3, b: vec3, c: vec3, nPoints: number) {
  return Array.from(Array(nPoints), (_, i) => {
    const t = i / (nPoints - 1);
    return quadBezier(vec3.create(), a, b, c, t);
  });
}

const tmpVec3 = vec3.create();

export function simplifyPoints(
  points: vec3[],
  start = 0,
  end = points.length,
  r = 1,
  outPoints: vec3[] = [],
) {
  // find the most distance point from the endpoints
  const s = points[start];
  const e = points[end - 1];
  const max = { distSq: 0, idx: 1 };
  for (let i = start + 1; i < end - 1; ++i) {
    const p = getClosestPointOnLine(tmpVec3, [s, e], points[i]);
    const distSq = vec3.sqrDist(points[i], p);
    if (distSq > max.distSq) Object.assign(max, { distSq, idx: i });
  }

  // if that point is too far
  if (Math.sqrt(max.distSq) > r) {
    // split
    simplifyPoints(points, start, max.idx + 1, r, outPoints);
    simplifyPoints(points, max.idx, end, r, outPoints);
  } else {
    // add the 2 end points
    outPoints.push(s, e);
  }
  return outPoints;
}
