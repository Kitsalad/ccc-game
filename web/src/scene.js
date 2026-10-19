// Grow-tent scene (SVG), ported from the "Tokin Grow Week" prototype.
// Draws from the server's plant view plus the player's draft actions.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fanLeaf(x, y, ang, len, col, burn) {
  let s = `<g transform="translate(${x} ${y}) rotate(${ang})">`;
  [-60, -30, 0, 30, 60].forEach((a, k) => {
    const l = len * (k === 2 ? 1 : k % 2 ? 0.8 : 0.55);
    s += `<ellipse cx="0" cy="${(-l / 2).toFixed(1)}" rx="${(l * 0.14).toFixed(1)}" ry="${(l / 2).toFixed(1)}" fill="${col}" transform="rotate(${a})"/>`;
    if (burn) s += `<circle cx="0" cy="${(-l * 0.95).toFixed(1)}" r="${(l * 0.09).toFixed(1)}" fill="#a0602e" transform="rotate(${a})"/>`;
  });
  return s + '</g>';
}

function plant(v, day) {
  const x = 200, soil = 196;
  let g = '';
  const wet = v.soggy ? '#24170e' : v.dry ? '#5d4632' : '#3a2818';
  g += `<ellipse cx="${x}" cy="${soil}" rx="30" ry="5" fill="${wet}"/>`;
  const hue = 110 - (100 - v.health) * 0.5 - (v.hungry ? 35 : 0);
  const sat = v.soggy ? 45 : 58, lt = v.soggy ? 28 : 40;
  const col = `hsl(${hue} ${sat}% ${lt}%)`, col2 = `hsl(${hue} ${sat - 6}% ${lt - 7}%)`;
  const droop = v.dry || v.soggy ? 22 : 0;
  if (v.size < 1.2) {
    const h = 12 + v.size * 10;
    g += `<line x1="${x}" y1="${soil}" x2="${x}" y2="${soil - h}" stroke="${col}" stroke-width="2"/>`;
    g += `<ellipse cx="${x - 7}" cy="${soil - h + (droop ? 4 : 0)}" rx="7" ry="3" fill="${col}"/><ellipse cx="${x + 7}" cy="${soil - h + (droop ? 4 : 0)}" rx="7" ry="3" fill="${col}"/>`;
  } else {
    const H = 24 + v.size * 14, nodes = Math.max(2, Math.floor(H / 18));
    g += `<path d="M${x} ${soil} Q${x + (droop ? 7 : 2)} ${soil - H / 2} ${x} ${soil - H}" stroke="${col2}" stroke-width="${2.5 + v.size * 0.3}" fill="none"/>`;
    for (let k = 0; k < nodes; k++) {
      const y = soil - 12 - k * ((H - 12) / nodes), t = 1 - k / nodes, len = 12 + t * 16 * Math.min(1, v.size / 4), side = k % 2 ? 1 : -1;
      g += fanLeaf(x + side * 2, y, side * (58 + droop), len, k % 2 ? col : col2, v.burn);
      g += fanLeaf(x - side * 2, y - 5, -side * (52 + droop), len * 0.85, k % 2 ? col2 : col, v.burn);
    }
    g += fanLeaf(x, soil - H, 0, 10, col, v.burn);
    if (v.pests) for (let k = 0; k < 9; k++) g += `<circle cx="${x - 18 + ((k * 37) % 36)}" cy="${soil - 16 - ((k * 29) % Math.max(14, H - 20))}" r="1" fill="#f4f0d0"/>`;
  }
  g += `<path d="M${x - 30} ${soil} L${x + 30} ${soil} L${x + 24} ${soil + 30} L${x - 24} ${soil + 30} Z" fill="#1f1b22" stroke="#34303a"/>`;
  return g;
}

function hs(act, label, x, y, w, h, inner, tx, ty, { on = false, off = false } = {}) {
  return `<g class="hs${on ? ' on' : ''}${off ? ' off' : ''}" data-act="${act}" tabindex="${off ? -1 : 0}" role="button" aria-label="${label}"${off ? ' aria-disabled="true"' : ''}>${inner}<rect class="hl" x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="4"/>${tx != null ? `<text class="tag" x="${tx}" y="${ty}" text-anchor="middle">${label}</text>` : ''}</g>`;
}

function nftFrame(id, img, x, y, w, label, sub) {
  const pic = img
    ? `<clipPath id="${id}"><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${w - 6}" rx="2"/></clipPath><image href="${esc(img)}" x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${w - 6}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    : `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${w - 6}" fill="#2a2230"/>`;
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${w + 18}" rx="3" fill="#221b2b" stroke="#4a3f55"/>${pic}<text class="tag" x="${x + w / 2}" y="${y + w + 8}" text-anchor="middle">${esc(label)}</text><text class="tag sub" x="${x + w / 2}" y="${y + w + 15}" text-anchor="middle">${esc(sub)}</text></g>`;
}

// grow = server view, entry = {toker, tokin}, draft = this check-in's actions, win = current window
export function sceneSVG(grow, entry, draft, win, open) {
  const v = grow.visual, day = grow.day;
  const lightCol = day <= 4 ? '#cf6bff' : '#ff6b9a';
  const evening = win === 'evening', day_ = win === 'day';
  const off = !open;
  let s = `<defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1524"/><stop offset="1" stop-color="#120e19"/></linearGradient>
  <linearGradient id="mylar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a3542"/><stop offset=".5" stop-color="#6b6475"/><stop offset="1" stop-color="#3a3542"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lightCol}" stop-opacity="${open ? 0.5 : 0.12}"/><stop offset="1" stop-color="${lightCol}" stop-opacity=".04"/></linearGradient>
  <radialGradient id="spill" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${lightCol}" stop-opacity="${open ? 0.22 : 0.06}"/><stop offset="1" stop-color="${lightCol}" stop-opacity="0"/></radialGradient></defs>`;
  s += `<rect width="400" height="205" fill="url(#wall)"/><rect y="205" width="400" height="55" fill="#0b0810"/><line x1="0" y1="205" x2="400" y2="205" stroke="#2b2336"/>`;
  s += `<ellipse cx="200" cy="130" rx="190" ry="120" fill="url(#spill)" class="glow"/>`;
  s += `<rect x="125" y="22" width="150" height="208" rx="3" fill="#121014" stroke="#2c2733" stroke-width="2"/><rect x="132" y="28" width="136" height="196" fill="url(#mylar)" opacity=".55"/>`;
  s += `<polygon points="145,46 255,46 268,224 132,224" fill="url(#beam)" class="glow"/>`;
  s += `<rect x="143" y="36" width="114" height="9" rx="1.5" fill="#222"/>`;
  for (let i = 0; i < 10; i++) s += `<circle cx="${150 + i * 11.1}" cy="40.5" r="1.7" fill="${open ? (i % 3 === 1 ? '#6ec6ff' : lightCol) : '#3a3340'}"/>`;
  s += `<g class="hs" data-act="plant" tabindex="0" role="button" aria-label="Look at the plant"><rect class="hl" x="160" y="52" width="80" height="176" rx="4"/>${plant(v, day)}</g>`;

  // The two NFTs on the wall: Toker poster left, Tokin seed card right.
  s += nftFrame('tk', entry.toker?.image, 14, 14, 66, 'Toker', `#${entry.toker?.id ?? ''}`);
  s += nftFrame('tn', entry.tokin?.image, 300, 14, 84, 'Tokin', `#${entry.tokin?.id ?? ''}`);

  // Tools
  const noDose = day_ || off;
  s += `<rect x="12" y="132" width="96" height="4" fill="#3a2f45"/>`;
  s += hs('feed', 'Nutes', 18, 108, 34, 24, `<rect x="19" y="112" width="9" height="20" rx="2" fill="#3fa34d"/><rect x="30" y="108" width="9" height="24" rx="2" fill="#d8b23a"/><rect x="41" y="114" width="9" height="18" rx="2" fill="#a74bd1"/>`, 35, 104, { on: draft.feed > 0, off: noDose });
  s += hs('pest', 'Loupe', 66, 110, 24, 22, `<circle cx="76" cy="119" r="7" fill="#9ad0ff" opacity=".35" stroke="#c9c2d4" stroke-width="2"/><line x1="81" y1="125" x2="88" y2="132" stroke="#c9c2d4" stroke-width="2.5"/>`, 78, 106, { on: draft.pest, off });
  s += hs('water', 'Water', 26, 214, 48, 30, `<path d="M32 222 h30 v20 h-30 z" fill="#4d7fa8"/><path d="M62 226 l12 -8 l2 3 l-12 8 z" fill="#4d7fa8"/><path d="M36 222 q11 -12 22 0" fill="none" stroke="#4d7fa8" stroke-width="3"/>`, 50, 252, { on: draft.water > 0, off: noDose });
  s += hs('talk', 'Talk', 86, 170, 30, 24, `<path d="M88 172 h26 a3 3 0 0 1 3 3 v12 a3 3 0 0 1 -3 3 h-16 l-6 5 v-5 h-4 a3 3 0 0 1 -3 -3 v-12 a3 3 0 0 1 3 -3z" fill="#2a2230" stroke="#6a5a7a"/><text x="101" y="184" text-anchor="middle" font-size="7" fill="#cbb">...</text>`, 101, 204, { on: draft.talk, off });
  s += hs('lights', 'Timer', 300, 138, 44, 28, `<rect x="300" y="138" width="44" height="28" rx="3" fill="#2a2230" stroke="${evening && open ? '#cf6bff' : '#4a3f55'}"/><text x="322" y="157" text-anchor="middle" font-size="10" font-weight="700" font-family="Chakra Petch,sans-serif" fill="${lightCol}">${draft.lights || '--/--'}</text>`, 322, 176, { on: !!draft.lights, off: !evening || off });
  s += hs('end', 'End check-in', 344, 190, 36, 36, `<circle cx="362" cy="208" r="16" fill="${open ? '#e9e3f1' : '#4a4252'}" stroke="#4a3f55" stroke-width="3"/><line x1="362" y1="208" x2="362" y2="197" stroke="#18131f" stroke-width="2"/><line x1="362" y1="208" x2="${win === 'morning' ? 355 : win === 'day' ? 362 : 369}" y2="${win === 'day' ? 199 : 212}" stroke="#18131f" stroke-width="1.6"/>`, 362, 236, { off });
  s += `<text class="tag" x="362" y="250" text-anchor="middle" style="fill:#cf6bff">${{ morning: 'AM', day: 'MID', evening: 'PM' }[win] || 'LIGHTS OUT'} · DAY ${day}</text>`;
  return s;
}
