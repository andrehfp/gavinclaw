export type ArtifactKind = 'text' | 'code';

export type ArtifactStatus = 'active' | 'archived';

export type ArtifactSummary = {
  id: string;
  conversationId: string;
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  latestVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type ArtifactDetail = ArtifactSummary & {
  content: string | null;
};

export type ArtifactVersion = {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  changeSummary: string | null;
  createdAt: number;
};
