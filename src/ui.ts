export function initUI() {
  // # setup canvas
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  
  // ## setup resize handler
  let resizeTask: number = 0;
  new ResizeObserver(([entry]) => {
    clearTimeout(resizeTask);
    const width = entry.devicePixelContentBoxSize[0].inlineSize;
    const height = entry.devicePixelContentBoxSize[0].blockSize;
    resizeTask = setTimeout(
      () => Object.assign(canvas, { width, height }),
      150,
    );
  }).observe(canvas, { box: "content-box" });

  const q = '[name="active-tool"][checked]';
  const e = document.querySelector(q) as HTMLInputElement | null;

  const ui = { canvas, activeTool: e?.value ?? "none" };

  document.addEventListener("change", (event) => {
    const e = event.target;
    if (e instanceof HTMLInputElement && e.name === "active-tool") {
      ui.activeTool = e.value;
    }
  });

  return ui;
}
