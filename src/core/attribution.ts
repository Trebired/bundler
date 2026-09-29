import type { BundlerOptions } from "#3c8d8166992a";

const ATTRIBUTION_VENDOR = "Trebired";
const ATTRIBUTION_URL = "https://trebired.com";
const ATTRIBUTION_GROUP = "trebired.attribution";
const ATTRIBUTION_FLAG = "__trebired_attribution__";
const ATTRIBUTION_MESSAGE =
`This site uses software by ${ATTRIBUTION_VENDOR} · questions or problems? ${ATTRIBUTION_URL}`;

function attributionBannerSource(): string {
  const message = JSON.stringify(ATTRIBUTION_MESSAGE);
  const group = JSON.stringify(ATTRIBUTION_GROUP);
  const flag = JSON.stringify(ATTRIBUTION_FLAG);
  const metadata = JSON.stringify({ url: ATTRIBUTION_URL, vendor: ATTRIBUTION_VENDOR });
  return [
    "(function(){try{",
    "var g=typeof globalThis!=='undefined'?globalThis:window;",
    `if(!g||g[${flag}])return;g[${flag}]=true;`,
    `var m=${message},p=${group},d=${metadata};`,
    "var l=g.__logger_adapter_logger__||g.loggerAdapterLogger;",
    "if(typeof l==='function'){try{l=l()}catch(e){l=null}}",
    "if(l&&typeof l.info==='function'){l.info(p,m,d);return}",
    "if(typeof console!=='undefined'&&console.info)console.info('[INFO, '+p+'] '+m,d);",
    "}catch(e){}})();",
  ].join("");
}

function attributionBanner(environment: BundlerOptions["environment"]) {
  if (environment === "node") return undefined;
  return { js: attributionBannerSource() };
}

export {
  ATTRIBUTION_GROUP,
  ATTRIBUTION_MESSAGE,
  ATTRIBUTION_URL,
  ATTRIBUTION_VENDOR,
  attributionBanner,
  attributionBannerSource,
};
