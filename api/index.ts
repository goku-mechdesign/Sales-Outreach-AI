import serverless from "serverless-http";
import app from "../artifacts/api-server/src/app";

const handler = serverless(app);

export default handler;
