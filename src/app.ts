import cors from "cors";
import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { createOrdersRouter } from "./routes/orders.routes";
import { createPrintOptionsRouter } from "./routes/printOptions.routes";
import { MemoryStore } from "./store/memoryStore";

export interface AppInstance {
  app: Express;
  store: MemoryStore;
}

export function createApp(existingStore?: MemoryStore): AppInstance {
  const store = existingStore ?? new MemoryStore();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "campusprint-backend",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/print-options", createPrintOptionsRouter(store));
  app.use("/api/orders", createOrdersRouter(store));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, store };
}
