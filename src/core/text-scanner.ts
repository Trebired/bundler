type TextScannerState = {
  escaping: boolean;
  inBlockComment: boolean;
  inLineComment: boolean;
  inString: boolean;
  quote: string;
};

function createTextScannerState(): TextScannerState {
  return {
    escaping: false,
    inBlockComment: false,
    inLineComment: false,
    inString: false,
    quote: "",
  };
}

export { createTextScannerState };
export type { TextScannerState };
