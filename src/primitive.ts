import { ReadonlyVec3, vec3 } from "gl-matrix";
import { toStringFromVec3 } from "./graph";

export const tolerance = 0.1;

const x = vec3.create();
const r = vec3.create();
const s = vec3.create();

/**
 * find line(a)-line(b) intersection point. only x and y of line points(vec3) should be used (z is 0.)
 * @param a a line
 * @param b another line
 * @returns intersection point (or null if not exists)
 */
export function getLineLineIntersection(
  a: readonly [vec3, vec3],
  b: readonly [vec3, vec3],
  strict?: true,
): [number, vec3] | null;
export function getLineLineIntersection(
  a: readonly [vec3, vec3],
  b: readonly [vec3, vec3],
  strict: false,
): [number, vec3];
export function getLineLineIntersection(
  a: readonly [vec3, vec3],
  b: readonly [vec3, vec3],
  strict = true,
): [number, vec3] | null {
  const [p, pEnd] = a;
  const [q, qEnd] = b;
  vec3.sub(r, pEnd, p);
  vec3.sub(s, qEnd, q);

  const rlen = vec3.length(r);
  if (rlen < tolerance) {
    console.log("line r is not long enough");
    return null;
  }

  const slen = vec3.length(s);
  if (slen < tolerance) {
    console.log("line s is not long enough");
    return null;
  }

  const denominator = vec3.cross(x, r, s)[2];
  if (!denominator) {
    if (vec3.distance(p, q) < tolerance || vec3.distance(p, qEnd) < tolerance) {
      return [0, p];
    }
    if (vec3.distance(q, pEnd) < tolerance) return [1, q];
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
  if (vec3.distance(x, p) < tolerance) return [t, p];
  if (vec3.distance(x, pEnd) < tolerance) return [t, pEnd];
  if (vec3.distance(x, q) < tolerance) return [t, q];
  if (vec3.distance(x, qEnd) < tolerance) return [t, qEnd];

  return [t, vec3.clone(x)];
}

const t = vec3.create();

export function getClosestPointOnLine(
  line: [vec3, vec3],
  point: ReadonlyVec3,
): vec3 {
  vec3.subtract(t, line[1], line[0]);
  const length = vec3.length(t);
  vec3.subtract(x, point, line[0]);
  const xDotT = vec3.dot(x, vec3.normalize(t, t));
  if (xDotT < 0) return line[0];
  if (xDotT > length) return line[1];
  vec3.add(x, line[0], vec3.scale(t, t, xDotT));
  return vec3.clone(x);
}
