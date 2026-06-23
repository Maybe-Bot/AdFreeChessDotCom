const GLYPHS = {
  K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟',
};

const THEMES = {
  forest:   { name:'Forest',   light:'#f0d9b5', dark:'#4a7c59' },
  classic:  { name:'Classic',  light:'#f0d9b5', dark:'#b58863' },
  ocean:    { name:'Ocean',    light:'#cee7f5', dark:'#2c6e8a' },
  midnight: { name:'Midnight', light:'#c4ccd6', dark:'#3b4a6b' },
  coral:    { name:'Coral',    light:'#fde8d8', dark:'#c05a3d' },
  walnut:   { name:'Walnut',   light:'#f2d4aa', dark:'#7c5136' },
};

// Parse FEN board section into {sq: piece} map
function fenToSquares(fen) {
  const squares = {};
  const files = 'abcdefgh';
  fen.split(' ')[0].split('/').forEach((rank, ri) => {
    let fi = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') fi += +ch;
      else { squares[files[fi] + (8 - ri)] = ch; fi++; }
    }
  });
  return squares;
}

// Whose turn from FEN: 'w' or 'b'
function fenTurn(fen) { return fen.split(' ')[1]; }

// Draw 64 squares into boardEl; calls onSquareClick(sq, piece, allSquares)
function renderBoard(boardEl, fen, orientation, selected, onSquareClick) {
  boardEl.innerHTML = '';
  const squares = fenToSquares(fen);
  const files = 'abcdefgh';
  const fileArr = orientation === 'black' ? [...files].reverse() : [...files];
  const rankArr = orientation === 'black' ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];

  for (const rank of rankArr) {
    for (const file of fileArr) {
      const sq = file + rank;
      const piece = squares[sq];
      const isLight = (files.indexOf(file) + rank) % 2 === 0;

      const div = document.createElement('div');
      div.className = 'square ' + (isLight ? 'light' : 'dark') + (sq === selected ? ' sel' : '');
      div.dataset.sq = sq;

      if (piece) {
        const span = document.createElement('span');
        span.className = 'piece ' + (piece === piece.toUpperCase() ? 'piece-w' : 'piece-b');
        span.textContent = GLYPHS[piece] || '';
        div.appendChild(span);
      }

      div.addEventListener('click', () => onSquareClick(sq, piece, squares));
      boardEl.appendChild(div);
    }
  }
}

function applyTheme(key) {
  const t = THEMES[key] || THEMES.forest;
  document.documentElement.style.setProperty('--board-light', t.light);
  document.documentElement.style.setProperty('--board-dark',  t.dark);
  localStorage.setItem('boardTheme', key);
}

function initTheme() { applyTheme(localStorage.getItem('boardTheme') || 'forest'); }

function buildThemePicker(containerEl, onPick) {
  const saved = localStorage.getItem('boardTheme') || 'forest';
  Object.entries(THEMES).forEach(([key, t]) => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch' + (key === saved ? ' active' : '');
    btn.style.background = `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)`;
    btn.title = t.name;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(key);
      onPick && onPick(key);
    });
    containerEl.appendChild(btn);
  });
}
