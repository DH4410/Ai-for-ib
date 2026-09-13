export type Subject = "physics" | "chemistry" | "mathematics";

export type StudyMode = "learn" | "practice" | "mark" | "revise";

export type SourceChunk = {
  id: string;
  title: string;
  locator?: string;
  text: string;
  score?: number;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type TutorRequest = {
  subject: Subject;
  mode: StudyMode;
  message: string;
  history?: ChatTurn[];
};

export type TutorResponse = {
  answer: string;
  sources: Array<Pick<SourceChunk, "id" | "title" | "locator">>;
  model: string;
};
