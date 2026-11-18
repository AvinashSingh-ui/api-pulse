import { Request, Response } from 'express';
import { openapiService, ImportFormat } from './openapi.service.js';

export const openapiController = {
  preview: async (req: Request, res: Response) => {
    try {
      const { rawContent, url, projectId, format } = req.body;
      const preview = await openapiService.previewSpec({
        rawContent,
        url,
        projectId: projectId || undefined,
        format: format as ImportFormat,
      });
      return res.json(preview);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Failed to parse API specification or routes' });
    }
  },

  importSpec: async (req: Request, res: Response) => {
    try {
      const { projectId, endpoints, newProjectData } = req.body;
      if ((!projectId && !newProjectData) || !Array.isArray(endpoints)) {
        return res.status(400).json({
          message: 'Either projectId or newProjectData, along with an endpoints array, is required',
        });
      }
      const result = await openapiService.applyImport(projectId, endpoints, newProjectData);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Failed to apply API import' });
    }
  },
};
