import { Request, Response } from 'express';
import { openapiService } from './openapi.service.js';

export const openapiController = {
  preview: async (req: Request, res: Response) => {
    try {
      const { rawContent, url, projectId } = req.body;
      if (!projectId) {
        return res.status(400).json({ message: 'projectId is required' });
      }
      const preview = await openapiService.previewSpec({ rawContent, url, projectId });
      return res.json(preview);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Failed to parse OpenAPI specification' });
    }
  },

  importSpec: async (req: Request, res: Response) => {
    try {
      const { projectId, endpoints } = req.body;
      if (!projectId || !Array.isArray(endpoints)) {
        return res.status(400).json({ message: 'projectId and endpoints array are required' });
      }
      const result = await openapiService.applyImport(projectId, endpoints);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Failed to apply OpenAPI import' });
    }
  },
};

