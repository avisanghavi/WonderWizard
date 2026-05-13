// Shared Express request augmentation.
import type { Request } from "express";

export interface AuthRequest extends Request {
  parentId?: string;
}
