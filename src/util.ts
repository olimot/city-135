export function copyVec3Element(
  output: Record<number, number>,
  outputOffset: number,
  input: Record<number, number>,
  inputOffset: number,
) {
  output[outputOffset + 0] = input[inputOffset + 0];
  output[outputOffset + 1] = input[inputOffset + 1];
  output[outputOffset + 2] = input[inputOffset + 2];
}
