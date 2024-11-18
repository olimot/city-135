import { vec3 } from "gl-matrix";

export class RoadPath {
  private readonly tangent = vec3.create();
  private readonly vector = vec3.create();
  private readonly tmp = vec3.create();
  private readonly polygon: [
    aLeft: vec3,
    aRight: vec3,
    bLeft: vec3,
    bRight: vec3,
  ] = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];

  constructor(
    public a: vec3,
    public b: vec3,
    public width: number,
  ) {
    this.computePolygon();
  }

  getLength() {
    return vec3.distance(this.a, this.b);
  }

  getVector() {
    return vec3.subtract(this.vector, this.b, this.a);
  }

  getTangent() {
    return vec3.normalize(this.tangent, this.getVector());
  }

  computePolygon() {
    const halfWidth = this.width / 2;
    const tangent = this.getTangent();
    vec3.set(this.polygon[0], -tangent[1], tangent[0], 0);
    vec3.scaleAndAdd(this.polygon[0], this.a, this.polygon[0], halfWidth);
    vec3.set(this.polygon[1], tangent[1], -tangent[0], 0);
    vec3.scaleAndAdd(this.polygon[1], this.a, this.polygon[1], halfWidth);
    vec3.set(this.polygon[2], tangent[1], -tangent[0], 0);
    vec3.scaleAndAdd(this.polygon[2], this.b, this.polygon[2], halfWidth);
    vec3.set(this.polygon[3], -tangent[1], tangent[0], 0);
    vec3.scaleAndAdd(this.polygon[3], this.b, this.polygon[3], halfWidth);
    return this.polygon;
  }

  getPolygon() {
    return this.polygon;
  }

  getIntersectionPoint(other: RoadPath) {
    // line points a and b are vec3 but it should use only x and y (z is 0).
    const p = this.a;
    const q = other.a;
    const r = this.getVector();
    const s = other.getVector();
    const { tmp: x } = this;
    const denominator = vec3.cross(x, r, s)[2];
    if (!denominator) return null;

    const t = vec3.cross(x, vec3.sub(x, q, p), s)[2] / denominator;
    const u = vec3.cross(x, vec3.sub(x, q, p), r)[2] / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    vec3.add(x, p, vec3.scale(x, r, t));
    if (vec3.equals(x, this.a)) return this.a;
    if (vec3.equals(x, this.b)) return this.b;
    if (vec3.equals(x, other.a)) return other.a;
    if (vec3.equals(x, other.b)) return other.b;
    return vec3.clone(x);
  }
}

export interface Polygon {
  points: vec3[];
}

export class RoadLayout {
  nodes: vec3[] = [];
  paths: RoadPath[] = [];
  nodePolygons = new Map<vec3, Polygon>();
  pathPolygons = new Map<RoadPath, Polygon>();
}
