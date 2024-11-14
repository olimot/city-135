import { ReadonlyMat4, ReadonlyVec4 } from "gl-matrix";

export function createProgram(gl: WebGL2RenderingContext) {
  // # create program
  const vert = gl.createShader(gl.VERTEX_SHADER) as WebGLShader;
  const frag = gl.createShader(gl.FRAGMENT_SHADER) as WebGLShader;
  gl.shaderSource(
    vert,
    /* glsl */ `#version 300 es
  uniform mat4 view;
  uniform mat4 projection;
  uniform mat4 model;
  in vec4 POSITION;
  void main() {
    gl_Position = POSITION;
    if (model != mat4(0)) gl_Position = model * gl_Position;
    if (view != mat4(0)) gl_Position = view * gl_Position;
    if (projection != mat4(0)) gl_Position = projection * gl_Position;
  }
`,
  );
  gl.shaderSource(
    frag,
    /* glsl */ `#version 300 es
  precision highp float;
  uniform vec4 color;
  out vec4 finalColor;
  void main() {
    finalColor = color;
  }
`,
  );
  gl.compileShader(vert);
  gl.compileShader(frag);
  const program = gl.createProgram() as WebGLProgram;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.bindAttribLocation(program, 0, "POSITION");
  gl.linkProgram(program);

  let log: string | null;
  if ((log = gl.getShaderInfoLog(vert))) console.log(log);
  if ((log = gl.getShaderInfoLog(frag))) console.log(log);

  const loc = {
    view: gl.getUniformLocation(program, "view")!,
    projection: gl.getUniformLocation(program, "projection")!,
    model: gl.getUniformLocation(program, "model")!,
    color: gl.getUniformLocation(program, "color")!,
  };

  return (
    view: ReadonlyMat4,
    projection: ReadonlyMat4,
    model: ReadonlyMat4,
    color: ReadonlyVec4,
    vertexArray: WebGLVertexArrayObject | null,
    elementCount: number,
  ) => {
    // ## draw
    gl.useProgram(program);

    // ### set uniforms
    gl.uniformMatrix4fv(loc.view, false, view);
    gl.uniformMatrix4fv(loc.projection, false, projection);
    gl.uniformMatrix4fv(loc.model, false, model);
    gl.uniform4fv(loc.color, color);

    // ### set global state
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // ### bind vertex array and draw
    gl.bindVertexArray(vertexArray);
    gl.drawElements(gl.LINES, elementCount, gl.UNSIGNED_BYTE, 0);
    gl.bindVertexArray(null);
  };
}
