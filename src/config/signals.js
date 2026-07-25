export const SIGNAL_GROUPS = [
  {
    id: "expansion",
    label: "Factory expansion",
    query: '("new factory" OR "new manufacturing plant" OR "plant expansion" OR "factory expansion" OR "production capacity" OR "manufacturing investment")'
  },
  {
    id: "procurement",
    label: "Procurement activity",
    query: '("procurement manager" OR "strategic sourcing manager" OR "commodity manager" OR "supplier development" OR "supplier qualification" OR "seeking suppliers")'
  },
  {
    id: "product",
    label: "Product or platform launch",
    query: '("launches new product" OR "new product platform" OR "new vehicle platform" OR "new production program" OR "starts production")'
  },
  {
    id: "supply",
    label: "Supply-chain change",
    query: '("supply chain disruption" OR "supplier shortage" OR "dual sourcing" OR "supplier consolidation" OR "new supplier" OR "localize supply chain")'
  }
];

export const SIGNAL_TERMS = {
  expansion: [
    ["new factory", 24], ["new manufacturing plant", 24], ["plant expansion", 20],
    ["factory expansion", 20], ["production capacity", 12], ["manufacturing investment", 16],
    ["new plant", 18], ["expand production", 15], ["capacity expansion", 17]
  ],
  procurement: [
    ["procurement manager", 22], ["strategic sourcing", 22], ["commodity manager", 22],
    ["supplier development", 18], ["supplier qualification", 20], ["seeking suppliers", 26],
    ["new supplier", 14], ["sourcing manager", 20]
  ],
  product: [
    ["launches new", 15], ["new product", 12], ["new platform", 17],
    ["new vehicle", 16], ["starts production", 18], ["new production program", 20]
  ],
  supply: [
    ["supply chain disruption", 18], ["supplier shortage", 22], ["dual sourcing", 23],
    ["supplier consolidation", 18], ["localize supply chain", 20], ["shortage", 10]
  ]
};

export const INDUSTRIAL_TERMS = [
  "manufactur", "factory", "industrial", "automotive", "electrical", "electronics",
  "plastic", "resin", "polymer", "appliance", "sanitary", "machinery", "energy",
  "aerospace", "medical device", "semiconductor", "battery", "automation"
];

export function signalLabel(signal) {
  return SIGNAL_GROUPS.find((group) => group.id === signal)?.label || "Industrial signal";
}
