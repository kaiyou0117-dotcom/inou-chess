/* ============================================================
   異能チェス — 編成モード用エンジン
   ------------------------------------------------------------
   実装済み: 盤面表示 / 標準的な駒の移動パターン / HPダメージ制の戦闘解決 /
   ターン切替 / special・normal 2バリエーションのデータ構造 /
   特殊能力4種(海洋恐怖症の召喚、情報の悪魔の範囲破壊、
   鉄拳の悪魔の飛び越え、社畜魔導士→コードネームAMBERの変身と2回行動)
   未実装 (TODO): チェック/チェックメイト判定、編成モードでの
   special/normal選択UI、キャラごとの専用グラフィック、
   「レンレン」駒本体(範囲破壊の無効化条件)
   ============================================================ */

// 駒種ごとの見た目(ユニコードグリフ)。AMBERは moveAs で選んだ型の見た目を流用する。
const GLYPHS = {
  K: { w: "♔", b: "♚" },
  Q: { w: "♕", b: "♛" },
  R: { w: "♖", b: "♜" },
  B: { w: "♗", b: "♝" },
  N: { w: "♘", b: "♞" },
  P: { w: "♙", b: "♟" },
  A: { w: "✦", b: "✦" }, // 駒図鑑でのみ使用(盤上ではmoveAsのグリフを表示)
};

const MOVE_TYPE_LABELS = { Q: "クイーン", R: "ルーク", B: "ビショップ", N: "ナイト" };

// 駒データ：役割ごとに special(特殊駒) / normal(通常駒) の2バリエーションを保持。
const PIECE_TYPES = {
  P: {
    role: "ポーン",
    variants: {
      special: {
        name: "社畜魔導士", hp: 1, atk: 1, tentative: true,
        ability: "最奥列に到達すると「コードネームAMBER」に変身し、動き(クイーン/ルーク/ビショップ/ナイト)を選べる。変身後は1ターンに2回まで行動可能(捕獲は1回まで)。",
      },
      normal: {
        name: "通常ポーン", hp: 2, atk: 1, tentative: false,
        ability: "特殊能力を持たない、素朴な一歩兵。最奥列到達で通常クイーンに成る。",
      },
      shikigami: {
        name: "式神", hp: 1, atk: 1, tentative: true,
        ability: "海洋恐怖症の召喚で出現する使い魔。特殊能力なし。最奥列到達で通常クイーンに成る。",
      },
    },
  },
  N: {
    role: "ナイト",
    variants: {
      special: {
        name: "情報の悪魔", hp: 3, atk: 1, tentative: false,
        ability: "移動した時、縦横1マスの全ての駒(敵味方問わず)を破壊する。相手に「レンレン」がいる場合は無効化(レンレン自体は未実装のため現状は常に発動)。",
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
        ability: "移動した時、前後左右のいずれか空いているマスに「式神《ポーン》」を召喚する。",
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
        ability: "直線移動の途中、最初にぶつかった駒を1体だけ(敵味方問わず)飛び越えて進める。2体目にぶつかったら停止。",
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
  A: {
    role: "AMBER",
    variants: {
      special: {
        name: "コードネームAMBER", hp: 3, atk: 2, tentative: true,
        ability: "社畜魔導士が変身した姿。変身時に選んだ動き(クイーン/ルーク/ビショップ/ナイト)で移動する。1ターンに2回まで行動できるが、捕獲できるのは1回まで。",
      },
    },
  },
};

function pieceData(type, variant) {
  return PIECE_TYPES[type].variants[variant];
}

function glyphFor(piece) {
  return piece.type === "A" ? GLYPHS[piece.moveAs][piece.color] : GLYPHS[piece.type][piece.color];
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// 駒1体を生成。variant省略時は "special"(現状のデフォルト構成)。
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

// コードネームAMBERの2回行動管理
let pendingBonusMove = null; // { row, col } — このターン、追加行動が可能なAMBERの現在位置
let amberUsedCapture = false; // 1回目の行動で捕獲済みか(2回目は捕獲不可にするため)

// 社畜魔導士の変身選択待ち
let pendingPromotion = null; // { row, col }

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
const skipBonusBtn = document.getElementById("skipBonusBtn");
const promotionModalEl = document.getElementById("promotionModal");

// ---- 初期化 -------------------------------------------------------
function init() {
  buildLabels();
  buildRoster();
  render();
  document.getElementById("resetBtn").addEventListener("click", resetGame);
  if (skipBonusBtn) skipBonusBtn.addEventListener("click", onSkipBonusMove);
  if (promotionModalEl) {
    promotionModalEl.querySelectorAll(".modal-choice").forEach((btn) => {
      btn.addEventListener("click", () => onPromotionChoice(btn.dataset.move));
    });
  }
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
      if (!data) return; // AMBERにはnormalバリエーションが無い
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
    : pendingBonusMove
      ? `${currentTurn === "w" ? "白" : "黒"}のターン(AMBER 追加行動)`
      : currentTurn === "w" ? "白のターン" : "黒のターン";
  turnDotEl.classList.toggle("black", currentTurn === "b" && !gameOver);

  if (skipBonusBtn) skipBonusBtn.hidden = !pendingBonusMove;

  renderSelectedPanel();
}

function renderPiece(piece) {
  const data = pieceData(piece.type, piece.variant);
  const wrap = document.createElement("div");
  wrap.className = `piece ${piece.color === "w" ? "white" : "black"}`;

  const glyph = document.createElement("span");
  glyph.className = "piece-glyph";
  glyph.textContent = glyphFor(piece);
  wrap.appendChild(glyph);

  const stats = document.createElement("span");
  stats.className = "piece-stats";
  stats.innerHTML = `<span class="hp">${piece.hp}/${data.hp}</span><span class="atk">${data.atk}</span>`;
  wrap.appendChild(stats);
  return wrap;
}

function detailRoleText(piece) {
  const roleBase = PIECE_TYPES[piece.type].role;
  const variantLabel = piece.variant === "special" ? "特殊駒" : "通常駒";
  let text = `《${roleBase}》・${variantLabel}`;
  if (piece.type === "A") {
    text += `・動き:${MOVE_TYPE_LABELS[piece.moveAs]}型`;
  }
  return text;
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

  document.getElementById("detailGlyph").textContent = glyphFor(piece);
  document.getElementById("detailName").textContent =
    `${data.name}${piece.color === "w" ? "(白)" : "(黒)"}`;
  document.getElementById("detailRole").textContent = detailRoleText(piece);
  document.getElementById("detailHp").textContent = `${piece.hp} / ${data.hp}`;
  document.getElementById("detailAtk").textContent = data.atk;
  document.getElementById("detailTentative").hidden = !data.tentative;
  document.getElementById("detailAbility").textContent = data.ability;
}

// ---- 操作 ---------------------------------------------------------
function onCellClick(row, col) {
  if (gameOver || pendingPromotion) return;

  // すでに駒を選択していて、そのマスが合法手なら移動
  if (selected && legalTargets.some((t) => t.row === row && t.col === col)) {
    performMove(selected, { row, col });
    return;
  }

  // AMBERの追加行動中は、その駒以外を選び直せない
  if (pendingBonusMove) return;

  // 自分の駒を選択
  const piece = board[row][col];
  if (piece && piece.color === currentTurn) {
    selected = { row, col };
    legalTargets = generateMoves(row, col);
  } else {
    selected = null;
    legalTargets = [];
  }
  render();
}

function onSkipBonusMove() {
  if (!pendingBonusMove) return;
  pendingBonusMove = null;
  amberUsedCapture = false;
  selected = null;
  legalTargets = [];
  endTurn();
}

function endTurn() {
  currentTurn = currentTurn === "w" ? "b" : "w";
  render();
}

// 移動/攻撃を実行し、能力トリガー・変身判定・AMBERの2回行動を一括管理する
function performMove(from, to) {
  const piece = board[from.row][from.col];
  const isAmberContinuation =
    pendingBonusMove && pendingBonusMove.row === from.row && pendingBonusMove.col === from.col;

  const defender = board[to.row][to.col];
  let moved, captured;

  if (defender) {
    const result = resolveAttack(piece, from, defender, to);
    moved = result.moved;
    captured = result.captured;
  } else {
    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;
    const data = pieceData(piece.type, piece.variant);
    appendLog(`${data.name}(${PIECE_TYPES[piece.type].role}) ${squareName(from)} → ${squareName(to)}`);
    moved = true;
    captured = false;
  }

  selected = null;
  legalTargets = [];
  const finalPos = moved ? to : from;

  if (moved) {
    triggerAbility(piece, finalPos);
    if (!gameOver && checkPromotion(finalPos)) {
      render(); // 変身選択モーダル待ち。ターン進行はモーダルのコールバックで行う。
      return;
    }
  }

  if (gameOver) {
    render();
    return;
  }

  if (isAmberContinuation) {
    // AMBERの2回目の行動完了。ターンを渡す。
    pendingBonusMove = null;
    amberUsedCapture = false;
    endTurn();
  } else if (piece.type === "A") {
    // AMBERの1回目の行動。同じ駒で追加行動が可能。
    pendingBonusMove = { row: finalPos.row, col: finalPos.col };
    amberUsedCapture = captured;
    selected = { row: finalPos.row, col: finalPos.col };
    legalTargets = generateMoves(finalPos.row, finalPos.col);
    render();
  } else {
    endTurn();
  }
}

// HPダメージ制の戦闘解決。
// ATK分だけ防御側のHPを削る。HPが尽きれば撃破して攻撃側がマスへ進出、
// 耐えた場合は両者ともその場に留まる(攻撃側は進軍できない)。
// 戻り値: { moved: 攻撃側が実際にそのマスへ進出したか, captured: 撃破できたか }
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
    return { moved: true, captured: true };
  } else {
    appendLog(
      `${atkData.name} ${squareName(from)} が ${defData.name} ${squareName(to)} を攻撃(ATK${damage})。` +
      `残りHP${defender.hp}で耐え、${atkData.name}は${squareName(from)}に留まる`
    );
    lastDamagedSquare = { row: to.row, col: to.col };
    return { moved: false, captured: false };
  }
}

// ---- 特殊能力 -------------------------------------------------------
function triggerAbility(piece, pos) {
  if (piece.type === "B" && piece.variant === "special") {
    triggerUmiSummon(piece, pos);
  } else if (piece.type === "N" && piece.variant === "special") {
    triggerJohoAreaDestroy(piece, pos);
  }
}

// 海洋恐怖症：移動後、前後左右いずれかの空きマスに式神(ポーン)を召喚
function triggerUmiSummon(piece, pos) {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const candidates = dirs
    .map(([dr, dc]) => ({ row: pos.row + dr, col: pos.col + dc }))
    .filter(({ row, col }) => inBounds(row, col) && !board[row][col]);

  const data = pieceData(piece.type, piece.variant);
  if (candidates.length === 0) {
    appendLog(`${data.name} の召喚：周囲に空きマスが無く式神は現れなかった`);
    return;
  }
  const spot = candidates[Math.floor(Math.random() * candidates.length)];
  board[spot.row][spot.col] = makePiece("P", piece.color, "shikigami");
  appendLog(`${data.name} が ${squareName(spot)} に式神を召喚`);
}

// 情報の悪魔：移動後、縦横1マスの全ての駒(敵味方問わず)を破壊。
// 相手に「レンレン」がいれば無効化(レンレンは未実装のため現状は常に発動)。
function triggerJohoAreaDestroy(piece, pos) {
  const data = pieceData(piece.type, piece.variant);
  if (opponentHasPieceNamed(piece.color, "レンレン")) {
    appendLog(`${data.name} の範囲破壊は、相手の「レンレン」により無効化された`);
    return;
  }

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const destroyed = [];
  dirs.forEach(([dr, dc]) => {
    const r = pos.row + dr, c = pos.col + dc;
    if (!inBounds(r, c) || !board[r][c]) return;
    const victim = board[r][c];
    const victimData = pieceData(victim.type, victim.variant);
    destroyed.push(`${victimData.name}(${squareName({ row: r, col: c })})`);
    if (victim.type === "K") {
      gameOver = true;
      appendLog(`${victim.color === "w" ? "白" : "黒"}のキング破壊。${piece.color === "w" ? "白" : "黒"}の勝利。`);
    }
    board[r][c] = null;
  });

  if (destroyed.length > 0) {
    appendLog(`${data.name} の範囲破壊：${destroyed.join("、")} を破壊`);
  }
}

function opponentHasPieceNamed(selfColor, name) {
  const oppColor = selfColor === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === oppColor && pieceData(p.type, p.variant).name === name) {
        return true;
      }
    }
  }
  return false;
}

// ---- 成り(社畜魔導士→AMBER)-------------------------------------------
// 戻り値: true の場合、変身選択モーダルを表示中でターン進行を保留する
function checkPromotion(pos) {
  const piece = board[pos.row][pos.col];
  if (!piece || piece.type !== "P") return false;
  const lastRow = piece.color === "w" ? 0 : 7;
  if (pos.row !== lastRow) return false;

  if (piece.variant === "special") {
    pendingPromotion = { row: pos.row, col: pos.col };
    openPromotionModal();
    return true;
  } else {
    const promoted = makePiece("Q", piece.color, "normal");
    board[pos.row][pos.col] = promoted;
    appendLog(`${pieceData("P", piece.variant).name} が ${squareName(pos)} で成り、通常クイーンに昇格`);
    return false;
  }
}

function openPromotionModal() {
  if (promotionModalEl) promotionModalEl.hidden = false;
}
function closePromotionModal() {
  if (promotionModalEl) promotionModalEl.hidden = true;
}

function onPromotionChoice(moveType) {
  if (!pendingPromotion) return;
  const { row, col } = pendingPromotion;
  const oldPiece = board[row][col];
  const amber = { type: "A", color: oldPiece.color, variant: "special", moveAs: moveType, hp: pieceData("A", "special").hp };
  board[row][col] = amber;
  appendLog(
    `${pieceData("P", "special").name} が ${squareName({ row, col })} で「コードネームAMBER」に変身` +
    `(${MOVE_TYPE_LABELS[moveType]}型)`
  );
  pendingPromotion = null;
  closePromotionModal();
  endTurn();
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
  pendingBonusMove = null;
  amberUsedCapture = false;
  pendingPromotion = null;
  closePromotionModal();
  logEl.innerHTML = "";
  render();
}

// ---- 移動生成 -------------------------------------------------------
function generateMoves(row, col) {
  const piece = board[row][col];
  if (!piece) return [];

  if (piece.type === "A") {
    let moves;
    switch (piece.moveAs) {
      case "B": moves = slideMoves(row, col, piece, [[1,1],[1,-1],[-1,1],[-1,-1]]); break;
      case "R": moves = slideMoves(row, col, piece, [[1,0],[-1,0],[0,1],[0,-1]]); break;
      case "Q": moves = slideMoves(row, col, piece, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]); break;
      case "N": moves = knightMoves(row, col, piece); break;
      default: moves = [];
    }
    // 2回目の行動で既に捕獲済みなら、捕獲(相手駒があるマス)は選べない
    if (pendingBonusMove && pendingBonusMove.row === row && pendingBonusMove.col === col && amberUsedCapture) {
      moves = moves.filter((m) => !board[m.row][m.col]);
    }
    return moves;
  }

  switch (piece.type) {
    case "P": return pawnMoves(row, col, piece);
    case "N": return knightMoves(row, col, piece);
    case "B": return slideMoves(row, col, piece, [[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "R":
      return piece.variant === "special"
        ? ironFistRookMoves(row, col, piece)
        : slideMoves(row, col, piece, [[1,0],[-1,0],[0,1],[0,-1]]);
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

// 鉄拳の悪魔専用：直線上、最初にぶつかった駒を1体だけ(敵味方問わず)飛び越えられる
function ironFistRookMoves(row, col, piece) {
  const directions = [[1,0],[-1,0],[0,1],[0,-1]];
  const moves = [];
  for (const [dr, dc] of directions) {
    let r = row + dr, c = col + dc;
    let jumped = false;
    while (inBounds(r, c)) {
      const occupant = board[r][c];
      if (!occupant) {
        moves.push({ row: r, col: c });
      } else if (!jumped) {
        // 最初にぶつかった駒：敵ならここで捕獲する手も選べる。さらに飛び越えて先へ進む権利を得る。
        if (occupant.color !== piece.color) moves.push({ row: r, col: c });
        jumped = true;
      } else {
        // 2体目にぶつかった駒：これ以上は進めない。敵ならここで捕獲してストップ。
        if (occupant.color !== piece.color) moves.push({ row: r, col: c });
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
