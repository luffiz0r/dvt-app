const { contextBridge, ipcRenderer } = require("electron");

const heroes = [
  "Abaddon","Alchemist","Ancient_Apparition","Anti-Mage","Arc_Warden","Axe","Bane","Batrider","Beastmaster",
  "Bloodseeker","Bounty_Hunter","Brewmaster","Bristleback","Broodmother","Centaur_Warrunner","Chaos_Knight",
  "Chen","Clinkz","Clockwerk","Crystal_Maiden","Dark_Seer","Dark_Willow","Dawnbreaker","Dazzle","Death_Prophet",
  "Disruptor","Doom","Dragon_Knight","Drow_Ranger","Earth_Spirit","Earthshaker","Elder_Titan","Ember_Spirit",
  "Enchantress","Enigma","Faceless_Void","Grimstroke","Gyrocopter","Hoodwink","Huskar","Invoker","Io","Jakiro",
  "Juggernaut","Keeper_Of_The_Light","Kez","Kunkka","Largo","Legion_Commander","Leshrac","Lich","Lifestealer",
  "Lina","Lion","Lone_Druid","Luna","Lycan","Magnus","Marci","Mars","Medusa","Meepo","Mirana","Monkey_King",
  "Morphling","Muerta","Naga_Siren","Natures_Prophet","Necrophos","Night_Stalker","Nyx_Assassin","Ogre_Magi",
  "Omniknight","Oracle","Outworld_Destroyer","Pangolier","Phantom_Assassin","Phantom_Lancer","Phoenix","Primal_Beast",
  "Puck","Pudge","Pugna","Queen_Of_Pain","Razor","Riki","Ringmaster","Rubick","Sand_King","Shadow_Demon",
  "Shadow_Fiend","Shadow_Shaman","Silencer","Skywrath_Mage","Slardar","Slark","Snapfire","Sniper","Spectre",
  "Spirit_Breaker","Storm_Spirit","Sven","Techies","Templar_Assassin","Terrorblade","Tidehunter","Timbersaw","Tinker",
  "Tiny","Treant_Protector","Troll_Warlord","Tusk","Underlord","Undying","Ursa","Vengeful_Spirit","Venomancer",
  "Viper","Visage","Void_Spirit","Warlock","Weaver","Windranger","Winter_Wyvern","Witch_Doctor","Wraith_King","Zeus"
];

const valoMaps = [
  { id: "Abyss", name: "Abyss" },
  { id: "Ascent", name: "Ascent" },
  { id: "Bind", name: "Bind" },
  { id: "Breeze", name: "Breeze" },
  { id: "Corrode", name: "Corrode" },
  { id: "Fracture", name: "Fracture" },
  { id: "Haven", name: "Haven" },
  { id: "Icebox", name: "Icebox" },
  { id: "Lotus", name: "Lotus" },
  { id: "Pearl", name: "Pearl" },
  { id: "Split", name: "Split" },
  { id: "Sunset", name: "Sunset" }
];

const valoAgents = [
  { id: "Astra", name: "Astra", short: "AS" },
  { id: "Breach", name: "Breach", short: "BR" },
  { id: "Brimstone", name: "Brimstone", short: "BM" },
  { id: "Chamber", name: "Chamber", short: "CH" },
  { id: "Clove", name: "Clove", short: "CL" },
  { id: "Cypher", name: "Cypher", short: "CY" },
  { id: "Deadlock", name: "Deadlock", short: "DL" },
  { id: "Fade", name: "Fade", short: "FA" },
  { id: "Gekko", name: "Gekko", short: "GE" },
  { id: "Harbor", name: "Harbor", short: "HB" },
  { id: "Iso", name: "Iso", short: "IS" },
  { id: "Jett", name: "Jett", short: "JE" },
  { id: "KAYO", name: "KAY/O", short: "KO" },
  { id: "Killjoy", name: "Killjoy", short: "KJ" },
  { id: "Miks", name: "Miks", short: "MI" },
  { id: "Neon", name: "Neon", short: "NE" },
  { id: "Omen", name: "Omen", short: "OM" },
  { id: "Phoenix", name: "Phoenix", short: "PH" },
  { id: "Raze", name: "Raze", short: "RA" },
  { id: "Reyna", name: "Reyna", short: "RE" },
  { id: "Sage", name: "Sage", short: "SA" },
  { id: "Skye", name: "Skye", short: "SK" },
  { id: "Sova", name: "Sova", short: "SO" },
  { id: "Tejo", name: "Tejo", short: "TE" },
  { id: "Veto", name: "Veto", short: "VE" },
  { id: "Viper", name: "Viper", short: "VI" },
  { id: "Vyse", name: "Vyse", short: "VY" },
  { id: "Waylay", name: "Waylay", short: "WA" },
  { id: "Yoru", name: "Yoru", short: "YO" }
];

function getHeroImage(hero) {
  return `./assets/heroes/${hero}.png`;
}

function getHeroVideo(hero) {
  return `./assets/heroes_webm/${hero}.webm`;
}

function getValoMapImage(mapId) {
  return `./assets/maps/${mapId}.png`;
}

function getValoMapBackground(mapId) {
  return `./assets/maps_background/${mapId}.png`;
}

function getValoAgentImage(agentId) {
  return `./assets/agents/${agentId}.png`;
}

contextBridge.exposeInMainWorld("api", {
  getHeroes: () => heroes.slice(),
  getHeroImage,
  getHeroVideo,
  getValoMaps: () => valoMaps.slice(),
  getValoMapImage,
  getValoMapBackground,
  getValoAgents: () => valoAgents.slice(),
  getValoAgentImage
});


contextBridge.exposeInMainWorld("electronUpdates", {
  onStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, payload) => callback(payload));
  },
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  checkNow: () => ipcRenderer.invoke("app:check-for-updates"),
  installNow: () => ipcRenderer.invoke("app:install-update-now")
});
