export type MemoryKind =
  | 'user-preference'
  | 'project-context'
  | 'important-fact'
  | 'previous-task'
  | 'instruction';

export type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveMemoryInput = {
  kind: MemoryKind;
  title: string;
  content: string;
  sensitive?: boolean;
};
