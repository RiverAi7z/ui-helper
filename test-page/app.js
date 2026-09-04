const stage = document.querySelector("#motion-stage");
const runButton = document.querySelector("#run-motion");
const resetButton = document.querySelector("#reset-motion");
const themeButton = document.querySelector("#theme-button");
const canvas = document.querySelector("#demo-canvas");
const context = canvas.getContext("2d");

runButton.addEventListener("click", () => {
  stage.classList.remove("running");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => stage.classList.add("running")),
  );
});

resetButton.addEventListener("click", () => stage.classList.remove("running"));
themeButton.addEventListener("click", () =>
  document.body.classList.toggle("dark"),
);

function drawCanvas(time) {
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = document.body.classList.contains("dark")
    ? "#202733"
    : "#fffaf0";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#c8bfae";
  context.setLineDash([6, 8]);
  for (let x = 40; x < width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const progress = (Math.sin(time / 700) + 1) / 2;
  const x = 100 + progress * (width - 200);
  const y = height / 2 + Math.sin(time / 350) * 54;
  context.setLineDash([]);
  context.fillStyle = "#1c78ff";
  context.beginPath();
  context.arc(x, y, 34, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#17191d";
  context.font = "700 26px Manrope, sans-serif";
  context.fillText("Animated canvas — select this with a region", 42, 52);
  requestAnimationFrame(drawCanvas);
}

requestAnimationFrame(drawCanvas);
