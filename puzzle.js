const refrigeratorPuzzle = {
  boardX: 358,
  boardY: 38,
  cellSize: 244 / 6,
  pieces: [],
  dragging: null,
  finishing: false,
};

function resetRefrigeratorPuzzle() {
  const colors = ['#b8c6ba', '#d3b6a3', '#b6c4d2', '#dfcf9e', '#c5b5c2', '#b8cec9'];
  const edges = [
    { top: 0, right: 1, bottom: 1, left: 0 },
    { top: 0, right: 0, bottom: -1, left: -1 },
    { top: -1, right: -1, bottom: -1, left: 0 },
    { top: 1, right: 0, bottom: 1, left: 1 },
    { top: 1, right: 1, bottom: 0, left: 0 },
    { top: -1, right: 0, bottom: 0, left: -1 },
  ];
  const sourcePositions = [
    { x: 20, y: 28 }, { x: 615, y: 28 },
    { x: 20, y: 126 }, { x: 615, y: 126 },
    { x: 20, y: 224 }, { x: 615, y: 224 },
  ];
  refrigeratorPuzzle.pieces = [];
  for (let groupIndex = 0; groupIndex < 6; groupIndex++) {
    const column = groupIndex % 2;
    const row = Math.floor(groupIndex / 2);
    const targetX = refrigeratorPuzzle.boardX + column * 3 * refrigeratorPuzzle.cellSize;
    const targetY = refrigeratorPuzzle.boardY + row * 2 * refrigeratorPuzzle.cellSize;
    refrigeratorPuzzle.pieces.push({
      cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
      edges: edges[groupIndex],
      targetX,
      targetY,
      x: sourcePositions[groupIndex].x,
      y: sourcePositions[groupIndex].y,
      color: colors[groupIndex],
    });
  }
  for (const piece of refrigeratorPuzzle.pieces) {
    piece.startX = piece.x;
    piece.startY = piece.y;
    piece.placed = false;
  }
  refrigeratorPuzzle.dragging = null;
  refrigeratorPuzzle.finishing = false;
}

function puzzlePiecePath(piece, positionX, positionY) {
  const cellSize = refrigeratorPuzzle.cellSize;
  const width = (Math.max(...piece.cells.map(cell => cell[0])) + 1) * cellSize;
  const height = (Math.max(...piece.cells.map(cell => cell[1])) + 1) * cellSize;
  const tabDepth = cellSize * 0.2;
  const tabHalfWidth = cellSize * 0.18;
  const centerX = positionX + width / 2;
  const centerY = positionY + height / 2;
  const path = new Path2D();

  path.moveTo(positionX, positionY);
  if (piece.edges.top) {
    path.lineTo(centerX - tabHalfWidth, positionY);
    path.bezierCurveTo(centerX - tabHalfWidth, positionY - piece.edges.top * tabDepth, centerX + tabHalfWidth, positionY - piece.edges.top * tabDepth, centerX + tabHalfWidth, positionY);
  }
  path.lineTo(positionX + width, positionY);
  if (piece.edges.right) {
    path.lineTo(positionX + width, centerY - tabHalfWidth);
    path.bezierCurveTo(positionX + width + piece.edges.right * tabDepth, centerY - tabHalfWidth, positionX + width + piece.edges.right * tabDepth, centerY + tabHalfWidth, positionX + width, centerY + tabHalfWidth);
  }
  path.lineTo(positionX + width, positionY + height);
  if (piece.edges.bottom) {
    path.lineTo(centerX + tabHalfWidth, positionY + height);
    path.bezierCurveTo(centerX + tabHalfWidth, positionY + height + piece.edges.bottom * tabDepth, centerX - tabHalfWidth, positionY + height + piece.edges.bottom * tabDepth, centerX - tabHalfWidth, positionY + height);
  }
  path.lineTo(positionX, positionY + height);
  if (piece.edges.left) {
    path.lineTo(positionX, centerY + tabHalfWidth);
    path.bezierCurveTo(positionX - piece.edges.left * tabDepth, centerY + tabHalfWidth, positionX - piece.edges.left * tabDepth, centerY - tabHalfWidth, positionX, centerY - tabHalfWidth);
  }
  path.closePath();
  return path;
}

function drawPuzzlePiece(context, piece, positionX, positionY, fillColor, strokeColor) {
  const path = puzzlePiecePath(piece, positionX, positionY);
  context.fillStyle = fillColor;
  context.fill(path);
  context.strokeStyle = strokeColor;
  context.lineWidth = 2;
  context.stroke(path);
}

function drawRefrigeratorPuzzle(context) {
  context.fillStyle = '#b5b5b5';
  context.fillRect(0, 0, 960, 320);
  context.fillStyle = '#777777';
  context.fillRect(refrigeratorPuzzle.boardX, refrigeratorPuzzle.boardY, 244, 244);
  for (const piece of refrigeratorPuzzle.pieces) {
    drawPuzzlePiece(context, piece, piece.targetX, piece.targetY, '#969696', '#777777');
  }
  for (const piece of refrigeratorPuzzle.pieces) {
    if (piece !== refrigeratorPuzzle.dragging?.piece) drawPuzzlePiece(context, piece, piece.x, piece.y, piece.color, '#555555');
  }
  if (refrigeratorPuzzle.dragging) {
    const piece = refrigeratorPuzzle.dragging.piece;
    drawPuzzlePiece(context, piece, piece.x, piece.y, piece.color, '#555555');
  }
}

function puzzlePointerPosition(event) {
  const rectangle = canvas.getBoundingClientRect();
  return { x: (event.clientX - rectangle.left) * canvas.width / rectangle.width, y: (event.clientY - rectangle.top) * canvas.height / rectangle.height };
}

document.addEventListener('pointerdown', event => {
  if (event.target !== canvas || currentSceneId !== 'refrigerator' || sceneTransition.active || refrigeratorPuzzle.finishing || event.button !== 0) return;
  window.soundEngine.ensureResume();
  const position = puzzlePointerPosition(event);
  const piece = [...refrigeratorPuzzle.pieces].reverse().find(candidate =>
    !candidate.placed && ctx.isPointInPath(puzzlePiecePath(candidate, candidate.x, candidate.y), position.x, position.y));
  if (!piece) return;
  refrigeratorPuzzle.dragging = { piece, offsetX: position.x - piece.x, offsetY: position.y - piece.y, pointerId: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', event => {
  const drag = refrigeratorPuzzle.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const position = puzzlePointerPosition(event);
  drag.piece.x = position.x - drag.offsetX;
  drag.piece.y = position.y - drag.offsetY;
  event.preventDefault();
});

function finishPuzzleDrag(event, cancelled = false) {
  const drag = refrigeratorPuzzle.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const piece = drag.piece;
  refrigeratorPuzzle.dragging = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!cancelled && Math.hypot(piece.x - piece.targetX, piece.y - piece.targetY) <= refrigeratorPuzzle.cellSize * 0.8) {
    piece.x = piece.targetX;
    piece.y = piece.targetY;
    piece.placed = true;
    window.soundEngine.playPuzzleSound();
    if (refrigeratorPuzzle.pieces.every(candidate => candidate.placed)) {
      refrigeratorPuzzle.finishing = true;
      window.soundEngine.playPuzzleSound(true);
      completeTask('cat_treats');
      gameFlow.fridgeEver = true;
      gameFlow.catTreats = true;
      window.setTimeout(() => {
        if (currentSceneId === 'refrigerator' && refrigeratorPuzzle.finishing) sceneTransition.start('living_room', 120);
      }, 700);
    }
  } else {
    piece.x = piece.startX;
    piece.y = piece.startY;
  }
}

canvas.addEventListener('pointerup', event => finishPuzzleDrag(event));
canvas.addEventListener('pointercancel', event => finishPuzzleDrag(event, true));