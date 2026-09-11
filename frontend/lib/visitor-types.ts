export type VisitorSlate = { id: string; name: string; createdAt: string; slot: number; page: number };
export type VisitorPage = {
  slates: VisitorSlate[]; page: number; pageSize: number; lastPage: number; total: number;
  own: VisitorSlate | null; alreadyVisited: boolean;
};
