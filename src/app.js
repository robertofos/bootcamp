import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import Youch from "youch";
import * as Sentry from "@sentry/node";
import "express-async-errors";

import routes from "./routes";
import sentryConfig from "./config/sentry";

import "./database";

class App {
  constructor() {
    this.server = express();
    // aa
    Sentry.init(sentryConfig);

    this.middlewares();
    this.routes();
    this.exceptionHandler();
  }

  middlewares() {
    this.server.use(Sentry.Handlers.requestHandler());
    this.server.use(cors());
    this.server.use(express.json());
    // trata a questão do arquivo para apresentar na tela
    this.server.use(
      "/files",
      express.static(path.resolve(__dirname, "..", "tmp", "uploads"))
    );
  }

  routes() {
    this.server.use(routes);
    this.server.use(Sentry.Handlers.errorHandler());
  }

  exceptionHandler() {
    this.server.use(async (err, req, res, next) => {
      if (process.env.NODE_DV === "development") {
        const errors = await new Youch(err, req).toJSON();

        return res.status(500).json(errors);
      }

      return res.status(500).json({ error: "Internal server error" });
    });
  }
}
// importa o server
export default new App().server;
