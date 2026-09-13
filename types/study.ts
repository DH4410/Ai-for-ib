export type Subject = "physics" | "chemistry" | "mathematics";

export type StudyMode = "learn" | "practice" | "mark" | "revise";

export type SourceChunk = {
  id: string;
  title: string;
  locator?: string;
  text: string;
  score?: number;
  documentId?: string;
  documentType?: string;
  subject?: Subject;
  pageStart?: number | null;
  pageEnd?: number | null;
  topicIds?: string[];
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

export type SourceCitation = Pick<SourceChunk, "id" | "title" | "locator" | "documentType" | "topicIds" | "pageStart" | "pageEnd">;

export type TutorResponse = {
  answer: string;
  sources: SourceCitation[];
  model: string;
};
