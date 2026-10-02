import { z } from 'zod';
import { OpenRouterService } from './openRouterService.js';

export const VisionBoundingBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(0),
  height: z.number().min(0)
});

export const VisionElementTypeSchema = z.enum([
  'button',
  'input',
  'text',
  'link',
  'window',
  'menu',
  'icon',
  'other'
]);

export const VisionElementSchema = z.object({
  id: z.string().min(1),
  type: VisionElementTypeSchema,
  label: z.string().optional(),
  boundingBox: VisionBoundingBoxSchema.optional(),
  confidence: z.number().min(0).max(1)
});

export const VisionAnalysisResultSchema = z.object({
  screenDescription: z.string().min(1),
  elements: z.array(VisionElementSchema),
  status: z.enum(['ok', 'warning', 'unavailable']).default('ok'),
  requiresConfirmation: z.boolean().default(false),
  source: z.string().optional()
});

export type VisionBoundingBox = z.infer<typeof VisionBoundingBoxSchema>;
export type VisionElementType = z.infer<typeof VisionElementTypeSchema>;
export type VisionElement = z.infer<typeof VisionElementSchema>;
export type VisionAnalysisResult = z.infer<typeof VisionAnalysisResultSchema>;

export type ScreenshotPayload = {
  mimeType: string;
  data: string | Uint8Array | Buffer;
  width?: number;
  height?: number;
  source?: string;
  filename?: string;
};

export interface VisionModel {
  analyzeImage(screenshot: ScreenshotPayload): Promise<VisionAnalysisResult>;
}

function normalizeScreenshot(screenshot: ScreenshotPayload): ScreenshotPayload {
  if (!screenshot || typeof screenshot !== 'object') {
    throw new Error('A valid screenshot payload is required.');
  }

  if (!screenshot.mimeType || !screenshot.data) {
    throw new Error('Screenshot payload is missing image data or mime type.');
  }

  const mimeType = screenshot.mimeType.toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new Error('Provided screenshot must be an image payload.');
  }

  const normalizedData = typeof screenshot.data === 'string' ? screenshot.data : Buffer.from(screenshot.data).toString('base64');

  return {
    ...screenshot,
    mimeType,
    data: normalizedData,
    source: screenshot.source ?? 'local-agent-screenshot'
  };
}

export class OpenRouterVisionModel implements VisionModel {
  constructor(private readonly provider = new OpenRouterService()) {}

  async analyzeImage(screenshot: ScreenshotPayload): Promise<VisionAnalysisResult> {
    const normalized = normalizeScreenshot(screenshot);
    const payload = {
      ...normalized,
      data: typeof normalized.data === 'string' ? normalized.data : Buffer.from(normalized.data).toString('base64')
    };

    if (!this.provider.isConfigured()) {
      throw new Error('OpenRouter vision is unavailable because no API key is configured.');
    }

    const response = await this.provider.analyzeImage({
      mimeType: payload.mimeType,
      data: payload.data,
      source: payload.source,
      filename: payload.filename
    });
    return VisionAnalysisResultSchema.parse(response);
  }
}

export class ComputerVisionService {
  constructor(
    private readonly model: VisionModel = new OpenRouterVisionModel(),
    private readonly minConfidence = 0.45
  ) {}

  static validateTargetBounds(element: Pick<VisionElement, 'boundingBox'>, screen: { width: number; height: number }) {
    const box = element.boundingBox;
    if (!box) {
      return { valid: false, reason: 'Element has no bounding box.' };
    }

    if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
      return { valid: false, reason: 'Bounding box coordinates are invalid.' };
    }

    const maxX = box.x + box.width;
    const maxY = box.y + box.height;

    if (maxX > screen.width || maxY > screen.height) {
      return { valid: false, reason: 'Bounding box exceeds screen bounds.' };
    }

    return { valid: true };
  }

  async analyzeScreenshot(screenshot: ScreenshotPayload): Promise<VisionAnalysisResult> {
    const normalized = normalizeScreenshot(screenshot);

    try {
      const result = await this.model.analyzeImage(normalized);
      const safeResult = VisionAnalysisResultSchema.parse(result);
      return {
        ...safeResult,
        elements: safeResult.elements.map((element, index) => ({
          ...element,
          id: element.id || `element-${index}`
        }))
      };
    } catch (error) {
      return {
        screenDescription: error instanceof Error ? error.message : 'Vision analysis could not be completed.',
        elements: [],
        status: 'unavailable',
        requiresConfirmation: true,
        source: normalized.source
      };
    }
  }

  async findElement(
    screenshot: ScreenshotPayload,
    criteria: { type?: VisionElementType; label?: string; minConfidence?: number } = {}
  ): Promise<VisionElement | null> {
    const analysis = await this.analyzeScreenshot(screenshot);

    const matches = analysis.elements.filter((element) => {
      const byType = criteria.type ? element.type === criteria.type : true;
      const byLabel = criteria.label ? (element.label ?? '').toLowerCase().includes(criteria.label.toLowerCase()) : true;
      const byConfidence = typeof criteria.minConfidence === 'number' ? element.confidence >= criteria.minConfidence : true;
      const meetsThreshold = element.confidence >= this.minConfidence;
      return byType && byLabel && byConfidence && meetsThreshold;
    });

    return matches.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  }

  async detectText(screenshot: ScreenshotPayload, pattern?: string) {
    const analysis = await this.analyzeScreenshot(screenshot);
    const elements = analysis.elements.filter((element) => element.type === 'text');
    return pattern ? elements.filter((element) => (element.label ?? '').toLowerCase().includes(pattern.toLowerCase())) : elements;
  }

  async detectButtons(screenshot: ScreenshotPayload) {
    const analysis = await this.analyzeScreenshot(screenshot);
    return analysis.elements.filter((element) => element.type === 'button');
  }

  async detectWindows(screenshot: ScreenshotPayload) {
    const analysis = await this.analyzeScreenshot(screenshot);
    return analysis.elements.filter((element) => element.type === 'window');
  }

  async detectInputFields(screenshot: ScreenshotPayload) {
    const analysis = await this.analyzeScreenshot(screenshot);
    return analysis.elements.filter((element) => element.type === 'input');
  }

  async describeScreen(screenshot: ScreenshotPayload) {
    const analysis = await this.analyzeScreenshot(screenshot);
    return analysis.screenDescription;
  }

  validateActionTarget(
    element: VisionElement,
    screen: { width: number; height: number },
    minConfidence = this.minConfidence
  ) {
    if (element.confidence < minConfidence) {
      return { valid: false, reason: `Confidence ${element.confidence} is below required threshold ${minConfidence}.` };
    }

    const boundsCheck = ComputerVisionService.validateTargetBounds(element, screen);
    if (!boundsCheck.valid) {
      return { valid: false, reason: boundsCheck.reason };
    }

    return { valid: true, element };
  }
}

export class ComputerVisionLoop {
  constructor(
    private readonly service: ComputerVisionService,
    private readonly maxSteps = Number(process.env.MAX_AGENT_STEPS ?? 20)
  ) {}

  async run<T>(
    initial: T,
    step: (state: T, index: number) => Promise<{ nextState: T; shouldContinue: boolean; reason?: string; completed?: boolean }>
  ) {
    let state = initial;
    let stepIndex = 0;

    while (stepIndex < this.maxSteps) {
      const result = await step(state, stepIndex);
      state = result.nextState;

      if (result.completed || !result.shouldContinue) {
        return {
          completed: Boolean(result.completed),
          state,
          stepIndex: stepIndex + 1,
          reason: result.reason ?? 'Step completed.'
        };
      }

      stepIndex += 1;
    }

    return {
      completed: false,
      state,
      stepIndex,
      reason: 'Maximum computer vision loop steps reached.'
    };
  }
}
