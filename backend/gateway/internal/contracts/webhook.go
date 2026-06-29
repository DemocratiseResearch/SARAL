package contracts

import redisx "github.com/saral/gateway/internal/redis"


type WorkerUpdate struct {
	RunID         string `json:"run_id"`
	StepID        string `json:"step_id"`
	StepName      string `json:"step_name"`
	Status        string `json:"status"`          // "processing", "completed" or "failed"
	GCSOutputPath string `json:"gcs_output_path"` // set on completed, empty on failed

	GCSOutputPathWithSubs string `json:"gcs_output_path_with_subs,omitempty"`

	CompileVersion int64                  `json:"compile_version,omitempty"`
	ErrorMessage   string                 `json:"error_message"` // set on failed, empty on completed
	NextStep              string                 `json:"next_step"`     // empty string = pipeline done
	NextJobData           redisx.JobData         `json:"next_job_data"`
	// Metadata fields populated by script-gen worker (paper→video pipeline only)
	PaperTitle   string `json:"paper_title,omitempty"`
	PaperAuthors string `json:"paper_authors,omitempty"`
	PaperDate    string `json:"paper_date,omitempty"`
	// Business brief fields — populated when step_name == "business_brief"
	BriefID      string            `json:"brief_id,omitempty"`
	Sections     map[string]string `json:"sections,omitempty"`
	ModelVersion string            `json:"model_version,omitempty"`
	JSONGCSPath  string            `json:"json_gcs_path,omitempty"`
	PDFGCSPath   string            `json:"pdf_gcs_path,omitempty"`
}
