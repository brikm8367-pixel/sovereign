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
