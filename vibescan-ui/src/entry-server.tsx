import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App";
import { resetRenderedMeta, takeRenderedMeta } from "./lib/meta";

export function render(url: string) {
  resetRenderedMeta();
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
  return { html, meta: takeRenderedMeta() };
}
