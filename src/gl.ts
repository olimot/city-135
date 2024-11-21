import { ReadonlyMat4, ReadonlyVec4 } from "gl-matrix";

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

export function createPointShader(gl: WebGL2RenderingContext) {
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
  uniform float radius;
  in vec3 vPosition;
  out vec4 finalColor;
  void main() {
    if (length(vPosition) > radius) discard;
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
    radius: gl.getUniformLocation(program, "radius")!,
  };

  const vs = [-8, -8, 0, -8, 8, 0, 8, 8, 0, 8, -8, 0];
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
    radius: number,
    depthTest = true,
  ) => {
    // ## draw
    gl.useProgram(program);

    // ### set uniforms
    gl.uniformMatrix4fv(loc.view, false, view);
    gl.uniformMatrix4fv(loc.projection, false, projection);
    gl.uniformMatrix4fv(loc.model, false, model);
    gl.uniform4fv(loc.color, color);
    gl.uniform1f(loc.radius, radius);

    // ### set global state
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl[depthTest ? "enable" : "disable"](gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    // ### bind vertex array and draw
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, ids.length, gl.UNSIGNED_BYTE, 0);
    gl.bindVertexArray(null);
  };
}

export function createFlatShader(gl: WebGL2RenderingContext) {
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
    mode: number,
    count: number,
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
    gl.bindVertexArray(vertexArray);
    gl.drawElements(mode, count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  };
}

export function createVertexArray(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const elementBuffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
  gl.bindVertexArray(null);
  const updateVAO = (vertices: Float32Array, elements: Uint32Array) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elements, gl.STATIC_DRAW);
  };
  return [vao, updateVAO] as const;
}
