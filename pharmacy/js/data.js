// Static game data: the shop layout, ingredients, remedies, people and levels.
var NS = window.NS || (window.NS = {});

NS.TILE = 16;

// # wall   , staff floor   . shop floor   S jar shelf   H stock shelf
// B compounding bench   T terminal   c counter   R drop-off   K pick-up
// G shop gondola   p plant   h chair   D door
NS.MAP = [
  "########################",
  "#SSSSSS,,,,,,,,,,SSSSSS#",
  "#,,,,,,,,,,,,,,,,,,,,,,#",
  "#B,,,,,,,,,,,,,,,,,,,,T#",
  "#B,,,,,HH,,,,,,HH,,,,,,#",
  "#B,,,,,HH,,,,,,HH,,,,,,#",
  "#,,,,,,,,,,,,,,,,,,,,,,#",
  "#ccccccRcccccccccKccccc#",
  "#......................#",
  "#p.....................#",
  "#..GG.........hhhh...GG#",
  "#..GG..............p.GG#",
  "#......................#",
  "#p....................p#",
  "##########DD############"
];

NS.SPOTS = {
  playerStart: [11, 3],
  serve: [7, 6],            // where Mia stands to use the drop-off
  pickupStaff: [17, 6],
  pickupCustomer: [17, 8],
  door: [10, 14],
  doorInside: [10, 13],
  queue: [[7, 8], [7, 9], [7, 10], [7, 11], [7, 12], [6, 12]],
  chairs: [[14, 10], [15, 10], [16, 10], [17, 10]],
  standing: [[13, 12], [15, 12], [17, 12], [19, 12], [12, 9], [20, 9]],
  benches: [[2, 3], [2, 4], [2, 5]],
  staffIdle: [[4, 2], [10, 3], [12, 6], [19, 5], [9, 2], [5, 6]]
};

NS.INGREDIENTS = {
  moon:    { name: "Moonwater",        icon: "\u{1F319}", cost: 2 },
  root:    { name: "Mandrake root",    icon: "\u{1F33F}", cost: 2 },
  shroom:  { name: "Toadstool",        icon: "\u{1F344}", cost: 1 },
  bone:    { name: "Bone dust",        icon: "\u{1F9B4}", cost: 2 },
  wax:     { name: "Black candle wax", icon: "\u{1F56F}️", cost: 1 },
  eye:     { name: "Eye of newt",      icon: "\u{1F441}️", cost: 3 },
  bat:     { name: "Bat wing",         icon: "\u{1F987}", cost: 3 },
  spider:  { name: "Spider silk",      icon: "\u{1F578}️", cost: 3 },
  feather: { name: "Raven feather",    icon: "\u{1FAB6}", cost: 3 },
  crystal: { name: "Quartz shard",     icon: "\u{1F48E}", cost: 4 }
};

NS.REMEDIES = [
  { name: "Moonwort Tincture",    dose: "30 ml",  recipe: ["moon", "root", "shroom"],                 price: 14, level: 1 },
  { name: "Gravedust Lozenges",   dose: "#20",    recipe: ["bone", "wax", "root"],                    price: 15, level: 1 },
  { name: "Hexaprofen",           dose: "200 mg", recipe: ["eye", "bat", "moon"],                     price: 18, level: 1 },
  { name: "Banshee Throat Drops", dose: "#12",    recipe: ["bat", "spider", "root", "moon"],          price: 22, level: 2 },
  { name: "Sleepless-No-More",    dose: "10 mg",  recipe: ["feather", "moon", "wax", "shroom"],       price: 22, level: 2 },
  { name: "Curse-Away XR",        dose: "50 mg",  recipe: ["crystal", "eye", "bone", "wax"],          price: 26, level: 3 },
  { name: "Vampirin Chewables",   dose: "#30",    recipe: ["root", "bat", "crystal", "spider", "moon"], price: 32, level: 4 },
  { name: "Lycanthrovir",         dose: "500 mg", recipe: ["moon", "bone", "feather", "eye", "shroom"], price: 36, level: 5 }
];

NS.FIRST = ["Agnes", "Morticia", "Vlad", "Edgar", "Lenore", "Wednesday", "Silas", "Hazel",
  "Ichabod", "Ophelia", "Barnaby", "Elvira", "Damien", "Raven", "Ezra", "Mabel", "Lucius",
  "Winnie", "Abner", "Clementine", "Otis", "Beatrix", "Igor", "Maude", "Thaddeus", "Ruby",
  "Jonah", "Priya", "Marcus", "Delia"];
NS.LAST = ["Blackwood", "Crowley", "Ashgrove", "Thornfield", "Graves", "Holloway", "Mortlake",
  "Nightingale", "Grimsby", "Vane", "Hawthorne", "Bramble", "Wicker", "Moss", "Fenwick",
  "Hollister", "Carrow", "Dredge", "Sallow", "Pike", "Underhill", "Quill", "Marsh"];
NS.DOCTORS = ["Dr. Frankenstein", "Dr. Jekyll", "Dr. Van Helsing", "Dr. Moreau",
  "Dr. Seward", "Dr. Caligari", "Dr. Crane"];
NS.CLINICS = ["Ravenhollow Clinic", "St. Cuthbert's Infirmary", "Old Mill Surgery", "Fogbank Medical"];

NS.GREETINGS = [
  "Hi, my name is {name}. My birthday is {dob}.",
  "Evening. {name}, born {dob}. I've got a script.",
  "Hello! I'm {name}, date of birth {dob}.",
  "Um, hi. {name}? Birthday {dob}. Is this the right counter?",
  "{name}. {dob}. Please hurry, the moon's nearly full."
];

NS.SKIN = ["#f6d3b3", "#eab38f", "#c98b62", "#9a613f", "#6b4129", "#f1c7a5", "#d8a07a"];
NS.HAIR = ["#2a1b12", "#5a3720", "#a0612b", "#d9b25f", "#e7e2d6", "#8c8c8c", "#b13b2c", "#3a3a6a", "#111111"];
NS.TOPS = ["#6b3fa0", "#2f6f4f", "#9c2f3b", "#2d4f8b", "#c07a1f", "#444444", "#7a5c3a", "#1f7a7a", "#b8577a"];
NS.BOTTOMS = ["#2b3a55", "#3b3b3b", "#4d3b2a", "#24304a", "#5a4a6a"];

NS.MIA_LOOK = {
  skin: "#f1c7a5", hair: "#3b2416", hairStyle: "long",
  top: "#1f7a6b", bottom: "#2b3a55", shoes: "#1c1c1c", coat: true
};
NS.TECH_LOOKS = [
  { name: "Priya",  skin: "#c98b62", hair: "#111111", hairStyle: "bun",   top: "#3b82c4", bottom: "#3b82c4", shoes: "#eeeeee", coat: false },
  { name: "Marcus", skin: "#6b4129", hair: "#111111", hairStyle: "short", top: "#3b82c4", bottom: "#3b82c4", shoes: "#222222", coat: false },
  { name: "Jo",     skin: "#f6d3b3", hair: "#b13b2c", hairStyle: "cap",   top: "#3b82c4", bottom: "#3b82c4", shoes: "#222222", coat: false, hat: "#3b82c4" }
];

// Things that can be wrong with a customer's paperwork, and the level they first appear.
NS.FAULTS = {
  idName:     { level: 1, why: "the name on the ID isn't the name they gave you" },
  idDob:      { level: 1, why: "the birthday on the ID doesn't match what they said" },
  idExpired:  { level: 2, why: "the ID had expired" },
  rxName:     { level: 2, why: "the prescription was written for someone else" },
  rxUnsigned: { level: 3, why: "the prescription wasn't signed" },
  rxForged:   { level: 3, why: "the prescriber had never heard of them (a phone call would have caught it)" },
  idPhoto:    { level: 4, why: "the photo on the ID was someone else" },
  allergy:    { level: 4, why: "their file lists an allergy to something in the remedy" }
};

NS.LEVEL_NOTES = {
  1: ["Customers queue at the Rx drop-off. Walk up and press E to serve them.",
      "Compare what they say against their ID. Name and birthday must match.",
      "Fill good scripts at the bench, then hand them over at the pick-up bell."],
  2: ["New: IDs can be expired. Check the EXP date against today's date.",
      "New: scripts can be written for someone else. Check the patient name.",
      "You can now hire a pharmacy tech at the terminal."],
  3: ["New: unsigned prescriptions. No signature, no pills.",
      "New: forged scripts. Use the phone to call the prescriber when in doubt."],
  4: ["New: ID photos might not match the face in front of you.",
      "New: allergies. The computer shows the patient's file.",
      "A second tech is available to hire."],
  5: ["Full moon tonight. Expect a rush.", "A third tech is available to hire."]
};

NS.levelConfig = function (level) {
  return {
    goal: 30 + level * 20,
    dayLength: 180,
    spawnEvery: Math.max(6, 14 - level * 1.5),
    faultChance: Math.min(0.45, 0.22 + level * 0.04),
    techSlots: level >= 5 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0,
    grindZone: Math.max(0.14, 0.3 - level * 0.025)
  };
};

NS.TECH_COST = 60;
NS.TECH_WAGE = 8;
NS.TECH_WORK_TIME = 14;
NS.FINE = 15;
NS.CATCH_BONUS = 5;
NS.STRIKES_ALLOWED = 3;
