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
  Valve: ["valve", "ball valve", "gate valve", "globe valve", "check valve", "butterfly valve", "needle valve", "plug valve", "control valve"],
  Flange: ["flange", "wnrf", "welding neck", "slip on", "socket weld flange", "blind flange", "lap joint", "rtj flange", "sorf", "wn"],
  Elbow: ["elbow", "45deg", "90deg", "180deg", "long radius elbow", "short radius elbow", "lr elbow", "sr elbow"],
  Tee: ["tee", "equal tee", "reducing tee", "lateral tee"],
  Reducer: ["reducer", "concentric", "eccentric"],
  Cap: ["cap", "end cap"],
  Coupling: ["coupling", "half coupling", "full coupling"],
  Union: ["union"],
  Nipple: ["nipple", "swage nipple", "hex nipple"],
  Olet: ["olet", "weldolet", "sockolet", "threadolet", "latrolet", "elbolet"],
  Gasket: ["gasket", "spiral wound", "ring gasket"],
  Strainer: ["strainer", "y strainer", "basket strainer"],
  "Buttweld Fitting": ["buttweld", "bw fitting", "butt weld"],
  "Socket Weld Fitting": ["socket weld", "sw fitting"],
  "Threaded Fitting": ["threaded fitting", "npt", "bsp", "fnpt", "mnpt"],
  "Sanitary Fitting": ["tri clamp", "triclover", "sanitary fitting", "clamp end"],
  Pipe: ["pipe", "schedule", "seamless pipe", "welded pipe", "sanitary pipe"],
  Tube: ["tube", "tubing"],
  "Structural Tubing": ["structural tubing", "hss"],
  "Ornamental Tubing": ["ornamental tubing", "ot"],
  Sheet: ["sheet", "sht", "flat rolled"],
  Plate: ["plate", "plt"],
  Coil: ["coil"],
  "Round Bar": ["round bar", "rbar", "rod"],
  "Flat Bar": ["flat bar"],
  "Hex Bar": ["hex bar"],
  "Square Bar": ["square bar"],
  Angles: ["angle"],
  Channels: ["channel"],
  Fittings: ["fitting"]
};
