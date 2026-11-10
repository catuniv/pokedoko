declare namespace Cloudflare {
  interface Env {
    /** Private anonymous growth counters and feedback; schema is migration-owned. */
    DB?: D1Database;
    /** Shared last-successful public event feed, provisioned by Sites. */
    BUCKET?: R2Bucket;
    /** Standalone Cloudflare deployment alternative when R2 is unavailable. */
    SCHEDULE_CACHE?: KVNamespace;
  }
}
