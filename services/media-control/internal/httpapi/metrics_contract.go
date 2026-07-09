package httpapi

const (
	metricNamespace        = "gcs"
	metricSubsystem        = "media_control"
	metricResultHit        = "hit"
	metricResultMiss       = "miss"
	metricResultDegraded   = "degraded"
	metricResultSuccess    = "success"
	metricResultError      = "error"
	metricSourceHTTP       = "http"
	metricSourceStream     = "stream_registry"
	metricSourceIceServers = "ice_servers"
)

var (
	requestDurationBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5}
	iceServerCountBuckets  = []float64{0, 1, 2, 3, 5, 8}
)
