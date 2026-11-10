declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    /** Shared last-successful public event feed, provisioned by Sites. */
    BUCKET?: R2Bucket;
  }
}
