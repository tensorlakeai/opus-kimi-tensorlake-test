import { z } from "zod";
import {
  AttemptPhaseSchema,
  AttemptStatusSchema,
  AttemptViewSchema,
  CommandArraySchema,
  CommandResultSchema,
  CommandsConfigSchema,
  FixtureMetadataSchema,
  FixtureSourceSchema,
  LocalPathSourceSchema,
  NoPatchProposalSchema,
  PatchEditSchema,
  PatchProposalSchema,
  PublicConfigSchema,
  RepairProposalSchema,
  RepoSourceSchema,
  RunListResponseSchema,
  RunStatusSchema,
  RunSummarySchema,
  RunViewSchema,
  StartRunRequestSchema,
  StartRunResponseSchema,
  UploadResponseSchema,
  UploadSourceSchema,
} from "./schemas.js";

export type CommandArray = z.infer<typeof CommandArraySchema>;
export type CommandsConfig = z.infer<typeof CommandsConfigSchema>;
export type FixtureSource = z.infer<typeof FixtureSourceSchema>;
export type LocalPathSource = z.infer<typeof LocalPathSourceSchema>;
export type UploadSource = z.infer<typeof UploadSourceSchema>;
export type RepoSource = z.infer<typeof RepoSourceSchema>;
export type StartRunRequest = z.infer<typeof StartRunRequestSchema>;
export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;
export type PatchEdit = z.infer<typeof PatchEditSchema>;
export type PatchProposal = z.infer<typeof PatchProposalSchema>;
export type NoPatchProposal = z.infer<typeof NoPatchProposalSchema>;
export type RepairProposal = z.infer<typeof RepairProposalSchema>;
export type FixtureMetadata = z.infer<typeof FixtureMetadataSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type AttemptPhase = z.infer<typeof AttemptPhaseSchema>;
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type AttemptView = z.infer<typeof AttemptViewSchema>;
export type RunView = z.infer<typeof RunViewSchema>;
export type RunSummary = z.infer<typeof RunSummarySchema>;
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type RunListResponse = z.infer<typeof RunListResponseSchema>;
