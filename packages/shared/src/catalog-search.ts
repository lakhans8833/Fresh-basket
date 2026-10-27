/**
 * Search helpers: everyday Hindi / Hinglish names for fruits and vegetables, so "tamatar",
 * "aloo" or "pyaz" find Tomato, Potato and Onion. This is a language list, not store data:
 * a name only helps if a product with the English name exists in the catalogue.
 */
const NAMES: Record<string, string[]> = {
  tomato: ["tamatar", "tamater", "tamaatar", "tamato"],
  potato: ["aloo", "alu", "aaloo", "batata"],
  onion: ["pyaz", "pyaaz", "piyaz", "piyaj", "kanda", "pyaj"],
  carrot: ["gajar", "gaajar"],
  spinach: ["palak", "paalak"],
  coriander: ["dhaniya", "dhania", "dhaniyaa", "kothmir", "kothimbir", "cilantro"],
  "ladies finger": ["bhindi", "bhendi", "okra", "lady finger", "ladyfinger"],
  capsicum: ["shimla mirch", "simla mirch", "bell pepper", "shimla"],
  cucumber: ["kheera", "khira", "kakdi"],
  pumpkin: ["kaddu", "sitaphal", "kashiphal", "petha"],
  beetroot: ["chukandar", "beet"],
  cauliflower: ["phool gobhi", "phool gobi", "phoolgobhi", "gobhi", "gobi"],
  cabbage: ["patta gobhi", "patta gobi", "band gobhi", "bandh gobhi", "pattagobhi"],
  garlic: ["lahsun", "lehsun", "lasun", "lahsan"],
  ginger: ["adrak", "adrakh"],
  "green chilli": ["hari mirch", "mirchi", "mirch", "chilli", "chili"],
  fenugreek: ["methi"],
  mint: ["pudina", "pudeena"],
  peas: ["matar", "mattar", "green peas"],
  brinjal: ["baingan", "bengan", "baigan", "eggplant", "aubergine"],
  "bottle gourd": ["lauki", "ghiya", "ghia", "dudhi"],
  "bitter gourd": ["karela", "karela"],
  "ridge gourd": ["tori", "turai", "torai", "turiya"],
  "round gourd": ["tinda"],
  "sponge gourd": ["gilki", "nenua"],
  radish: ["mooli", "muli"],
  "sweet potato": ["shakarkandi", "shakarkand"],
  colocasia: ["arbi", "arvi"],
  "french beans": ["beans", "sem", "phali", "frans bean"],
  "spring onion": ["hara pyaz", "hari pyaz", "green onion", "scallion"],
  "curry leaves": ["kadi patta", "kari patta", "curry patta", "meetha neem"],
  lemon: ["nimbu", "nimboo"],
  corn: ["bhutta", "makka", "makki", "sweet corn"],
  mushroom: ["khumb", "khumbi"],
  jackfruit: ["kathal", "katahal"],
  "raw banana": ["kacha kela", "kachha kela"],
  banana: ["kela", "kele"],
  apple: ["seb", "sev", "saib"],
  mango: ["aam"],
  grapes: ["angoor", "angur"],
  orange: ["santra", "santara", "narangi"],
  papaya: ["papita"],
  watermelon: ["tarbooz", "tarbuj", "tarbuz"],
  muskmelon: ["kharbooza", "kharbuja"],
  pomegranate: ["anar", "anaar"],
  guava: ["amrood", "amrud", "peru"],
  pineapple: ["ananas"],
  "sweet lime": ["mosambi", "mausambi", "mosambi"],
  "custard apple": ["sharifa", "sitafal"],
  coconut: ["nariyal"],
  "dragon fruit": ["kamalam"],
  lettuce: ["salad patta"],
  "drumstick": ["sahjan", "saijan", "moringa"],
  "raw mango": ["kacha aam", "kairi", "keri"],
};

// Keeps Latin letters, digits and Devanagari (so "टमाटर tomato" keeps both words).
const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^a-z0-9\u0900-\u097f ]+/g, " ").replace(/\s+/g, " ").trim();

const ALIAS_TO_NAME = new Map<string, string>();
for (const [name, aliases] of Object.entries(NAMES)) {
  for (const a of aliases) ALIAS_TO_NAME.set(norm(a), name);
}

/**
 * The words to search for: the query itself plus the English name for any Hindi/Hinglish
 * name it contains (whole query first, then each word). "tamatar" -> ["tamatar", "tomato"].
 */
export function expandSearchTerms(query: string): string[] {
  const q = norm(query);
  if (!q) return [];
  const out = new Set<string>([q]);
  const whole = ALIAS_TO_NAME.get(q);
  // An English product name ("sweet lime", "green chilli") is searched as-is; splitting it into words
  // would turn "lime" or "chilli" into other products.
  const isEnglishName = Object.prototype.hasOwnProperty.call(NAMES, q);
  if (whole) out.add(whole);
  else if (!isEnglishName) {
    const words = q.split(" ");
    // two-word names first ("shimla mirch"), then single words
    for (let i = 0; i < words.length - 1; i++) {
      const hit = ALIAS_TO_NAME.get(`${words[i]} ${words[i + 1]}`);
      if (hit) out.add(hit);
    }
    for (const w of words) {
      const hit = ALIAS_TO_NAME.get(w);
      if (hit) out.add(hit);
    }
  }
  return [...out].slice(0, 6);
}

/** "tomatoes" -> "tomato", "berries" -> "berry", "carrots" -> "carrot"; short words and "-ss" stay. */
export function singular(w: string): string {
  if (w.length <= 3 || w.endsWith("ss")) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("oes") || w.endsWith("ches") || w.endsWith("shes")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Levenshtein distance, stopping early once it's above `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

// Colour / freshness words people add ("green capsicum", "fresh tomatoes") that product names often leave out.
const DESCRIPTORS = new Set(["green", "red", "yellow", "fresh", "desi", "small", "big", "large", "new", "the", "and", "of", "kg", "g", "gm"]);

/**
 * Forgiving search used when the exact search finds nothing: plurals ("tomatoes"), word order and
 * extra words ("green capsicum"), and one-letter typos ("brocoli", "carot"). Every remaining query word
 * must match a word of the product (or its Hindi name), so results stay relevant.
 */
export function looseMatch(query: string, haystack: string[]): boolean {
  const words = norm(query).split(" ").filter(Boolean).map(singular);
  const core = words.filter((w) => !DESCRIPTORS.has(w));
  const want = core.length ? core : words;
  if (!want.length) return false;
  const hayWords = haystack.flatMap((h) => norm(h).split(" ")).filter(Boolean).map(singular);
  return want.every((w) => {
    const alias = ALIAS_TO_NAME.get(w);
    const options = alias ? [w, ...norm(alias).split(" ")] : [w];
    return options.some((o) =>
      hayWords.some((h) => h === o || (o.length >= 3 && h.startsWith(o)) || (o.length >= 4 && within(o, h, o.length >= 8 ? 2 : 1))),
    );
  });
}

/** The English name a Hindi/Hinglish query maps to, for "Showing results for …" hints. */
export function englishNameFor(query: string): string | null {
  const terms = expandSearchTerms(query);
  return terms.length > 1 ? terms[1]! : null;
}

/** "500 g" -> 500, "1 kg" -> 1000, "1.5 kg" -> 1500, "1 bunch" -> null. Mirrors SQL pack_label_grams. */
export function packGrams(label: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilograms?|g|gm|gms|grams?|gr)$/.exec(label.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  const g = Math.round(m[2]!.startsWith("k") ? n * 1000 : n);
  return g > 0 ? g : null;
}

/**
 * Price per kilo for weight packs, e.g. 500 g at ₹90 -> "₹180/kg" (paise in; whole rupees when exact,
 * else 2 decimals). null for "1 bunch", "1 pc" etc., and for 1 kg packs (the price already is per kg).
 */
export function unitPriceLabel(price: number, label: string): string | null {
  const g = packGrams(label);
  if (!g || g === 1000 || price <= 0) return null;
  const perKg = Math.round((price * 1000) / g); // paise per kg
  const rupees = perKg % 100 === 0
    ? (perKg / 100).toLocaleString("en-IN")
    : (perKg / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${rupees}/kg`;
}
