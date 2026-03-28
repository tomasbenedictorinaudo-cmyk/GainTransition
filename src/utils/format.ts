export function formatDb(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)} dB`;
}

export function formatDbm(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)} dBm`;
}

export function formatFreq(mhz: number): string {
  if (mhz >= 1000) {
    return `${(mhz / 1000).toFixed(2)} GHz`;
  }
  return `${mhz} MHz`;
}
