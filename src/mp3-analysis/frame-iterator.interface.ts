import { FrameInfo } from "./frame-info";

/**
 * Interface for iterating through MP3 frames
 * Abstracts frame traversal logic from analysis logic
 */
export interface IFrameIterator {
  /**
   * Gets the next frame from the iterator
   * @returns Promise that resolves to FrameInfo if a frame is found, null if no more frames
   */
  next(): Promise<FrameInfo | null> | FrameInfo | null;

  /**
   * Checks if there are more frames to iterate
   * @returns true if more frames are available
   */
  hasNext(): boolean;

  /**
   * Resets the iterator to the beginning
   * Note: May throw an error for streams that cannot be reset
   */
  reset(): void;
}

