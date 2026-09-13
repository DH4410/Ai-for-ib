import type { Subject } from "@/types/study";

export type IBDPTopic = {
  id: string;
  subject: Subject;
  parentId: string | null;
  label: string;
  syllabusVersion: "2025";
};

export const IBDP_TOPICS: IBDPTopic[] = [
  { id: "chemistry.structure", subject: "chemistry", parentId: null, label: "Structure", syllabusVersion: "2025" },
  { id: "chemistry.structure.models", subject: "chemistry", parentId: "chemistry.structure", label: "Models of particulate nature", syllabusVersion: "2025" },
  { id: "chemistry.structure.bonding", subject: "chemistry", parentId: "chemistry.structure", label: "Models of bonding and structure", syllabusVersion: "2025" },
  { id: "chemistry.structure.classification", subject: "chemistry", parentId: "chemistry.structure", label: "Classification of matter", syllabusVersion: "2025" },
  { id: "chemistry.reactivity", subject: "chemistry", parentId: null, label: "Reactivity", syllabusVersion: "2025" },
  { id: "chemistry.reactivity.driving-reactions", subject: "chemistry", parentId: "chemistry.reactivity", label: "What drives chemical reactions?", syllabusVersion: "2025" },
  { id: "chemistry.reactivity.amount-rate-extent", subject: "chemistry", parentId: "chemistry.reactivity", label: "How much, how fast and how far?", syllabusVersion: "2025" },
  { id: "chemistry.reactivity.mechanisms", subject: "chemistry", parentId: "chemistry.reactivity", label: "What are the mechanisms of chemical change?", syllabusVersion: "2025" },
  { id: "physics.a.space-time-motion", subject: "physics", parentId: null, label: "Theme A: Space, time and motion", syllabusVersion: "2025" },
  { id: "physics.b.particulate-matter", subject: "physics", parentId: null, label: "Theme B: The particulate nature of matter", syllabusVersion: "2025" },
  { id: "physics.b.particulate-matter.specific-latent-heat", subject: "physics", parentId: "physics.b.particulate-matter", label: "Specific latent heat", syllabusVersion: "2025" },
  { id: "physics.c.wave-behaviour", subject: "physics", parentId: null, label: "Theme C: Wave behaviour", syllabusVersion: "2025" },
  { id: "physics.d.fields", subject: "physics", parentId: null, label: "Theme D: Fields", syllabusVersion: "2025" },
  { id: "physics.e.nuclear-quantum", subject: "physics", parentId: null, label: "Theme E: Nuclear and quantum physics", syllabusVersion: "2025" },
  { id: "mathematics.number-algebra", subject: "mathematics", parentId: null, label: "Number and algebra", syllabusVersion: "2025" },
  { id: "mathematics.functions", subject: "mathematics", parentId: null, label: "Functions", syllabusVersion: "2025" },
  { id: "mathematics.geometry-trigonometry", subject: "mathematics", parentId: null, label: "Geometry and trigonometry", syllabusVersion: "2025" },
  { id: "mathematics.statistics-probability", subject: "mathematics", parentId: null, label: "Statistics and probability", syllabusVersion: "2025" },
  { id: "mathematics.calculus", subject: "mathematics", parentId: null, label: "Calculus", syllabusVersion: "2025" },
  { id: "mathematics.problem-solving", subject: "mathematics", parentId: null, label: "Investigation and problem-solving skills", syllabusVersion: "2025" },
];

export function findIBDPTopic(topicId: string): IBDPTopic | undefined {
  return IBDP_TOPICS.find(({ id }) => id === topicId);
}
