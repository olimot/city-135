import { vec3 } from "gl-matrix";
const x = vec3.create();
const r = vec3.create();
const s = vec3.create();

export function getLineLineIntersection(lines: [[vec3, vec3], [vec3, vec3]]) {
  const p = lines[0][0];
  const pEnd = lines[0][1];
  const q = lines[1][0];
  const qEnd = lines[1][1];
  vec3.sub(r, pEnd, p);
  vec3.sub(s, qEnd, q);

  // line points a and b are vec3 but it should use only x and y (z is 0).
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

/**
 *
 * @param joint a joint point of lines
 * @param lineEnds points of lines opposite to the joint point
 */
export default function computeJoint(joint: vec3, lineEnds: vec3[]) {
  // for each joints {
  //   sort paths by its angle (make below loop goes along counter-clockwise)
  //   for each path {
  //     get an intersection point between right outline of current path and left outline of next path
  //   }
  // }
  return [joint, lineEnds];
}
