import { ReadonlyMat4, ReadonlyVec4 } from "gl-matrix";

export function createProgram(gl: WebGL2RenderingContext) {
  // # create program
  const vert = gl.createShader(gl.VERTEX_SHADER) as WebGLShader;
  const frag = gl.createShader(gl.FRAGMENT_SHADER) as WebGLShader;
  gl.shaderSource(
    vert,
    /* glsl */ `#version 300 es
  uniform mat4 model;
  uniform mat4 view;
  uniform mat4 projection;
  in vec4 POSITION;
  out vec3 vPosition;
  void main() {
    vPosition = POSITION.xyz;
    gl_Position = POSITION;
    gl_Position = projection * view * model * gl_Position;
  }
`,
  );
  gl.shaderSource(
    frag,
    /* glsl */ `#version 300 es
  precision highp float;
  uniform vec4 color;
  in vec3 vPosition;
  out vec4 finalColor;
  void main() {
    if (length(vPosition) > 4.0) discard;
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
    model: gl.getUniformLocation(program, "model")!,
    view: gl.getUniformLocation(program, "view")!,
    projection: gl.getUniformLocation(program, "projection")!,
    color: gl.getUniformLocation(program, "color")!,
  };

  const vs = [-4, -4, 0, -4, 4, 0, 4, 4, 0, 4, -4, 0];
  const ids = [0, 1, 2, 2, 3, 0];

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vs), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(ids), gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return (
    view: ReadonlyMat4,
    projection: ReadonlyMat4,
    model: ReadonlyMat4,
    color: ReadonlyVec4,
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
    gl.enable(gl.BLEND);

    // ### bind vertex array and draw
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, ids.length, gl.UNSIGNED_BYTE, 0);
    gl.bindVertexArray(null);
  };
}
