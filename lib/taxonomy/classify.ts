import { findIBDPTopic } from "@/lib/taxonomy/ibdp";
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

type ClassificationRule = {
  subject: Subject;
  phrase: string;
  topicId: string;
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  { phrase: "specific latent heat", subject: "physics", topicId: "physics.b.particulate-matter.specific-latent-heat" },
  { phrase: "a.1 kinematics", subject: "physics", topicId: "physics.a.kinematics" },
  { phrase: "a.2 forces and momentum", subject: "physics", topicId: "physics.a.forces-momentum" },
  { phrase: "a.3 work, energy and power", subject: "physics", topicId: "physics.a.work-energy-power" },
  { phrase: "a.4 rigid body mechanics", subject: "physics", topicId: "physics.a.rigid-body-mechanics" },
  { phrase: "a.5 galilean and special relativity", subject: "physics", topicId: "physics.a.relativity" },
  { phrase: "b.1 thermal energy transfers", subject: "physics", topicId: "physics.b.thermal-energy-transfers" },
  { phrase: "b.2 greenhouse effect", subject: "physics", topicId: "physics.b.greenhouse-effect" },
  { phrase: "b.3 gas laws", subject: "physics", topicId: "physics.b.gas-laws" },
  { phrase: "b.4 thermodynamics", subject: "physics", topicId: "physics.b.thermodynamics" },
  { phrase: "b.5 current and circuits", subject: "physics", topicId: "physics.b.current-circuits" },
  { phrase: "c.1 simple harmonic motion", subject: "physics", topicId: "physics.c.simple-harmonic-motion" },
  { phrase: "c.2 wave model", subject: "physics", topicId: "physics.c.wave-model" },
  { phrase: "c.3 wave phenomena", subject: "physics", topicId: "physics.c.wave-phenomena" },
  { phrase: "c.4 standing waves and resonance", subject: "physics", topicId: "physics.c.standing-waves-resonance" },
  { phrase: "c.5 doppler effect", subject: "physics", topicId: "physics.c.doppler-effect" },
  { phrase: "d.1 gravitational fields", subject: "physics", topicId: "physics.d.gravitational-fields" },
  { phrase: "d.2 electric and magnetic fields", subject: "physics", topicId: "physics.d.electric-magnetic-fields" },
  { phrase: "d.3 motion in electromagnetic fields", subject: "physics", topicId: "physics.d.motion-electromagnetic-fields" },
  { phrase: "d.4 induction", subject: "physics", topicId: "physics.d.induction" },
  { phrase: "e.1 structure of the atom", subject: "physics", topicId: "physics.e.atomic-structure" },
  { phrase: "e.2 quantum physics", subject: "physics", topicId: "physics.e.quantum-physics" },
  { phrase: "e.3 radioactive decay", subject: "physics", topicId: "physics.e.radioactive-decay" },
  { phrase: "e.4 fission", subject: "physics", topicId: "physics.e.fission" },
  { phrase: "e.5 fusion and stars", subject: "physics", topicId: "physics.e.fusion-stars" },

  { phrase: "structure 1.1", subject: "chemistry", topicId: "chemistry.structure.models.particulate-introduction" },
  { phrase: "structure 1.2", subject: "chemistry", topicId: "chemistry.structure.models.nuclear-atom" },
  { phrase: "structure 1.3", subject: "chemistry", topicId: "chemistry.structure.models.electron-configurations" },
  { phrase: "structure 1.4", subject: "chemistry", topicId: "chemistry.structure.models.mole" },
  { phrase: "structure 1.5", subject: "chemistry", topicId: "chemistry.structure.models.ideal-gases" },
  { phrase: "structure 2.1", subject: "chemistry", topicId: "chemistry.structure.bonding.ionic-model" },
  { phrase: "structure 2.2", subject: "chemistry", topicId: "chemistry.structure.bonding.covalent-model" },
  { phrase: "structure 2.3", subject: "chemistry", topicId: "chemistry.structure.bonding.metallic-model" },
  { phrase: "structure 2.4", subject: "chemistry", topicId: "chemistry.structure.bonding.materials" },
  { phrase: "structure 3.1", subject: "chemistry", topicId: "chemistry.structure.classification.periodic-table" },
  { phrase: "structure 3.2", subject: "chemistry", topicId: "chemistry.structure.classification.functional-groups" },
  { phrase: "reactivity 1.1", subject: "chemistry", topicId: "chemistry.reactivity.driving-reactions.enthalpy" },
  { phrase: "reactivity 1.2", subject: "chemistry", topicId: "chemistry.reactivity.driving-reactions.energy-cycles" },
  { phrase: "reactivity 1.3", subject: "chemistry", topicId: "chemistry.reactivity.driving-reactions.fuels" },
  { phrase: "reactivity 1.4", subject: "chemistry", topicId: "chemistry.reactivity.driving-reactions.entropy-spontaneity" },
  { phrase: "reactivity 2.1", subject: "chemistry", topicId: "chemistry.reactivity.amount-rate-extent.amount" },
  { phrase: "reactivity 2.2", subject: "chemistry", topicId: "chemistry.reactivity.amount-rate-extent.rate" },
  { phrase: "reactivity 2.3", subject: "chemistry", topicId: "chemistry.reactivity.amount-rate-extent.extent" },
  { phrase: "reactivity 3.1", subject: "chemistry", topicId: "chemistry.reactivity.mechanisms.proton-transfer" },
  { phrase: "reactivity 3.2", subject: "chemistry", topicId: "chemistry.reactivity.mechanisms.electron-transfer" },
  { phrase: "reactivity 3.3", subject: "chemistry", topicId: "chemistry.reactivity.mechanisms.electron-sharing" },
  { phrase: "reactivity 3.4", subject: "chemistry", topicId: "chemistry.reactivity.mechanisms.electron-pair-sharing" },
  { phrase: "stoichiometry", subject: "chemistry", topicId: "chemistry.reactivity.amount-rate-extent.amount" },
  { phrase: "ideal gas", subject: "chemistry", topicId: "chemistry.structure.models.ideal-gases" },

  { phrase: "arithmetic sequence", subject: "mathematics", topicId: "mathematics.number-algebra.sequences-series" },
  { phrase: "geometric sequence", subject: "mathematics", topicId: "mathematics.number-algebra.sequences-series" },
  { phrase: "exponents", subject: "mathematics", topicId: "mathematics.number-algebra.exponents-logarithms" },
  { phrase: "logarithms", subject: "mathematics", topicId: "mathematics.number-algebra.exponents-logarithms" },
  { phrase: "complex numbers", subject: "mathematics", topicId: "mathematics.number-algebra.complex-numbers" },
  { phrase: "partial fractions", subject: "mathematics", topicId: "mathematics.number-algebra.partial-fractions" },
  { phrase: "inverse functions", subject: "mathematics", topicId: "mathematics.functions.domain-range-inverses" },
  { phrase: "function transformations", subject: "mathematics", topicId: "mathematics.functions.graphs-transformations" },
  { phrase: "quadratic functions", subject: "mathematics", topicId: "mathematics.functions.quadratics" },
  { phrase: "exponential functions", subject: "mathematics", topicId: "mathematics.functions.exponential-logarithmic" },
  { phrase: "trigonometry", subject: "mathematics", topicId: "mathematics.geometry-trigonometry.trigonometry" },
  { phrase: "vectors", subject: "mathematics", topicId: "mathematics.geometry-trigonometry.vectors" },
  { phrase: "probability distributions", subject: "mathematics", topicId: "mathematics.statistics-probability.distributions" },
  { phrase: "differentiation", subject: "mathematics", topicId: "mathematics.calculus.differentiation" },
  { phrase: "integration", subject: "mathematics", topicId: "mathematics.calculus.integration" },
  { phrase: "differential equations", subject: "mathematics", topicId: "mathematics.calculus.differential-equations" },
];

function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
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
        findIBDPTopic(topicId)?.subject === input.subject,
    ) ?? [];
  if (manualTopicIds.length > 0) {
    return {
      confidence: 1,
      method: "manual_metadata",
      reason: "Used trusted source metadata.",
      topicIds: [...new Set(manualTopicIds)],
    };
  }

  const heading = normalize(input.title);
  const matchingHeadingRule = CLASSIFICATION_RULES.find(
    (rule) =>
      rule.subject === input.subject &&
      heading.includes(rule.phrase),
  );
  if (matchingHeadingRule) {
    return {
      confidence: 0.98,
      method: "heading_rule",
      reason: reasonFor(
        matchingHeadingRule.phrase,
        "heading",
      ),
      topicIds: [matchingHeadingRule.topicId],
    };
  }

  const searchableText = `${heading} ${normalize(input.text)}`;
  const matchingKeywordRule = CLASSIFICATION_RULES.find(
    (rule) =>
      rule.subject === input.subject &&
      searchableText.includes(rule.phrase),
  );
  if (matchingKeywordRule) {
    return {
      confidence: 0.72,
      method: "keyword_rule",
      reason: reasonFor(
        matchingKeywordRule.phrase,
        "keyword",
      ),
      topicIds: [matchingKeywordRule.topicId],
    };
  }

  return {
    confidence: 0,
    method: "unclassified",
    reason:
      "No trusted metadata, heading rule, or keyword rule matched.",
    topicIds: [],
  };
}
