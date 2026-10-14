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

/** "₹6.40 / 100 g" for weight packs (paise in, always 2 decimals); null for "1 bunch", "1 pc" etc. */
export function unitPriceLabel(price: number, label: string): string | null {
  const g = packGrams(label);
  if (!g || price <= 0) return null;
  const per100 = Math.round((price * 100) / g); // paise per 100 g
  const rupees = (per100 / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${rupees} / 100 g`;
}
