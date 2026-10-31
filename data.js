'use strict';
// ゲームデータ：属性・キャラクター・ステージ

const EL = {
  fire:  { name: '炎', color: '#ff5a3c', light: '#ffb199', dark: '#8a1a0a' },
  water: { name: '水', color: '#3c9bff', light: '#a6d4ff', dark: '#0a3a7a' },
  wind:  { name: '風', color: '#3ccf6e', light: '#a8f0c0', dark: '#0d5a2a' },
  light: { name: '光', color: '#ffd83c', light: '#fff3b0', dark: '#8a6a00' },
  dark:  { name: '闇', color: '#a04cff', light: '#d9b8ff', dark: '#3a0a6a' },
};
const BEATS = { fire: 'wind', wind: 'water', water: 'fire', light: 'dark', dark: 'light' };
function elMult(atk, def) {
  if (BEATS[atk] === def) return 1.5;
  if (BEATS[def] === atk && atk !== 'light' && atk !== 'dark') return 0.66;
  return 1;
}

const ABILITIES = {
  guard: { name: '雷耐性', desc: '雷の壁のダメージを無効化' },
  crit:  { name: '急所撃ち', desc: '弱点へのダメージがさらに1.5倍' },
};
const LINKS = {
  burst:  { name: 'バーストリンク', desc: '周囲の敵に爆発ダメージ' },
  heal:   { name: 'ヒールリンク', desc: 'チームのHPを回復' },
  homing: { name: 'ホーミングリンク', desc: '敵を追う光弾×4' },
  laser:  { name: 'クロスレーザー', desc: '十字方向の敵を貫くレーザー' },
  chain:  { name: 'サンダーチェイン', desc: '近い敵3体へ連鎖する雷' },
};

// look: 髪色・髪型・瞳・アクセサリーなど描画パラメータ（art.js で使用）
const CHARACTERS = [
  { id: 'kagutsuchi', name: 'カグツチ', title: '焔を纏いし火神', el: 'fire', type: 'reflect', rarity: 6,
    hp: 2300, atk: 520, abilities: ['crit'], link: 'burst',
    skill: { name: '神火・迦具土', turns: 5, kind: 'power', desc: '攻撃力2.5倍＆スピードアップ' },
    quote: '燃え尽きるまで、止まらねぇ！',
    look: { hair: '#c81e14', hair2: '#ff8a3c', eye: '#ffb000', style: 'spiky', acc: 'flame', mouth: 'grin', outfit: '#4a0d08', brow: true } },
  { id: 'otohime', name: 'オトヒメ', title: '竜宮の歌姫', el: 'water', type: 'pierce', rarity: 6,
    hp: 2600, atk: 430, abilities: ['guard'], link: 'heal',
    skill: { name: '竜宮の調べ', turns: 3, kind: 'heal', desc: 'HPを35%回復＆攻撃力1.5倍' },
    quote: '波の音に、癒やされてくださいね。',
    look: { hair: '#2a6ad8', hair2: '#8ec8ff', eye: '#30d0c8', style: 'long', acc: 'pearl', mouth: 'smile', outfit: '#f4f0ff' } },
  { id: 'susanoo', name: 'スサノオ', title: '嵐を斬る荒神', el: 'wind', type: 'reflect', rarity: 6,
    hp: 2400, atk: 480, abilities: ['guard'], link: 'homing',
    skill: { name: '天叢雲・嵐断', turns: 4, kind: 'pierce', desc: '貫通化＆攻撃力1.8倍' },
    quote: '嵐ごと、ぶった斬る！',
    look: { hair: '#1f7a3a', hair2: '#6ee08a', eye: '#d0ff40', style: 'wild', acc: 'band', mouth: 'grin', outfit: '#20303a', brow: true } },
  { id: 'amaterasu', name: 'アマテラス', title: '天照らす日輪の女神', el: 'light', type: 'pierce', rarity: 6,
    hp: 2200, atk: 500, abilities: ['crit'], link: 'laser',
    skill: { name: '天岩戸開き', turns: 6, kind: 'barrage', desc: '全ての敵に日輪の光を降らせる' },
    quote: '光あれ。闇は、ここで終わりです。',
    look: { hair: '#f0b020', hair2: '#fff0a0', eye: '#ff7a20', style: 'long', acc: 'halo', mouth: 'smile', outfit: '#ffffff' } },
  { id: 'tsukuyomi', name: 'ツクヨミ', title: '夜を統べる月神', el: 'dark', type: 'pierce', rarity: 6,
    hp: 2300, atk: 470, abilities: ['guard'], link: 'chain',
    skill: { name: '月読ノ刻', turns: 4, kind: 'delay', desc: '全ての敵の攻撃ターンを2遅らせる' },
    quote: '静かに……月が見ている。',
    look: { hair: '#b8b0e8', hair2: '#ffffff', eye: '#a050ff', style: 'bob', acc: 'moon', mouth: 'calm', outfit: '#1a1030' } },
  { id: 'brunhild', name: 'ブリュンヒルデ', title: '天翔ける戦乙女', el: 'light', type: 'reflect', rarity: 5,
    hp: 2500, atk: 460, abilities: ['guard'], link: 'burst',
    skill: { name: 'ヴァルハラ・チャージ', turns: 4, kind: 'power', desc: '攻撃力2.5倍＆スピードアップ' },
    quote: '勇者の魂、私が導きます！',
    look: { hair: '#ffe070', hair2: '#fffbe0', eye: '#3a8aff', style: 'bob', acc: 'wing', mouth: 'smile', outfit: '#a0a8c0', brow: true } },
  { id: 'loki', name: 'ロキ', title: '悪戯好きの奸神', el: 'dark', type: 'reflect', rarity: 5,
    hp: 2100, atk: 510, abilities: ['crit'], link: 'homing',
    skill: { name: 'トリックスター', turns: 4, kind: 'pierce', desc: '貫通化＆攻撃力1.8倍' },
    quote: 'ふふ、どっちが本物か当ててごらん？',
    look: { hair: '#2a2438', hair2: '#6a5a90', eye: '#40ff90', style: 'spiky', acc: 'horn', mouth: 'grin', outfit: '#1a3020' } },
  { id: 'siren', name: 'セイレーン', title: '渦潮に歌う人魚', el: 'water', type: 'reflect', rarity: 5,
    hp: 2200, atk: 450, abilities: ['crit'], link: 'chain',
    skill: { name: 'メイルストロム', turns: 5, kind: 'barrage', desc: '全ての敵に渦潮を叩きつける' },
    quote: 'この歌から、逃げられるかしら？',
    look: { hair: '#30c8d0', hair2: '#c0fff8', eye: '#ff70c0', style: 'twin', acc: 'fin', mouth: 'smile', outfit: '#106080' } },
];
const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

// 敵： E(名前, 見た目, 属性, HP, 攻撃力, 攻撃ターン, x, y, 半径, オプション)
function E(name, art, el, hp, atk, cd, x, y, r, opt = {}) {
  return { name, art, el, hp, maxHp: hp, atk, cd, maxCd: cd, x, y, r, gauges: 1, maxGauges: 1,
    weakAng: Math.random() * Math.PI * 2, flash: 0, hit: 0, cool: 0, inside: false, weakIn: false,
    seed: Math.random() * 10, ...opt };
}
function boss(name, art, el, hp, atk, cd, x, y, r, gauges, attackName) {
  return E(name, art, el, hp, atk, cd, x, y, r, { boss: true, gauges, maxGauges: gauges, attackName });
}

const STAGES = [
  { name: '高天原の野', diff: 1, par: 12, walls: [], bg: ['#2a5a3a', '#0b1d12'], mote: '#c8ffb0', waves: [
    () => [E('ぷにスライム', 'slime', 'wind', 2600, 600, 2, 100, 170, 28), E('ぷにスライム', 'slime', 'wind', 2600, 600, 3, 320, 170, 28),
           E('みずぷに', 'slime', 'water', 3000, 700, 2, 210, 290, 30)],
    () => [E('木霊', 'ghost', 'wind', 4500, 700, 2, 110, 220, 34), E('ゆらゆらクラゲ', 'jelly', 'water', 4800, 800, 3, 310, 220, 34),
           E('ひのたま', 'ghost', 'fire', 3200, 600, 1, 210, 130, 26)],
    () => [boss('妖獣ヌエ', 'nue', 'wind', 16000, 1500, 3, 210, 230, 64, 2, '雷鳴の咆哮')],
  ] },
  { name: '荒海の大渦', diff: 2, par: 15, walls: ['left', 'right'], bg: ['#1a4a78', '#050f22'], mote: '#a0e0ff', waves: [
    () => [E('ゆらゆらクラゲ', 'jelly', 'water', 4200, 700, 2, 90, 160, 30), E('ゆらゆらクラゲ', 'jelly', 'water', 4200, 700, 2, 330, 160, 30),
           E('ひのたま', 'ghost', 'fire', 4500, 800, 3, 210, 260, 32), E('みずぷに', 'slime', 'water', 3800, 700, 3, 210, 120, 26)],
    () => [E('深海の騎士', 'knight', 'water', 8500, 1000, 3, 130, 230, 40), E('深海の騎士', 'knight', 'water', 8500, 1000, 2, 290, 230, 40)],
    () => [boss('海魔クラーケン', 'kraken', 'water', 22000, 1900, 3, 210, 220, 66, 3, 'メイルシュトローム')],
  ] },
  { name: '黄泉比良坂', diff: 3, par: 18, walls: ['top'], bg: ['#3a1a4f', '#0a0410'], mote: '#e0b0ff', waves: [
    () => [E('かげコウモリ', 'bat', 'dark', 5200, 800, 2, 80, 140, 28), E('かげコウモリ', 'bat', 'dark', 5200, 800, 2, 340, 140, 28),
           E('黄泉の岩兵', 'golem', 'dark', 7500, 1000, 3, 210, 240, 38)],
    () => [E('黄泉の岩兵', 'golem', 'dark', 12000, 1300, 3, 210, 180, 48), E('鬼火', 'ghost', 'light', 6000, 900, 2, 90, 300, 30),
           E('鬼火', 'ghost', 'light', 6000, 900, 2, 330, 300, 30)],
    () => [boss('八岐大蛇', 'orochi', 'dark', 26000, 2300, 3, 210, 210, 70, 3, '八塩折の毒息')],
  ] },
];
