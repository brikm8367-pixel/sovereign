import { describe, expect, it } from 'vitest';
import { ComputerVisionService, VisionAnalysisResultSchema, VisionElementSchema } from '../src/services/computerVisionService.js';

describe('Computer Vision Service', () => {
  it('validates the structured vision schema', () => {
    const result = VisionAnalysisResultSchema.parse({
      screenDescription: 'Desktop with Chrome open',
      elements: [
        {
          id: 'search-box',
          type: 'input',
          label: 'Search or type a URL',
          boundingBox: { x: 150, y: 120, width: 320, height: 36 },
          confidence: 0.92
        }
      ],
      status: 'ok',
      requiresConfirmation: false,
      source: 'mock-screenshot'
    });

    expect(result.elements[0].type).toBe('input');
  });

  it('rejects invalid coordinates', () => {
    const parsed = VisionElementSchema.safeParse({
      id: 'bad-box',
      type: 'button',
      label: 'Bad',
      boundingBox: { x: -2, y: 10, width: 5, height: 10 },
      confidence: 0.75
    });

    expect(parsed.success).toBe(false);
  });

  it('enforces a confidence threshold for actions', () => {
    const service = new ComputerVisionService();
    const validation = service.validateActionTarget(
      { id: 'low-confidence', type: 'button', label: 'Submit', confidence: 0.2, boundingBox: { x: 5, y: 5, width: 10, height: 10 } },
      { width: 1920, height: 1080 },
      0.45
    );

    expect(validation.valid).toBe(false);
  });

  it('rejects missing element analysis', async () => {
    const service = new ComputerVisionService();
    const result = await service.analyzeScreenshot({
      mimeType: 'image/png',
      data: 'invalid-data'
    });

    expect(result.status).toBe('unavailable');
    expect(result.requiresConfirmation).toBe(true);
  });
});
