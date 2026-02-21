export const STEEL_DENSITY = 0.284;

export const GAUGE_TO_DECIMAL: Record<string, number> = {
  "7ga": 0.1793,
  "10ga": 0.1345,
  "11ga": 0.1196,
  "12ga": 0.1046,
  "14ga": 0.0747,
  "16ga": 0.0598,
  "18ga": 0.0478,
  "20ga": 0.0359
};

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Sheet: ["sheet", "sht", "flat rolled"],
  Plate: ["plate", "plt"],
  Coil: ["coil"],
  "Round Bar": ["round bar", "rbar", "rod"],
  "Flat Bar": ["flat bar"],
  "Hex Bar": ["hex bar"],
  "Square Bar": ["square bar"],
  Angles: ["angle"],
  Channels: ["channel"],
  "Ornamental Tubing": ["ornamental tubing", "ot"],
  "Structural Tubing": ["structural tubing", "hss"],
  Pipe: ["pipe", "schedule", "sanitary"],
  Fittings: ["fitting", "elbow", "tee", "reducer"]
};
