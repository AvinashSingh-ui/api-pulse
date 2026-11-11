import { Request, Response } from 'express';
import { aiService } from './ai.service.js';

export const aiController = {
  getInsights: (req: Request, res: Response) => {
    const { projectId, endpointId, type } = req.query;
    const insights = aiService.getInsights({
      projectId: projectId as string,
      endpointId: endpointId as string,
      type: type as string,
    });
    return res.json(insights);
  },

  analyzeEndpoint: async (req: Request, res: Response) => {
    const { id } = req.params;
    const insights = await aiService.analyzeEndpoint(id);
    return res.json(insights);
  },

  analyzeProject: async (req: Request, res: Response) => {
    const { id } = req.params;
    // Analyze all degraded or down endpoints in project
    const insights = aiService.getInsights({ projectId: id });
    return res.json(insights);
  },

  chat: async (req: Request, res: Response) => {
    const { message, context } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }
    const result = await aiService.chatWithAI(message, context);
    return res.json(result);
  },
};

