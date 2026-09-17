/* ============================================================
   異能チェス — 盤面雛形
   ------------------------------------------------------------
   実装済み: 盤面表示 / 標準的な駒の移動パターン / 通常捕獲 / ターン切替
   未実装 (TODO): HPを削るダメージ制の戦闘解決、各駒の特殊能力
   (召喚・範囲破壊・飛び越え・変身)、チェック/チェックメイト判定、
   キャラごとの専用グラフィック
   ============================================================ */

// ---- 駒データ（ここだけ異能のある世界wiki設定より）----------------
const PIECE_DATA = {
  K: {
    name: "キング", role: "王", hp: null, atk: null, tentative: true,
    ability: "駒の設定は未定。ひとまず通常のキングと同じ動き(縦横斜め1マス)。",
    glyph: { w: "♔", b: "♚" },
  },
  Q: {
    name: "嘘の悪魔", role: "クイーン", hp: 5, atk: 4, tentative: true,
    ability: "ステータス・能力ともに未定。仮の数値を表示中。",
    glyph: { w: "♕", b: "♛" },
  },
  R: {
    name: "鉄拳の悪魔", role: "ルーク", hp: 4, atk: 3, tentative: false,
    ability: "一体に限り、敵味方関係なく駒を飛び越えて移動できる。(未実装)",
    glyph: { w: "♖", b: "♜" },
  },
  B: {
    name: "海洋恐怖症", role: "ビショップ", hp: 1, atk: 2, tentative: false,
    ability: "移動した時、前後左右のいずれかに「式神《ポーン》」を召喚する。(未実装)",
    glyph: { w: "♗", b: "♝" },
  },
  N: {
    name: "情報の悪魔", role: "ナイト", hp: 3, atk: 1, tentative: false,
    ability: "移動した時、縦横1マスの全ての駒を破壊する。相手に「レンレン」がいる場合は無効化。(未実装)",
    glyph: { w: "♘", b: "♞" },
  },
  P: {
    name: "社畜魔導士", role: "ポーン", hp: 1, atk: 1, tentative: true,
    ability: "成ると「コードネームAMBER」に変身する。変身時の能力は未実装。",
    glyph: { w: "♙", b: "♟" },
  },
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// board[row][col]: row0 = 8段目(黒側) 〜 row7 = 1段目(白側)
function createInitialBoard() {
  const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: "b" };
    board[1][c] = { type: "P", color: "b" };
    board[6][c] = { type: "P", color: "w" };
    board[7][c] = { type: backRank[c], color: "w" };
  }
  return board;
}

let board = createInitialBoard();
let currentTurn = "w";
let selected = null; // { row, col }
let legalTargets = []; // [{row, col}]
let gameOver = false;

// ---- DOM要素 ----------------------------------------------------
const boardEl = document.getElementById("board");
const rankLabelsEl = document.getElementById("rankLabels");
const fileLabelsEl = document.getElementById("fileLabels");
const turnTextEl = document.getElementById("turnText");
const turnDotEl = document.getElementById("turnDot");
const logEl = document.getElementById("log");
const rosterEl = document.getElementById("roster");
const selectedEmptyEl = document.getElementById("selectedEmpty");
const selectedDetailEl = document.getElementById("selectedDetail");

// ---- 初期化 -------------------------------------------------------
function init() {
  buildLabels();
  buildRoster();
  render();
  document.getElementById("resetBtn").addEventListener("click", resetGame);
}

function buildLabels() {
  rankLabelsEl.innerHTML = "";
  for (let r = 8; r >= 1; r--) {
    const span = document.createElement("span");
    span.textContent = r;
    rankLabelsEl.appendChild(span);
  }
  fileLabelsEl.innerHTML = "";
  FILES.forEach((f) => {
    const span = document.createElement("span");
    span.textContent = f;
    fileLabelsEl.appendChild(span);
  });
}

function buildRoster() {
  rosterEl.innerHTML = "";
  Object.entries(PIECE_DATA).forEach(([key, data]) => {
    const li = document.createElement("li");
    const statText = data.hp === null ? "未設定" : `HP${data.hp} / ATK${data.atk}`;
    li.innerHTML = `
      <span class="piece-glyph">${data.glyph.w}</span>
      <span class="roster-name">${data.name}<span style="color:var(--text-muted); font-weight:400;">《${data.role}》</span></span>
      <span class="roster-stats">${statText}</span>
    `;
    rosterEl.appendChild(li);
  });
}

// ---- 描画 ---------------------------------------------------------
function render() {
  boardEl.innerHTML = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = document.createElement("div");
      const isLight = (row + col) % 2 === 0;
      cell.className = `cell ${isLight ? "light" : "dark"}`;
      cell.dataset.row = row;
      cell.dataset.col = col;

      const piece = board[row][col];
      if (piece) {
        cell.appendChild(renderPiece(piece));
      }

      if (selected && selected.row === row && selected.col === col) {
        cell.classList.add("selected");
      }
      if (legalTargets.some((t) => t.row === row && t.col === col)) {
        cell.classList.add("selectable");
        if (piece) cell.classList.add("has-piece");
      }

      cell.addEventListener("click", () => onCellClick(row, col));
      boardEl.appendChild(cell);
    }
  }

  turnTextEl.textContent = gameOver
    ? "対局終了"
    : currentTurn === "w" ? "白のターン" : "黒のターン";
  turnDotEl.classList.toggle("black", currentTurn === "b" && !gameOver);

  renderSelectedPanel();
}

function renderPiece(piece) {
  const data = PIECE_DATA[piece.type];
  const wrap = document.createElement("div");
  wrap.className = `piece ${piece.color === "w" ? "white" : "black"}`;

  const glyph = document.createElement("span");
  glyph.className = "piece-glyph";
  glyph.textContent = data.glyph[piece.color];
  wrap.appendChild(glyph);

  if (data.hp !== null) {
    const stats = document.createElement("span");
    stats.className = "piece-stats";
    stats.innerHTML = `<span class="hp">${data.hp}</span><span class="atk">${data.atk}</span>`;
    wrap.appendChild(stats);
  }
  return wrap;
}

function renderSelectedPanel() {
  if (!selected) {
    selectedEmptyEl.hidden = false;
    selectedDetailEl.hidden = true;
    return;
  }
  const piece = board[selected.row][selected.col];
  if (!piece) {
    selectedEmptyEl.hidden = false;
    selectedDetailEl.hidden = true;
    return;
  }
  const data = PIECE_DATA[piece.type];
  selectedEmptyEl.hidden = true;
  selectedDetailEl.hidden = false;

  document.getElementById("detailGlyph").textContent = data.glyph[piece.color];
  document.getElementById("detailName").textContent =
    `${data.name}${piece.color === "w" ? "(白)" : "(黒)"}`;
  document.getElementById("detailRole").textContent = `《${data.role}》`;
  document.getElementById("detailHp").textContent = data.hp ?? "未設定";
  document.getElementById("detailAtk").textContent = data.atk ?? "未設定";
  document.getElementById("detailTentative").hidden = !data.tentative;
  document.getElementById("detailAbility").textContent = data.ability;
}

// ---- 操作 ---------------------------------------------------------
function onCellClick(row, col) {
  if (gameOver) return;
  const piece = board[row][col];

  // すでに駒を選択していて、そのマスが合法手なら移動
  if (selected && legalTargets.some((t) => t.row === row && t.col === col)) {
    movePiece(selected, { row, col });
    return;
  }

  // 自分の駒を選択
  if (piece && piece.color === currentTurn) {
    selected = { row, col };
    legalTargets = generateMoves(row, col);
  } else {
    selected = null;
    legalTargets = [];
  }
  render();
}

function movePiece(from, to) {
  const moving = board[from.row][from.col];
  const captured = board[to.row][to.col];

  board[to.row][to.col] = moving;
  board[from.row][from.col] = null;

  logMove(moving, from, to, captured);

  if (captured && captured.type === "K") {
    gameOver = true;
    appendLog(`${captured.color === "w" ? "白" : "黒"}のキングが取られた。${moving.color === "w" ? "白" : "黒"}の勝利。`);
  }

  selected = null;
  legalTargets = [];
  currentTurn = currentTurn === "w" ? "b" : "w";
  render();
}

function logMove(moving, from, to, captured) {
  const data = PIECE_DATA[moving.type];
  const fromSq = squareName(from);
  const toSq = squareName(to);
  let text = `${data.name}(${data.role}) ${fromSq} → ${toSq}`;
  if (captured) {
    const capData = PIECE_DATA[captured.type];
    text += `　※${capData.name}を捕獲`;
  }
  appendLog(text);
}

function appendLog(text) {
  const li = document.createElement("li");
  li.textContent = text;
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}

function squareName({ row, col }) {
  return `${FILES[col]}${8 - row}`;
}

function resetGame() {
  board = createInitialBoard();
  currentTurn = "w";
  selected = null;
  legalTargets = [];
  gameOver = false;
  logEl.innerHTML = "";
  render();
}

// ---- 移動生成（標準チェスの動きのみ。特殊能力は未実装）--------------
function generateMoves(row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  switch (piece.type) {
    case "P": return pawnMoves(row, col, piece);
    case "N": return knightMoves(row, col, piece);
    case "B": return slideMoves(row, col, piece, [[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "R": return slideMoves(row, col, piece, [[1,0],[-1,0],[0,1],[0,-1]]);
    case "Q": return slideMoves(row, col, piece, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
    case "K": return kingMoves(row, col, piece);
    default: return [];
  }
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function slideMoves(row, col, piece, directions) {
  const moves = [];
  for (const [dr, dc] of directions) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const target = board[r][c];
      if (!target) {
        moves.push({ row: r, col: c });
      } else {
        if (target.color !== piece.color) moves.push({ row: r, col: c });
        break;
      }
      r += dr; c += dc;
    }
  }
  return moves;
}

function knightMoves(row, col, piece) {
  const deltas = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  return deltas
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(({ row: r, col: c }) => inBounds(r, c))
    .filter(({ row: r, col: c }) => !board[r][c] || board[r][c].color !== piece.color);
}

function kingMoves(row, col, piece) {
  const deltas = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  return deltas
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(({ row: r, col: c }) => inBounds(r, c))
    .filter(({ row: r, col: c }) => !board[r][c] || board[r][c].color !== piece.color);
}

function pawnMoves(row, col, piece) {
  const moves = [];
  const dir = piece.color === "w" ? -1 : 1;
  const startRow = piece.color === "w" ? 6 : 1;

  // 前進
  if (inBounds(row + dir, col) && !board[row + dir][col]) {
    moves.push({ row: row + dir, col });
    if (row === startRow && !board[row + 2 * dir][col]) {
      moves.push({ row: row + 2 * dir, col });
    }
  }
  // 斜め捕獲
  for (const dc of [-1, 1]) {
    const r = row + dir, c = col + dc;
    if (inBounds(r, c) && board[r][c] && board[r][c].color !== piece.color) {
      moves.push({ row: r, col: c });
    }
  }
  return moves;
}

init();
