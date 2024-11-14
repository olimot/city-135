export function initWebGL2(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
  gl.blendEquation(gl.FUNC_ADD);
  gl.colorMask(true, true, true, true);
  gl.clearColor(1, 1, 1, 1);
  gl.clearDepth(1);
  return gl;
}
