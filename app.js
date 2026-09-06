const WIN_LENGTH = 5;

const boardEl = document.querySelector("#board");
const statusText = document.querySelector("#statusText");
const currentPlayerEl = document.querySelector("#currentPlayer");
const phaseText = document.querySelector("#phaseText");
const rotationPanel = document.querySelector("#rotationPanel");
const boardPicker = document.querySelector(".board-picker");
const resetButton = document.querySelector("#resetButton");
const undoButton = document.querySelector("#undoButton");

const players = {
  black: { label: "黑方", next: "white" },
  white: { label: "白方", next: "black" },
};

const boardConfigs = {
  compact: {
    label: "紧凑棋盘",
    size: 6,
    quadrants: [
      [0, 0],
      [0, 3],
      [3, 0],
      [3, 3],
    ],
  },
  cross: {
    label: "十字棋盘",
    size: 7,
    quadrants: [
      [0, 0],
      [0, 4],
      [4, 0],
      [4, 4],
    ],
  },
};

let board;
let currentPlayer;
let phase;
let winner;
let winningCells;
let history;
let isAnimating;
let boardStyle = "compact";

function getConfig() {
  return boardConfigs[boardStyle];
}

function createEmptyBoard() {
  return Array.from({ length: getConfig().size }, () => Array(getConfig().size).fill(null));
}

function cloneBoard(source) {
  return source.map((row) => [...row]);
}

function resetGame() {
  if (isAnimating) return;
  board = createEmptyBoard();
  currentPlayer = "black";
  phase = "place";
  winner = null;
  winningCells = [];
  history = [];
  isAnimating = false;
  render();
}

function saveHistory() {
  history.push({
    board: cloneBoard(board),
    currentPlayer,
    phase,
    winner,
    winningCells: winningCells.map((cell) => [...cell]),
  });
}

function undo() {
  if (isAnimating) return;
  const previous = history.pop();
  if (!previous) return;
  board = cloneBoard(previous.board);
  currentPlayer = previous.currentPlayer;
  phase = previous.phase;
  winner = previous.winner;
  winningCells = previous.winningCells.map((cell) => [...cell]);
  render();
}

function placeStone(row, col) {
  if (isAnimating || phase !== "place" || winner || board[row][col]) return;

  saveHistory();
  board[row][col] = currentPlayer;
  const result = findWinner();
  if (result) {
    finishGame(result);
    return;
  }

  if (isBoardFull()) {
    phase = "done";
    statusText.textContent = "棋盘已满，平局。";
    render();
    return;
  }

  phase = "rotate";
  render();
}

async function rotateQuadrant(quadrant, dir) {
  if (isAnimating || phase !== "rotate" || winner) return;

  saveHistory();
  isAnimating = true;
  renderStatus();
  await animateQuadrant(quadrant, dir);

  const [startRow, startCol] = getConfig().quadrants[quadrant];
  const snapshot = [];

  for (let row = 0; row < 3; row += 1) {
    snapshot[row] = [];
    for (let col = 0; col < 3; col += 1) {
      snapshot[row][col] = board[startRow + row][startCol + col];
    }
  }

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const sourceRow = dir === 1 ? 2 - col : col;
      const sourceCol = dir === 1 ? row : 2 - row;
      board[startRow + row][startCol + col] = snapshot[sourceRow][sourceCol];
    }
  }

  const result = findWinner();
  if (result) {
    isAnimating = false;
    finishGame(result);
    return;
  }

  currentPlayer = players[currentPlayer].next;
  phase = "place";
  isAnimating = false;
  render();
}

function animateQuadrant(quadrant, dir) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    return Promise.resolve();
  }

  const [startRow, startCol] = getConfig().quadrants[quadrant];
  const boardRect = boardEl.getBoundingClientRect();
  const firstCell = getCellElement(startRow, startCol);
  const lastCell = getCellElement(startRow + 2, startCol + 2);
  if (!firstCell || !lastCell) {
    return Promise.resolve();
  }

  const firstRect = firstCell.getBoundingClientRect();
  const lastRect = lastCell.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = `quadrant-overlay ${dir === 1 ? "clockwise" : "counterclockwise"}`;
  overlay.style.left = `${firstRect.left - boardRect.left}px`;
  overlay.style.top = `${firstRect.top - boardRect.top}px`;
  overlay.style.width = `${lastRect.right - firstRect.left}px`;
  overlay.style.height = `${lastRect.bottom - firstRect.top}px`;
  overlay.style.setProperty("--cell-size", `${firstRect.width}px`);
  overlay.style.setProperty("--quadrant-gap", getComputedStyle(boardEl).gap.split(" ")[0]);

  const sourceCells = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const source = getCellElement(startRow + row, startCol + col);
      sourceCells.push(source);
      source.classList.add("rotating-source");

      const clone = source.cloneNode(true);
      clone.removeAttribute("id");
      clone.disabled = true;
      clone.classList.remove("rotating-source", "can-place");
      overlay.append(clone);
    }
  }

  boardEl.append(overlay);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.removeEventListener("animationend", finish);
      overlay.remove();
      for (const cell of sourceCells) {
        cell.classList.remove("rotating-source");
      }
      resolve();
    };

    overlay.addEventListener("animationend", finish, { once: true });
    window.setTimeout(finish, 520);
  });
}

function findWinner() {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  const wins = [];
  const size = getConfig().size;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const player = board[row][col];
      if (!player) continue;

      for (const [dr, dc] of directions) {
        const cells = [];
        for (let step = 0; step < WIN_LENGTH; step += 1) {
          const nextRow = row + dr * step;
          const nextCol = col + dc * step;
          if (!isInside(nextRow, nextCol) || board[nextRow][nextCol] !== player) {
            break;
          }
          cells.push([nextRow, nextCol]);
        }

        if (cells.length === WIN_LENGTH) {
          wins.push({ player, cells });
        }
      }
    }
  }

  if (!wins.length) return null;
  const blackWin = wins.find((win) => win.player === "black");
  const whiteWin = wins.find((win) => win.player === "white");
  if (blackWin && whiteWin) {
    return { player: "draw", cells: [...blackWin.cells, ...whiteWin.cells] };
  }
  return blackWin || whiteWin;
}

function finishGame(result) {
  winner = result.player;
  winningCells = result.cells;
  phase = "done";
  render();
}

function isInside(row, col) {
  const size = getConfig().size;
  return row >= 0 && row < size && col >= 0 && col < size;
}

function isBoardFull() {
  return board.every((row) => row.every(Boolean));
}

function isWinningCell(row, col) {
  return winningCells.some(([winRow, winCol]) => winRow === row && winCol === col);
}

function getCellElement(row, col) {
  return boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function isCrossCell(row, col) {
  return boardStyle === "cross" && (row === 3 || col === 3);
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.className = `board ${boardStyle === "cross" ? "board-cross" : "board-compact"}`;
  boardEl.setAttribute("aria-label", `${getConfig().size}乘${getConfig().size}棋盘`);

  for (let row = 0; row < getConfig().size; row += 1) {
    for (let col = 0; col < getConfig().size; col += 1) {
      const cell = document.createElement("button");
      cell.className = `cell ${isCrossCell(row, col) ? "cross-cell" : ""}`;
      cell.type = "button";
      cell.role = "gridcell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("aria-label", `${row + 1}行${col + 1}列`);
      cell.disabled = isAnimating || phase !== "place" || Boolean(winner) || Boolean(board[row][col]);

      if (!cell.disabled) {
        cell.classList.add("can-place");
      }

      if (isWinningCell(row, col)) {
        cell.classList.add("winning");
      }

      const stone = board[row][col];
      if (stone) {
        const marble = document.createElement("span");
        marble.className = `marble ${stone}`;
        cell.append(marble);
      }

      cell.addEventListener("click", () => placeStone(row, col));
      boardEl.append(cell);
    }
  }
}

function renderStatus() {
  currentPlayerEl.textContent = players[currentPlayer].label;
  currentPlayerEl.className = `player-chip ${currentPlayer}`;
  phaseText.textContent = phase === "place" ? "落子" : phase === "rotate" ? "旋转" : "结束";
  undoButton.disabled = isAnimating || history.length === 0;
  resetButton.disabled = isAnimating;

  for (const button of boardPicker.querySelectorAll("button")) {
    button.disabled = isAnimating;
    button.classList.toggle("active", button.dataset.boardStyle === boardStyle);
  }

  for (const button of rotationPanel.querySelectorAll("button")) {
    button.disabled = isAnimating || phase !== "rotate" || Boolean(winner);
  }

  if (winner === "draw") {
    statusText.textContent = "双方同时五连，平局。";
  } else if (winner) {
    statusText.textContent = `${players[winner].label}五子相连，获胜！`;
  } else if (isAnimating) {
    statusText.textContent = "棋盘正在旋转...";
  } else if (phase === "rotate") {
    statusText.textContent = `${players[currentPlayer].label}已落子，请选择一个角旋转 90 度。`;
  } else if (phase === "done") {
    statusText.textContent = "棋盘已满，平局。";
  } else {
    statusText.textContent = `${players[currentPlayer].label}回合，请落子。`;
  }
}

function render() {
  renderBoard();
  renderStatus();
}

rotationPanel.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-quadrant]");
  if (!button) return;
  rotateQuadrant(Number(button.dataset.quadrant), Number(button.dataset.dir));
});

boardPicker.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-board-style]");
  if (!button || isAnimating || button.dataset.boardStyle === boardStyle) return;
  boardStyle = button.dataset.boardStyle;
  resetGame();
});

resetButton.addEventListener("click", resetGame);
undoButton.addEventListener("click", undo);

resetGame();
