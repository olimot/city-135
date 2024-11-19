import { vec3 } from "gl-matrix";

const x = vec3.create();
const r = vec3.create();
const s = vec3.create();

/**
 * find line(a)-line(b) intersection point. only x and y of line points(vec3) should be used (z is 0.)
 * @param a a line
 * @param b another line
 * @returns intersection point (or null if not exists)
 */
export function getLineLineIntersection(a: [vec3, vec3], b: [vec3, vec3]) {
  const [p, pEnd] = a;
  const [q, qEnd] = b;
  vec3.sub(r, pEnd, p);
  vec3.sub(s, qEnd, q);
  
  const denominator = vec3.cross(x, r, s)[2];
  if (!denominator) return null;

  const t = vec3.cross(x, vec3.sub(x, q, p), s)[2] / denominator;
  const u = vec3.cross(x, vec3.sub(x, q, p), r)[2] / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  vec3.add(x, p, vec3.scale(x, r, t));
  if (vec3.equals(x, p)) return p;
  if (vec3.equals(x, pEnd)) return pEnd;
  if (vec3.equals(x, q)) return q;
  if (vec3.equals(x, qEnd)) return qEnd;
  return vec3.clone(x);
}

const t = vec3.create();

export function getClosestPointOnLine(line: [vec3, vec3], point: vec3): vec3 {
  vec3.subtract(t, line[1], line[0]);
  const length = vec3.length(t);
  vec3.subtract(x, point, line[0]);
  const xDotT = vec3.dot(x, vec3.normalize(t, t));
  if (xDotT < 0) return line[0];
  if (xDotT > length) return line[1];
  vec3.add(x, line[0], vec3.scale(t, t, xDotT));
  return x;
}
