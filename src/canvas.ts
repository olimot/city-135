import { mat4, ReadonlyMat4, vec3 } from "gl-matrix";

export const getClipSpacePoint = (
  out: vec3,
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
) => {
  out[0] = (x / canvas.clientWidth) * 2 - 1;
  out[1] = (-y / canvas.clientHeight) * 2 + 1;
  out[2] = -1;
  return out;
};

const tmp0 = mat4.create();
export const setPointerPoint = (
  out: vec3,
  outMovement: vec3,
  projection: ReadonlyMat4,
  view: ReadonlyMat4,
  e: PointerEvent,
) => {
  const invViewProj = mat4.invert(tmp0, mat4.multiply(tmp0, projection, view));
  const canvas = e.target as HTMLCanvasElement;

  getClipSpacePoint(out, e.offsetX, e.offsetY, canvas);
  vec3.transformMat4(out, out, invViewProj);

  const pX = e.offsetX - e.movementX;
  const pY = e.offsetY - e.movementY;
  getClipSpacePoint(outMovement, pX, pY, canvas);
  vec3.transformMat4(outMovement, outMovement, invViewProj);
  vec3.subtract(outMovement, outMovement, out);
};
