Cap playground ingest uploads at 10 files and 200 MB total (per-file 50 MB kept) with a clear error, and wire an AbortController through `uploadWithBlobs` so in-flight uploads can be cancelled.
