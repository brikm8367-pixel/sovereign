import { z } from 'zod';

export const BrowserSessionStatusSchema = z.enum(['starting', 'ready', 'busy', 'error', 'closed']);

export const BrowserToolInputSchema = z.object({
  url: z.string().url().optional(),
  query: z.string().min(1).max(200).optional(),
  selector: z.string().min(1).max(500).optional(),
  text: z.string().max(5000).optional(),
  key: z.string().min(1).max(50).optional(),
  path: z.string().max(500).optional()
});

export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatusSchema>;

export type BrowserSession = {
  sessionId: string;
  status: BrowserSessionStatus;
  currentUrl: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type BrowserActionResult = {
  ok: boolean;
  status: 'success' | 'error' | 'cancelled';
  message: string;
  url?: string;
  title?: string;
  text?: string;
  links?: Array<{ text: string; href: string }>;
  path?: string;
  sessionId?: string;
  error?: { code: string; message: string };
};
