export type Subject = "physics" | "chemistry" | "mathematics";

export type StudyMode = "learn" | "practice" | "mark" | "revise";

export type PastPaperPairingStatus =
  | "paired"
  | "question_only"
  | "ambiguous";

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
  year?: number;
  level?: "HL" | "SL";
  session?: "may" | "november";
  timezone?: string;
  paper?: string;
  questionNumber?: string;
  marks?: number | null;
  markschemeAvailable?: boolean;
  pairingStatus?: PastPaperPairingStatus;
  visualContextRequired?: boolean;
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

export type SourceCitation = Pick<
  SourceChunk,
  | "id"
  | "title"
  | "locator"
  | "documentType"
  | "topicIds"
  | "pageStart"
  | "pageEnd"
  | "year"
  | "level"
  | "session"
  | "timezone"
  | "paper"
  | "questionNumber"
  | "marks"
  | "markschemeAvailable"
  | "pairingStatus"
  | "visualContextRequired"
>;

export type TutorResponse = {
  answer: string;
  sources: SourceCitation[];
  model: string;
};
