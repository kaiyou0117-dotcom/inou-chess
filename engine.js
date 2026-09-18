/* ============================================================
   異能チェス — 盤面雛形
   ------------------------------------------------------------
   実装済み: 盤面表示 / 標準的な駒の移動パターン / HPダメージ制の戦闘解決 /
   ターン切替 / 駒データの special(特殊駒)・normal(通常駒) 2バリエーション化
   未実装 (TODO): 各駒の特殊能力(召喚・範囲破壊・飛び越え・変身)、
   チェック/チェックメイト判定、編成モードでのspecial/normal選択UI、
   キャラごとの専用グラフィック
   ============================================================ */

// 駒種ごとの見た目(ユニコードグリフ)。special/normal共通。
const GLYPHS = {
  K: { w: "♔", b: "♚" },
  Q: { w: "♕", b: "♛" },
  R: { w: "♖", b: "♜" },
  B: { w: "♗", b: "♝" },
  N: { w: "♘", b: "♞" },
  P: { w: "♙", b: "♟" },
};

// 駒データ：役割ごとに special(特殊駒) / normal(通常駒) の2バリエーションを保持。
// special = 「ここだけ異能のある世界」wikiのキャラがモチーフの固有能力付き駒
// normal  = 能力を持たない、無難な強さのチェス駒(編成モード等で特殊駒と混在させる用)
const PIECE_TYPES = {
  P: {
    role: "ポーン",
    variants: {
      special: {
        name: "社畜魔導士", hp: 1, atk: 1, tentative: true,
        ability: "成ると「コードネームAMBER」に変身する。変身時の能力は未実装。",
      },
      normal: {
        name: "通常ポーン", hp: 2, atk: 1, tentative: false,
        ability: "特殊能力を持たない、素朴な一歩兵。",
      },
    },
  },
  N: {
    role: "ナイト",
    variants: {
      special: {
        name: "情報の悪魔", hp: 3, atk: 1, tentative: false,
        ability: "移動した時、縦横1マスの全ての駒を破壊する。相手に「レンレン」がいる場合は無効化。(未実装)",
      },
      normal: {
        name: "通常ナイト", hp: 3, atk: 2, tentative: false,
        ability: "特殊能力を持たない、堅実な騎士。",
      },
    },
  },
  B: {
    role: "ビショップ",
    variants: {
      special: {
        name: "海洋恐怖症", hp: 1, atk: 2, tentative: false,
        ability: "移動した時、前後左右のいずれかに「式神《ポーン》」を召喚する。(未実装)",
      },
      normal: {
        name: "通常ビショップ", hp: 3, atk: 2, tentative: false,
        ability: "特殊能力を持たない、堅実な司教。",
      },
    },
  },
  R: {
    role: "ルーク",
    variants: {
      special: {
        name: "鉄拳の悪魔", hp: 4, atk: 3, tentative: false,
        ability: "一体に限り、敵味方関係なく駒を飛び越えて移動できる。(未実装)",
      },
      normal: {
        name: "通常ルーク", hp: 4, atk: 3, tentative: false,
        ability: "特殊能力を持たない、正統派の城。",
      },
    },
  },
  Q: {
    role: "クイーン",
    variants: {
      special: {
        name: "嘘の悪魔", hp: 5, atk: 4, tentative: true,
        ability: "ステータス・能力ともに未定。仮の数値を表示中。",
      },
      normal: {
        name: "通常クイーン", hp: 5, atk: 4, tentative: false,
        ability: "特殊能力を持たない、正統派の女王。",
      },
    },
  },
  K: {
    role: "キング",
    variants: {
      special: {
        name: "キング", hp: 3, atk: 2, tentative: true,
        ability: "駒の設定は未定。ひとまず通常のキングと同じ動き(縦横斜め1マス)。HP/ATKは仮の値。",
      },
      normal: {
        name: "通常キング", hp: 4, atk: 2, tentative: false,
        ability: "特殊能力を持たない、正統派の王。",
      },
    },
  },
};

function pieceData(type, variant) {
  return PIECE_TYPES[type].variants[variant];
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// 駒1体を生成。variant省略時は "special"(現状のデフォルト構成)。
// hp は選んだバリエーションの基礎値をコピーした「現在HP」(戦闘で減っていく)
function makePiece(type, color, variant = "special") {
  return { type, color, variant, hp: pieceData(type, variant).hp };
}

// board[row][col]: row0 = 8段目(黒側) 〜 row7 = 1段目(白側)
function createInitialBoard() {
  const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = makePiece(backRank[c], "b");
    board[1][c] = makePiece("P", "b");
    board[6][c] = makePiece("P", "w");
    board[7][c] = makePiece(backRank[c], "w");
  }
  return board;
}

let board = createInitialBoard();
let currentTurn = "w";
let selected = null; // { row, col }
let legalTargets = []; // [{row, col}]
let gameOver = false;
let lastDamagedSquare = null; // 直前のターンでダメージを受けたマス(演出用)

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

// 駒図鑑：役割ごとに special(特殊駒) → normal(通常駒) の順で並べる
function buildRoster() {
  rosterEl.innerHTML = "";
  Object.entries(PIECE_TYPES).forEach(([type, info]) => {
    ["special", "normal"].forEach((variant) => {
      const data = info.variants[variant];
      const tag = variant === "special" ? "特殊" : "通常";
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="piece-glyph">${GLYPHS[type].w}</span>
        <span class="roster-name">${data.name}
          <span style="color:var(--text-muted); font-weight:400;">《${info.role}》</span>
          <span class="roster-tag">${tag}</span>
        </span>
        <span class="roster-stats">HP${data.hp} / ATK${data.atk}</span>
      `;
      rosterEl.appendChild(li);
    });
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
      if (lastDamagedSquare && lastDamagedSquare.row === row && lastDamagedSquare.col === col) {
        cell.classList.add("damage-flash");
      }

      cell.addEventListener("click", () => onCellClick(row, col));
      boardEl.appendChild(cell);
    }
  }
  lastDamagedSquare = null;

  turnTextEl.textContent = gameOver
    ? "対局終了"
    : currentTurn === "w" ? "白のターン" : "黒のターン";
  turnDotEl.classList.toggle("black", currentTurn === "b" && !gameOver);

  renderSelectedPanel();
}

function renderPiece(piece) {
  const data = pieceData(piece.type, piece.variant);
  const wrap = document.createElement("div");
  wrap.className = `piece ${piece.color === "w" ? "white" : "black"}`;

  const glyph = document.createElement("span");
  glyph.className = "piece-glyph";
  glyph.textContent = GLYPHS[piece.type][piece.color];
  wrap.appendChild(glyph);

  const stats = document.createElement("span");
  stats.className = "piece-stats";
  stats.innerHTML = `<span class="hp">${piece.hp}/${data.hp}</span><span class="atk">${data.atk}</span>`;
  wrap.appendChild(stats);
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
  const data = pieceData(piece.type, piece.variant);
  selectedEmptyEl.hidden = true;
  selectedDetailEl.hidden = false;

  document.getElementById("detailGlyph").textContent = GLYPHS[piece.type][piece.color];
  document.getElementById("detailName").textContent =
    `${data.name}${piece.color === "w" ? "(白)" : "(黒)"}`;
  document.getElementById("detailRole").textContent =
    `《${PIECE_TYPES[piece.type].role}》・${piece.variant === "special" ? "特殊駒" : "通常駒"}`;
  document.getElementById("detailHp").textContent = `${piece.hp} / ${data.hp}`;
  document.getElementById("detailAtk").textContent = data.atk;
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
  const defender = board[to.row][to.col];

  if (defender) {
    resolveAttack(moving, from, defender, to);
  } else {
    board[to.row][to.col] = moving;
    board[from.row][from.col] = null;
    const data = pieceData(moving.type, moving.variant);
    appendLog(`${data.name}(${PIECE_TYPES[moving.type].role}) ${squareName(from)} → ${squareName(to)}`);
  }

  selected = null;
  legalTargets = [];
  currentTurn = currentTurn === "w" ? "b" : "w";
  render();
}

// HPダメージ制の戦闘解決。
// ATK分だけ防御側のHPを削る。HPが尽きれば撃破して攻撃側がマスへ進出、
// 耐えた場合は両者ともその場に留まる(攻撃側は進軍できない)。
function resolveAttack(attacker, from, defender, to) {
  const atkData = pieceData(attacker.type, attacker.variant);
  const defData = pieceData(defender.type, defender.variant);
  const damage = atkData.atk;

  defender.hp -= damage;

  if (defender.hp <= 0) {
    board[to.row][to.col] = attacker;
    board[from.row][from.col] = null;
    appendLog(
      `${atkData.name} ${squareName(from)} が ${defData.name} ${squareName(to)} を攻撃(ATK${damage})。` +
      `${defData.name}のHPが尽きて撃破 → ${atkData.name}が${squareName(to)}へ進出`
    );
    if (defender.type === "K") {
      gameOver = true;
      appendLog(`${defender.color === "w" ? "白" : "黒"}のキング撃破。${attacker.color === "w" ? "白" : "黒"}の勝利。`);
    }
  } else {
    appendLog(
      `${atkData.name} ${squareName(from)} が ${defData.name} ${squareName(to)} を攻撃(ATK${damage})。` +
      `残りHP${defender.hp}で耐え、${atkData.name}は${squareName(from)}に留まる`
    );
    lastDamagedSquare = { row: to.row, col: to.col };
  }
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

// ---- 移動生成（標準チェスの動きのみ。特殊能力は未実装。special/normal共通）----
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
