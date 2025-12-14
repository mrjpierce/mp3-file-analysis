/**
 * Common MP3 constants shared across all MP3 format types
 */
export const COMMON_MP3_CONSTANTS = {
  SYNC_BYTE: 0xff,
  SYNC_MASK: 0xe0,
  ID3V2_MAGIC: [0x49, 0x44, 0x33] as const, // "ID3"
  ID3V2_HEADER_SIZE: 10,
  FRAME_HEADER_SIZE: 4,
  XING_MAGIC: [0x58, 0x69, 0x6e, 0x67] as const, // "Xing"
  INFO_MAGIC: [0x49, 0x6e, 0x66, 0x6f] as const, // "Info"
  VBRI_MAGIC: [0x56, 0x42, 0x52, 0x49] as const, // "VBRI"
  SIDE_INFO_MONO: 17,
  SIDE_INFO_STEREO: 32,
  CHANNEL_MODE_MONO: 0x03, // Channel mode value for mono
} as const;

/**
 * MPEG-1 Layer 3 specific constants
 */
export const MPEG1_LAYER3_CONSTANTS = {
  MPEG1_VERSION: 0x03,
  LAYER3: 0x01,
  MIN_FRAME_SIZE: 4,
  FRAME_LENGTH_MULTIPLIER: 144, // Used in frame length calculation: (144 * bitrate) / sampleRate
} as const;

export const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
] as const;

export const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0] as const;
