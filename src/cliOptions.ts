import { z } from 'zod';

export type CliActionOptions = {
  config?: string;
  agentFile?: string;
  toolsFile?: string;
  resume?: string;
  interactive?: boolean;
  visualizeEvents?: boolean;
  dialogue?: boolean;
  dialogueAgent1?: string;
  dialogueAgent2?: string;
  maxTurns?: number | string;
  stopOnAgreement?: boolean;
  agreementToken?: string;
  telemetryOtlpEndpoint?: string;
  telemetrySourceName?: string;
  telemetryExporterType?: string;
  telemetryFilePath?: string;
  telemetryCaptureContent?: boolean;
};

export type RuntimeCliOptionKey = Exclude<keyof CliActionOptions, 'config'>;

export function defineRuntimeCliConfigShape<T extends { [K in RuntimeCliOptionKey]: z.ZodTypeAny }>(shape: T): T {
  return shape;
}

export const runtimeCliConfigShape = defineRuntimeCliConfigShape({
  agentFile: z.string().min(1).optional(),
  toolsFile: z.string().min(1).optional(),
  resume: z.string().min(1).optional(),
  interactive: z.boolean().optional(),
  visualizeEvents: z.boolean().optional(),
  dialogue: z.boolean().optional(),
  dialogueAgent1: z.string().min(1).optional(),
  dialogueAgent2: z.string().min(1).optional(),
  maxTurns: z.coerce.number().int().min(1).max(200).optional(),
  stopOnAgreement: z.boolean().optional(),
  agreementToken: z.string().min(1).optional(),
  telemetryOtlpEndpoint: z.string().min(1).optional(),
  telemetrySourceName: z.string().min(1).optional(),
  telemetryExporterType: z.string().min(1).optional(),
  telemetryFilePath: z.string().min(1).optional(),
  telemetryCaptureContent: z.boolean().optional(),
});

export const MERGEABLE_OPTION_KEYS = Object.keys(runtimeCliConfigShape) as RuntimeCliOptionKey[];

export const RuntimeCliConfigSchema = z.object(runtimeCliConfigShape).strict();
export type RuntimeCliConfig = z.infer<typeof RuntimeCliConfigSchema>;
