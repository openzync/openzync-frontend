Show a degraded banner in the playground when ingest returns 409, reusing the returned job_id with a disambiguating suffix so the stuck upload can be retried without losing context.
