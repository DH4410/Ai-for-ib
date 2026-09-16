import {
  IBDP_TOPICS,
  findIBDPTopic,
} from "@/lib/taxonomy/ibdp";
import type { Subject } from "@/types/study";

export type TopicClassificationMethod =
  | "manual_metadata"
  | "heading_rule"
  | "keyword_rule"
  | "unclassified";

export type TopicClassification = {
  topicIds: string[];
  confidence: number;
  method: TopicClassificationMethod;
  reason: string;
};

export type TopicClassificationInput = {
  subject: Subject;
  title: string;
  text: string;
  manualTopicIds?: string[];
};

type PhraseRule = {
  subject: Subject;
  phrase: string;
  topicId: string;
};

type AliasRule = {
  subject: Subject;
  topicId: string;
  phrases: string[];
};

const ALIAS_RULES: AliasRule[] = [
  {
    subject: "physics",
    topicId: "physics.a.kinematics",
    phrases: [
      "equations of motion",
      "displacement time graph",
      "velocity time graph",
      "projectile motion",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.a.forces-momentum",
    phrases: [
      "newton's laws",
      "newton s laws",
      "impulse",
      "momentum conservation",
      "free body diagram",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.a.work-energy-power",
    phrases: [
      "kinetic energy",
      "gravitational potential energy",
      "work done",
      "efficiency",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.a.rigid-body-mechanics",
    phrases: [
      "torque",
      "moment of inertia",
      "angular momentum",
      "rotational equilibrium",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.a.relativity",
    phrases: [
      "lorentz factor",
      "time dilation",
      "length contraction",
      "relativistic",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.b.thermal-energy-transfers",
    phrases: [
      "specific heat capacity",
      "thermal equilibrium",
      "conduction convection radiation",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.b.particulate-matter.specific-latent-heat",
    phrases: [
      "specific latent heat",
      "latent heat",
      "state change energy",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.b.greenhouse-effect",
    phrases: [
      "greenhouse gases",
      "infrared absorption",
      "climate forcing",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.b.gas-laws",
    phrases: [
      "ideal gas law",
      "kinetic model of gases",
      "boyle's law",
      "charles's law",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.b.thermodynamics",
    phrases: [
      "first law of thermodynamics",
      "second law of thermodynamics",
      "entropy",
      "heat engine",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.b.current-circuits",
    phrases: [
      "ohm's law",
      "kirchhoff",
      "electrical resistance",
      "potential divider",
      "current voltage",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.c.simple-harmonic-motion",
    phrases: [
      "simple harmonic",
      "angular frequency",
      "mass spring",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.c.wave-model",
    phrases: [
      "wave speed",
      "wavelength frequency",
      "transverse longitudinal",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.c.wave-phenomena",
    phrases: [
      "diffraction",
      "interference",
      "refraction",
      "snell's law",
      "polarization",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.c.standing-waves-resonance",
    phrases: [
      "standing wave",
      "stationary wave",
      "nodes antinodes",
      "resonant frequency",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.c.doppler-effect",
    phrases: [
      "doppler shift",
      "doppler",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.d.gravitational-fields",
    phrases: [
      "gravitational field strength",
      "gravitational potential",
      "orbital motion",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.d.electric-magnetic-fields",
    phrases: [
      "electric field strength",
      "electric potential",
      "magnetic field strength",
      "coulomb's law",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.d.motion-electromagnetic-fields",
    phrases: [
      "charged particle in a magnetic field",
      "charged particle in an electric field",
      "velocity selector",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.d.induction",
    phrases: [
      "faraday's law",
      "lenz's law",
      "electromagnetic induction",
      "magnetic flux",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.e.atomic-structure",
    phrases: [
      "atomic spectra",
      "rutherford scattering",
      "energy levels",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.e.quantum-physics",
    phrases: [
      "photoelectric effect",
      "de broglie",
      "wave particle duality",
      "quantum",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.e.radioactive-decay",
    phrases: [
      "half life",
      "radioactive decay",
      "decay constant",
      "activity",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.e.fission",
    phrases: [
      "nuclear fission",
      "chain reaction",
      "binding energy",
    ],
  },
  {
    subject: "physics",
    topicId: "physics.e.fusion-stars",
    phrases: [
      "nuclear fusion",
      "stellar fusion",
      "hertzsprung russell",
      "main sequence star",
    ],
  },

  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.models.particulate-introduction",
    phrases: [
      "pure substance",
      "mixture",
      "homogeneous mixture",
      "heterogeneous mixture",
      "particulate nature of matter",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.models.nuclear-atom",
    phrases: [
      "isotope",
      "mass spectrometry",
      "mass spectrum",
      "proton neutron electron",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.models.electron-configurations",
    phrases: [
      "electron configuration",
      "atomic orbital",
      "aufbau",
      "ionization energy",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.models.mole",
    phrases: [
      "avogadro constant",
      "molar mass",
      "empirical formula",
      "molecular formula",
      "mole ratio",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.models.ideal-gases",
    phrases: [
      "ideal gas",
      "molar volume",
      "gas equation",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.bonding.ionic-model",
    phrases: [
      "ionic bond",
      "ionic lattice",
      "lattice enthalpy",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.bonding.covalent-model",
    phrases: [
      "covalent bond",
      "lewis structure",
      "vsepr",
      "molecular geometry",
      "formal charge",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.bonding.metallic-model",
    phrases: [
      "metallic bond",
      "delocalized electrons",
      "metal lattice",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.bonding.materials",
    phrases: [
      "intermolecular forces",
      "hydrogen bonding",
      "van der waals",
      "allotrope",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.classification.periodic-table",
    phrases: [
      "periodic trend",
      "periodicity",
      "electronegativity",
      "atomic radius",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.structure.classification.functional-groups",
    phrases: [
      "functional group",
      "homologous series",
      "organic nomenclature",
      "structural isomer",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.driving-reactions.enthalpy",
    phrases: [
      "enthalpy change",
      "calorimetry",
      "bond enthalpy",
      "standard enthalpy",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.driving-reactions.energy-cycles",
    phrases: [
      "hess's law",
      "hess law",
      "born haber",
      "energy cycle",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.driving-reactions.fuels",
    phrases: [
      "fuel combustion",
      "combustion of fuels",
      "biofuel",
      "fuel cell",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.driving-reactions.entropy-spontaneity",
    phrases: [
      "entropy change",
      "gibbs free energy",
      "spontaneous reaction",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.amount-rate-extent.amount",
    phrases: [
      "stoichiometry",
      "limiting reagent",
      "percentage yield",
      "atom economy",
      "titration calculation",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.amount-rate-extent.rate",
    phrases: [
      "collision theory",
      "reaction rate",
      "activation energy",
      "rate constant",
      "arrhenius",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.amount-rate-extent.extent",
    phrases: [
      "chemical equilibrium",
      "equilibrium constant",
      "le chatelier",
      "reaction quotient",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.mechanisms.proton-transfer",
    phrases: [
      "acid base",
      "bronsted lowry",
      "ph calculation",
      "buffer solution",
      "acid dissociation",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.mechanisms.electron-transfer",
    phrases: [
      "redox reaction",
      "oxidation number",
      "electrochemical cell",
      "electrolysis",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.mechanisms.electron-sharing",
    phrases: [
      "free radical",
      "radical substitution",
      "homolytic fission",
    ],
  },
  {
    subject: "chemistry",
    topicId:
      "chemistry.reactivity.mechanisms.electron-pair-sharing",
    phrases: [
      "nucleophile",
      "electrophile",
      "heterolytic fission",
      "curly arrow",
    ],
  },

  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.sequences-series",
    phrases: [
      "arithmetic sequence",
      "geometric sequence",
      "arithmetic series",
      "geometric series",
      "sigma notation",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.exponents-logarithms",
    phrases: [
      "laws of indices",
      "exponential equation",
      "logarithmic equation",
      "log laws",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.proof",
    phrases: [
      "proof by induction",
      "proof by contradiction",
      "counterexample",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.binomial-counting",
    phrases: [
      "binomial theorem",
      "binomial expansion",
      "permutation combination",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.complex-numbers",
    phrases: [
      "complex plane",
      "argand diagram",
      "de moivre",
      "modulus argument",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.linear-systems",
    phrases: [
      "simultaneous linear equations",
      "gaussian elimination",
      "system of linear equations",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.number-algebra.partial-fractions",
    phrases: [
      "partial fraction decomposition",
      "partial fractions",
    ],
  },
  {
    subject: "mathematics",
    topicId: "mathematics.functions.lines",
    phrases: [
      "straight line",
      "gradient intercept",
      "perpendicular bisector",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.functions.domain-range-inverses",
    phrases: [
      "domain and range",
      "inverse function",
      "composite function",
      "one to one function",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.functions.graphs-transformations",
    phrases: [
      "function transformation",
      "graph transformation",
      "translation reflection stretch",
    ],
  },
  {
    subject: "mathematics",
    topicId: "mathematics.functions.quadratics",
    phrases: [
      "quadratic function",
      "discriminant",
      "vertex form",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.functions.exponential-logarithmic",
    phrases: [
      "exponential function",
      "logarithmic function",
      "exponential model",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.functions.polynomial-rational",
    phrases: [
      "polynomial function",
      "rational function",
      "asymptote",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.functions.equations-inequalities",
    phrases: [
      "equation inequality",
      "inequality",
      "roots of an equation",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.geometry-trigonometry.trigonometry",
    phrases: [
      "sine rule",
      "cosine rule",
      "trigonometric identity",
      "radian",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.geometry-trigonometry.vectors",
    phrases: [
      "vector equation",
      "scalar product",
      "dot product",
      "cross product",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.geometry-trigonometry.geometry",
    phrases: [
      "circle theorem",
      "voronoi",
      "three dimensional geometry",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.statistics-probability.descriptive-statistics",
    phrases: [
      "box plot",
      "standard deviation",
      "interquartile range",
      "correlation coefficient",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.statistics-probability.probability",
    phrases: [
      "conditional probability",
      "bayes theorem",
      "probability tree",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.statistics-probability.distributions",
    phrases: [
      "binomial distribution",
      "normal distribution",
      "poisson distribution",
      "expected value",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.statistics-probability.sampling-testing",
    phrases: [
      "hypothesis test",
      "significance level",
      "confidence interval",
      "chi squared",
    ],
  },
  {
    subject: "mathematics",
    topicId: "mathematics.calculus.limits",
    phrases: [
      "limit of a function",
      "continuity",
      "l'hopital",
      "l hopital",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.calculus.differentiation",
    phrases: [
      "differentiate",
      "derivative",
      "chain rule",
      "product rule",
      "quotient rule",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.calculus.differentiation-applications",
    phrases: [
      "optimization",
      "stationary point",
      "related rates",
      "tangent normal",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.calculus.integration",
    phrases: [
      "integrate",
      "definite integral",
      "integration by parts",
      "substitution integration",
    ],
  },
  {
    subject: "mathematics",
    topicId:
      "mathematics.calculus.differential-equations",
    phrases: [
      "differential equation",
      "separation of variables",
      "euler method",
    ],
  },
  {
    subject: "mathematics",
    topicId: "mathematics.calculus.series",
    phrases: [
      "maclaurin series",
      "taylor series",
      "power series",
    ],
  },
];

function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNumberPart(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].every(
      (character) =>
        character >= "0" &&
        character <= "9",
    )
  );
}

function isPhysicsSectionToken(
  value: string,
): boolean {
  const parts = value.split(".");
  return (
    parts.length === 2 &&
    parts[0].length === 1 &&
    parts[0] >= "A" &&
    parts[0] <= "E" &&
    isNumberPart(parts[1])
  );
}

function labelWithoutCurriculumPrefix(
  label: string,
): string {
  const trimmed = label.trim();
  const lower = trimmed.toLocaleLowerCase();

  if (
    lower.startsWith("theme ") ||
    lower.startsWith("structure ") ||
    lower.startsWith("reactivity ") ||
    lower.startsWith("topic ")
  ) {
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex >= 0) {
      return trimmed
        .slice(colonIndex + 1)
        .trim();
    }
  }

  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace > 0) {
    const firstToken =
      trimmed.slice(0, firstSpace);
    if (isPhysicsSectionToken(firstToken)) {
      return trimmed
        .slice(firstSpace + 1)
        .trim();
    }
  }

  return trimmed;
}

function phraseSpecificity(
  phrase: string,
): number {
  return phrase.replace(/\s/g, "").length;
}

function canonicalHeadingRules(): PhraseRule[] {
  return IBDP_TOPICS.flatMap((topic) => {
    const full = normalize(topic.label);
    const simplified = normalize(
      labelWithoutCurriculumPrefix(topic.label),
    );

    return [
      {
        phrase: full,
        subject: topic.subject,
        topicId: topic.id,
      },
      ...(simplified && simplified !== full
        ? [
            {
              phrase: simplified,
              subject: topic.subject,
              topicId: topic.id,
            },
          ]
        : []),
    ];
  });
}

const HEADING_RULES =
  canonicalHeadingRules();

const KEYWORD_RULES: PhraseRule[] =
  ALIAS_RULES.flatMap((rule) =>
    rule.phrases.map((phrase) => ({
      phrase: normalize(phrase),
      subject: rule.subject,
      topicId: rule.topicId,
    })),
  );

function headingMatches(
  heading: string,
  phrase: string,
): boolean {
  const tokenCount =
    phrase.split(" ").filter(Boolean).length;
  const specific =
    tokenCount >= 2 ||
    phraseSpecificity(phrase) >= 9;

  return specific
    ? heading.includes(phrase)
    : heading === phrase;
}

function bestRule(
  rules: PhraseRule[],
  subject: Subject,
  haystack: string,
  matcher: (
    haystack: string,
    phrase: string,
  ) => boolean,
): PhraseRule | undefined {
  return rules
    .filter(
      (rule) =>
        rule.subject === subject &&
        matcher(haystack, rule.phrase),
    )
    .sort(
      (left, right) =>
        phraseSpecificity(right.phrase) -
          phraseSpecificity(left.phrase) ||
        right.phrase.length -
          left.phrase.length ||
        left.topicId.localeCompare(
          right.topicId,
        ),
    )[0];
}

function reasonFor(
  phrase: string,
  type: "heading" | "keyword",
): string {
  return `Matched the ${type} phrase '${phrase}'.`;
}

export function classifyTopics(
  input: TopicClassificationInput,
): TopicClassification {
  const manualTopicIds =
    input.manualTopicIds?.filter(
      (topicId) =>
        findIBDPTopic(topicId)?.subject ===
        input.subject,
    ) ?? [];
  if (manualTopicIds.length > 0) {
    return {
      confidence: 1,
      method: "manual_metadata",
      reason:
        "Used trusted source metadata.",
      topicIds: [
        ...new Set(manualTopicIds),
      ],
    };
  }

  const heading = normalize(input.title);
  const headingRule = bestRule(
    HEADING_RULES,
    input.subject,
    heading,
    headingMatches,
  );
  if (headingRule) {
    return {
      confidence: 0.98,
      method: "heading_rule",
      reason: reasonFor(
        headingRule.phrase,
        "heading",
      ),
      topicIds: [headingRule.topicId],
    };
  }

  const searchableText = normalize(
    `${input.title} ${input.text}`,
  );
  const keywordRule = bestRule(
    KEYWORD_RULES,
    input.subject,
    searchableText,
    (text, phrase) =>
      text.includes(phrase),
  );
  if (keywordRule) {
    return {
      confidence: 0.76,
      method: "keyword_rule",
      reason: reasonFor(
        keywordRule.phrase,
        "keyword",
      ),
      topicIds: [keywordRule.topicId],
    };
  }

  return {
    confidence: 0,
    method: "unclassified",
    reason:
      "No trusted metadata, canonical heading, or supported keyword alias matched.",
    topicIds: [],
  };
}
