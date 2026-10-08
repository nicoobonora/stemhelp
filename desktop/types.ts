export interface SourceRef { documentId: string; from: number; to: number }
export interface Part { id: string; label: string; checked: boolean }
export interface Topic { id: string; parentId: string | null; title: string; description: string; origin: 'program' | 'slides' | 'proposal'; parts: Part[]; sources: SourceRef[] }
export interface Course { id: string; title: string; description: string; syllabus: string; updatedAt: string; syllabusUrl?: string; fetchedAt?: string }
export interface Document { id: string; courseId: string; name: string; kind: 'pdf' | 'note'; pages: number; hash: string; addedAt: string; emptyPages: number }
export interface Page { documentId: string; number: number; text: string }
export interface TreeDraft { nodes: Topic[]; notes: string; revision: number; createdAt: string }
export interface CourseDetail { course: Course; documents: Document[]; tree: Topic[]; draft: TreeDraft | null; revision: number; treeStale: boolean }
export interface Question { id: string; kind: 'mcq' | 'exercise'; prompt: string; options: string[]; answer: number | null; solution: string; rubric: string; sources: SourceRef[] }
export interface Grade { questionId: string; score: number; feedback: string }
export interface Quiz { id: string; courseId: string; topicId: string; title: string; createdAt: string; status: 'draft' | 'submitted'; questions: Question[]; answers: Record<string, string>; grades: Grade[]; submittedAt?: string; warning: string; gradingError?: string }
export interface PublicQuestion extends Omit<Question, 'answer' | 'solution' | 'rubric'> { answer?: number | null; solution?: string; rubric?: string }
export interface PublicQuiz extends Omit<Quiz, 'questions'> { questions: PublicQuestion[] }
export interface ChatLine { role: 'user' | 'assistant'; content: string }
export interface AppEvent { type: 'progress' | 'delta'; message?: string; delta?: string; courseId?: string }
