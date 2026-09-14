import type { Subject } from "@/types/study";

export type IBDPTopic = {
  id: string;
  subject: Subject;
  parentId: string | null;
  label: string;
  syllabusVersion: "2021" | "2025";
};

const chemistry = (
  id: string,
  label: string,
  parentId: string | null,
): IBDPTopic => ({
  id,
  label,
  parentId,
  subject: "chemistry",
  syllabusVersion: "2025",
});

const physics = (
  id: string,
  label: string,
  parentId: string | null,
): IBDPTopic => ({
  id,
  label,
  parentId,
  subject: "physics",
  syllabusVersion: "2025",
});

const mathematics = (
  id: string,
  label: string,
  parentId: string | null,
): IBDPTopic => ({
  id,
  label,
  parentId,
  subject: "mathematics",
  syllabusVersion: "2021",
});

export const IBDP_TOPICS: IBDPTopic[] = [
  chemistry("chemistry.structure", "Structure", null),
  chemistry(
    "chemistry.structure.models",
    "Structure 1: Models of the particulate nature of matter",
    "chemistry.structure",
  ),
  chemistry(
    "chemistry.structure.models.particulate-introduction",
    "Structure 1.1: Introduction to the particulate nature of matter",
    "chemistry.structure.models",
  ),
  chemistry(
    "chemistry.structure.models.nuclear-atom",
    "Structure 1.2: The nuclear atom",
    "chemistry.structure.models",
  ),
  chemistry(
    "chemistry.structure.models.electron-configurations",
    "Structure 1.3: Electron configurations",
    "chemistry.structure.models",
  ),
  chemistry(
    "chemistry.structure.models.mole",
    "Structure 1.4: Counting particles by mass — the mole",
    "chemistry.structure.models",
  ),
  chemistry(
    "chemistry.structure.models.ideal-gases",
    "Structure 1.5: Ideal gases",
    "chemistry.structure.models",
  ),

  chemistry(
    "chemistry.structure.bonding",
    "Structure 2: Models of bonding and structure",
    "chemistry.structure",
  ),
  chemistry(
    "chemistry.structure.bonding.ionic-model",
    "Structure 2.1: The ionic model",
    "chemistry.structure.bonding",
  ),
  chemistry(
    "chemistry.structure.bonding.covalent-model",
    "Structure 2.2: The covalent model",
    "chemistry.structure.bonding",
  ),
  chemistry(
    "chemistry.structure.bonding.metallic-model",
    "Structure 2.3: The metallic model",
    "chemistry.structure.bonding",
  ),
  chemistry(
    "chemistry.structure.bonding.materials",
    "Structure 2.4: From models to materials",
    "chemistry.structure.bonding",
  ),

  chemistry(
    "chemistry.structure.classification",
    "Structure 3: Classification of matter",
    "chemistry.structure",
  ),
  chemistry(
    "chemistry.structure.classification.periodic-table",
    "Structure 3.1: The periodic table — classification of elements",
    "chemistry.structure.classification",
  ),
  chemistry(
    "chemistry.structure.classification.functional-groups",
    "Structure 3.2: Functional groups — classification of organic compounds",
    "chemistry.structure.classification",
  ),

  chemistry("chemistry.reactivity", "Reactivity", null),
  chemistry(
    "chemistry.reactivity.driving-reactions",
    "Reactivity 1: What drives chemical reactions?",
    "chemistry.reactivity",
  ),
  chemistry(
    "chemistry.reactivity.driving-reactions.enthalpy",
    "Reactivity 1.1: Measuring enthalpy changes",
    "chemistry.reactivity.driving-reactions",
  ),
  chemistry(
    "chemistry.reactivity.driving-reactions.energy-cycles",
    "Reactivity 1.2: Energy cycles in reactions",
    "chemistry.reactivity.driving-reactions",
  ),
  chemistry(
    "chemistry.reactivity.driving-reactions.fuels",
    "Reactivity 1.3: Energy from fuels",
    "chemistry.reactivity.driving-reactions",
  ),
  chemistry(
    "chemistry.reactivity.driving-reactions.entropy-spontaneity",
    "Reactivity 1.4: Entropy and spontaneity",
    "chemistry.reactivity.driving-reactions",
  ),

  chemistry(
    "chemistry.reactivity.amount-rate-extent",
    "Reactivity 2: How much, how fast and how far?",
    "chemistry.reactivity",
  ),
  chemistry(
    "chemistry.reactivity.amount-rate-extent.amount",
    "Reactivity 2.1: The amount of chemical change",
    "chemistry.reactivity.amount-rate-extent",
  ),
  chemistry(
    "chemistry.reactivity.amount-rate-extent.rate",
    "Reactivity 2.2: The rate of chemical change",
    "chemistry.reactivity.amount-rate-extent",
  ),
  chemistry(
    "chemistry.reactivity.amount-rate-extent.extent",
    "Reactivity 2.3: The extent of chemical change",
    "chemistry.reactivity.amount-rate-extent",
  ),

  chemistry(
    "chemistry.reactivity.mechanisms",
    "Reactivity 3: What are the mechanisms of chemical change?",
    "chemistry.reactivity",
  ),
  chemistry(
    "chemistry.reactivity.mechanisms.proton-transfer",
    "Reactivity 3.1: Proton transfer reactions",
    "chemistry.reactivity.mechanisms",
  ),
  chemistry(
    "chemistry.reactivity.mechanisms.electron-transfer",
    "Reactivity 3.2: Electron transfer reactions",
    "chemistry.reactivity.mechanisms",
  ),
  chemistry(
    "chemistry.reactivity.mechanisms.electron-sharing",
    "Reactivity 3.3: Electron sharing reactions",
    "chemistry.reactivity.mechanisms",
  ),
  chemistry(
    "chemistry.reactivity.mechanisms.electron-pair-sharing",
    "Reactivity 3.4: Electron-pair sharing reactions",
    "chemistry.reactivity.mechanisms",
  ),

  physics(
    "physics.a.space-time-motion",
    "Theme A: Space, time and motion",
    null,
  ),
  physics(
    "physics.a.kinematics",
    "A.1 Kinematics",
    "physics.a.space-time-motion",
  ),
  physics(
    "physics.a.forces-momentum",
    "A.2 Forces and momentum",
    "physics.a.space-time-motion",
  ),
  physics(
    "physics.a.work-energy-power",
    "A.3 Work, energy and power",
    "physics.a.space-time-motion",
  ),
  physics(
    "physics.a.rigid-body-mechanics",
    "A.4 Rigid body mechanics",
    "physics.a.space-time-motion",
  ),
  physics(
    "physics.a.relativity",
    "A.5 Galilean and special relativity",
    "physics.a.space-time-motion",
  ),

  physics(
    "physics.b.particulate-matter",
    "Theme B: The particulate nature of matter",
    null,
  ),
  physics(
    "physics.b.thermal-energy-transfers",
    "B.1 Thermal energy transfers",
    "physics.b.particulate-matter",
  ),
  physics(
    "physics.b.particulate-matter.specific-latent-heat",
    "Specific latent heat",
    "physics.b.thermal-energy-transfers",
  ),
  physics(
    "physics.b.greenhouse-effect",
    "B.2 Greenhouse effect",
    "physics.b.particulate-matter",
  ),
  physics(
    "physics.b.gas-laws",
    "B.3 Gas laws",
    "physics.b.particulate-matter",
  ),
  physics(
    "physics.b.thermodynamics",
    "B.4 Thermodynamics",
    "physics.b.particulate-matter",
  ),
  physics(
    "physics.b.current-circuits",
    "B.5 Current and circuits",
    "physics.b.particulate-matter",
  ),

  physics(
    "physics.c.wave-behaviour",
    "Theme C: Wave behaviour",
    null,
  ),
  physics(
    "physics.c.simple-harmonic-motion",
    "C.1 Simple harmonic motion",
    "physics.c.wave-behaviour",
  ),
  physics(
    "physics.c.wave-model",
    "C.2 Wave model",
    "physics.c.wave-behaviour",
  ),
  physics(
    "physics.c.wave-phenomena",
    "C.3 Wave phenomena",
    "physics.c.wave-behaviour",
  ),
  physics(
    "physics.c.standing-waves-resonance",
    "C.4 Standing waves and resonance",
    "physics.c.wave-behaviour",
  ),
  physics(
    "physics.c.doppler-effect",
    "C.5 Doppler effect",
    "physics.c.wave-behaviour",
  ),

  physics("physics.d.fields", "Theme D: Fields", null),
  physics(
    "physics.d.gravitational-fields",
    "D.1 Gravitational fields",
    "physics.d.fields",
  ),
  physics(
    "physics.d.electric-magnetic-fields",
    "D.2 Electric and magnetic fields",
    "physics.d.fields",
  ),
  physics(
    "physics.d.motion-electromagnetic-fields",
    "D.3 Motion in electromagnetic fields",
    "physics.d.fields",
  ),
  physics(
    "physics.d.induction",
    "D.4 Induction",
    "physics.d.fields",
  ),

  physics(
    "physics.e.nuclear-quantum",
    "Theme E: Nuclear and quantum physics",
    null,
  ),
  physics(
    "physics.e.atomic-structure",
    "E.1 Structure of the atom",
    "physics.e.nuclear-quantum",
  ),
  physics(
    "physics.e.quantum-physics",
    "E.2 Quantum physics",
    "physics.e.nuclear-quantum",
  ),
  physics(
    "physics.e.radioactive-decay",
    "E.3 Radioactive decay",
    "physics.e.nuclear-quantum",
  ),
  physics(
    "physics.e.fission",
    "E.4 Fission",
    "physics.e.nuclear-quantum",
  ),
  physics(
    "physics.e.fusion-stars",
    "E.5 Fusion and stars",
    "physics.e.nuclear-quantum",
  ),

  mathematics(
    "mathematics.number-algebra",
    "Topic 1: Number and algebra",
    null,
  ),
  mathematics(
    "mathematics.number-algebra.sequences-series",
    "Sequences and series",
    "mathematics.number-algebra",
  ),
  mathematics(
    "mathematics.number-algebra.exponents-logarithms",
    "Exponents and logarithms",
    "mathematics.number-algebra",
  ),
  mathematics(
    "mathematics.number-algebra.proof",
    "Proof",
    "mathematics.number-algebra",
  ),
  mathematics(
    "mathematics.number-algebra.binomial-counting",
    "Binomial theorem and counting principles",
    "mathematics.number-algebra",
  ),
  mathematics(
    "mathematics.number-algebra.complex-numbers",
    "Complex numbers",
    "mathematics.number-algebra",
  ),
  mathematics(
    "mathematics.number-algebra.linear-systems",
    "Systems of linear equations",
    "mathematics.number-algebra",
  ),
  mathematics(
    "mathematics.number-algebra.partial-fractions",
    "Partial fractions",
    "mathematics.number-algebra",
  ),

  mathematics("mathematics.functions", "Topic 2: Functions", null),
  mathematics(
    "mathematics.functions.lines",
    "Straight lines",
    "mathematics.functions",
  ),
  mathematics(
    "mathematics.functions.domain-range-inverses",
    "Domain, range, composite and inverse functions",
    "mathematics.functions",
  ),
  mathematics(
    "mathematics.functions.graphs-transformations",
    "Graphs and transformations",
    "mathematics.functions",
  ),
  mathematics(
    "mathematics.functions.quadratics",
    "Quadratic functions",
    "mathematics.functions",
  ),
  mathematics(
    "mathematics.functions.exponential-logarithmic",
    "Exponential and logarithmic functions",
    "mathematics.functions",
  ),
  mathematics(
    "mathematics.functions.polynomial-rational",
    "Polynomial and rational functions",
    "mathematics.functions",
  ),
  mathematics(
    "mathematics.functions.equations-inequalities",
    "Equations and inequalities",
    "mathematics.functions",
  ),

  mathematics(
    "mathematics.geometry-trigonometry",
    "Topic 3: Geometry and trigonometry",
    null,
  ),
  mathematics(
    "mathematics.geometry-trigonometry.trigonometry",
    "Trigonometry",
    "mathematics.geometry-trigonometry",
  ),
  mathematics(
    "mathematics.geometry-trigonometry.vectors",
    "Vectors",
    "mathematics.geometry-trigonometry",
  ),
  mathematics(
    "mathematics.geometry-trigonometry.geometry",
    "Geometry",
    "mathematics.geometry-trigonometry",
  ),

  mathematics(
    "mathematics.statistics-probability",
    "Topic 4: Statistics and probability",
    null,
  ),
  mathematics(
    "mathematics.statistics-probability.descriptive-statistics",
    "Descriptive statistics",
    "mathematics.statistics-probability",
  ),
  mathematics(
    "mathematics.statistics-probability.probability",
    "Probability",
    "mathematics.statistics-probability",
  ),
  mathematics(
    "mathematics.statistics-probability.distributions",
    "Probability distributions",
    "mathematics.statistics-probability",
  ),
  mathematics(
    "mathematics.statistics-probability.sampling-testing",
    "Sampling and hypothesis testing",
    "mathematics.statistics-probability",
  ),

  mathematics("mathematics.calculus", "Topic 5: Calculus", null),
  mathematics(
    "mathematics.calculus.limits",
    "Limits",
    "mathematics.calculus",
  ),
  mathematics(
    "mathematics.calculus.differentiation",
    "Differentiation",
    "mathematics.calculus",
  ),
  mathematics(
    "mathematics.calculus.differentiation-applications",
    "Applications of differentiation",
    "mathematics.calculus",
  ),
  mathematics(
    "mathematics.calculus.integration",
    "Integration",
    "mathematics.calculus",
  ),
  mathematics(
    "mathematics.calculus.differential-equations",
    "Differential equations",
    "mathematics.calculus",
  ),
  mathematics(
    "mathematics.calculus.series",
    "Series and calculus extensions",
    "mathematics.calculus",
  ),
  mathematics(
    "mathematics.problem-solving",
    "Mathematical exploration and problem-solving skills",
    null,
  ),
];

export function findIBDPTopic(
  topicId: string,
): IBDPTopic | undefined {
  return IBDP_TOPICS.find(({ id }) => id === topicId);
}


export function topicIdWithAncestors(
  topicId: string,
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  let current = findIBDPTopic(topicId);

  while (current && !visited.has(current.id)) {
    result.push(current.id);
    visited.add(current.id);
    current = current.parentId
      ? findIBDPTopic(current.parentId)
      : undefined;
  }

  return result;
}

export function expandIBDPTopicIds(
  topicIds: string[],
): string[] {
  return [
    ...new Set(
      topicIds.flatMap((topicId) =>
        topicIdWithAncestors(topicId),
      ),
    ),
  ];
}
